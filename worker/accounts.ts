// 로그인·공부 자료 저장 서버 (Cloudflare Durable Object 하나 + SQLite).
// 아이디·비밀번호로 가입하고, 공부 자료(묶음 두 개: study·words)와 오답 사진을 계정에 저장해서 어느 기기에서든 같은 걸 쓴다.
// 합치기는 기기에서 하고(src/features/study/merge.ts) 서버는 저장만 한다.
//
// 보안
// - 비밀번호: PBKDF2-SHA256 10만 번 + 사람마다 다른 소금(salt). 원래 비밀번호는 저장하지 않는다.
// - 로그인 유지: 무작위 토큰을 HttpOnly·Secure·SameSite=Strict 쿠키로만 준다 (페이지의 자바스크립트가 읽을 수 없음).
//   서버에는 토큰의 SHA-256 만 저장한다 (저장소가 새어도 토큰을 되살릴 수 없음).
// - 다른 사이트에서 보낸 요청 막기: SameSite=Strict + 바꾸는 요청은 Origin 이 이 사이트인지, 본문이 JSON 인지 확인.
// - 비밀번호 마구 넣어 보기 막기: (아이디, 접속 주소) 마다 5번 틀리면 잠금(점점 길게), 접속 주소(IP)마다 시도 횟수 제한.
//   잠금을 계정 전체에 걸지 않는 것은, 남이 일부러 틀려서 내 계정을 못 쓰게 만들 수 없게 하려는 것.
//   없는 아이디도 똑같이 세고 똑같이 답해서 어떤 아이디가 있는지 알아낼 수 없게 한다.
// - 가입 남용 막기: 접속 주소마다 하루 가입 수 제한 + 서버 전체 시간당 가입 수 제한.
//   (학교처럼 여럿이 한 주소를 같이 쓰는 곳을 생각해 넉넉하게 잡는다)
import { DurableObject } from 'cloudflare:workers';
import { COOKIE_NAME, cutText, Limiter, passwordProblem, readCookie, usernameKey } from './security';
import { buildInput, readOutput, readRequest, TRANSLATE_MODEL } from './translate';

const ITER = 100_000;
const SESSION_DAYS = 90;
/** 남은 기간이 이보다 짧으면 로그인 유지 기간을 다시 늘린다 */
const RENEW_DAYS = 60;
/** 묶음 자료(gzip·base64 글자) 하나의 최대 크기 */
const MAX_STORE = 1_800_000;
/** 사진: 한 장(base64) 최대 크기, 사람마다 최대 장 수 */
const MAX_PHOTO = 700_000;
const MAX_PHOTOS = 300;
const MAX_SMALL_BODY = 4_096;
const USERNAME = /^[A-Za-z0-9_가-힣]{3,16}$/;
const COOKIE = COOKIE_NAME;

const DAY = 86_400_000;
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256);
  return hex(bits);
}

/** 길이가 같을 때 걸리는 시간이 내용에 따라 달라지지 않게 비교 */
function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...extra } });
const fail = (message: string, status = 400) => json({ error: message }, status);

function sessionCookie(token: string, maxAgeSec: number) {
  return `${COOKIE}=${token}; Path=/api; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Strict`;
}
const clearCookie = () => sessionCookie('', 0);


interface UserRow {
  id: string;
  username: string;
  nickname: string;
  salt: string;
  hash: string;
  fails: number;
  locked_until: number;
  [k: string]: SqlStorageValue;
}

export class Accounts extends DurableObject<Env> {
  private sql: SqlStorage;
  private loginByIp = new Limiter(100, 15 * 60_000);
  private signupByIp = new Limiter(30, DAY);
  private signupAll = new Limiter(300, 60 * 60_000);
  private writeByUser = new Limiter(600, 60 * 60_000);
  // 번역: 무료 한도(하루 10,000 뉴런)를 한 사람이 다 쓰지 않게
  private translateByUser = new Limiter(30, 10 * 60_000);
  private translateByUserDay = new Limiter(300, DAY);
  private translateAll = new Limiter(1500, DAY);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, nickname TEXT NOT NULL,
        salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
      CREATE TABLE IF NOT EXISTS blobs (user_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, name));
      CREATE TABLE IF NOT EXISTS login_fails (key TEXT PRIMARY KEY, fails INTEGER NOT NULL, locked_until INTEGER NOT NULL, updated INTEGER NOT NULL);
    `);
  }

  async fetch(req: Request): Promise<Response> {
    try {
      return await this.handle(req);
    } catch (e) {
      console.error('accounts error', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/Exceeded allowed .* free tier/i.test(msg)) return fail('오늘 서버 무료 사용 한도를 다 써서 한국 시간 오전 9시까지 로그인·저장을 쓸 수 없어요.', 503);
      // 안쪽 오류 내용은 밖에 알리지 않는다 (로그에만)
      return fail('서버 오류가 났어요. 잠시 뒤 다시 해 주세요.', 500);
    }
  }

  private async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\//, '');
    const ip = req.headers.get('cf-connecting-ip') ?? 'local';
    const writes = req.method !== 'GET' && req.method !== 'HEAD';

    // 다른 사이트에서 보낸 바꾸는 요청은 받지 않는다
    if (writes) {
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) return fail('허용되지 않은 요청이에요.', 403);
      if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return fail('잘못된 요청이에요.', 415);
    }

    let body: Record<string, unknown> = {};
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      const big = path.startsWith('store/') || path.startsWith('study-photo/');
      const text = await req.text();
      if (text.length > (big ? MAX_STORE + 1000 : path === 'translate' ? 4 * MAX_SMALL_BODY : MAX_SMALL_BODY)) return fail('보낸 내용이 너무 커요.', 413);
      try {
        const parsed: unknown = text ? JSON.parse(text) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('잘못된 요청이에요.');
        body = parsed as Record<string, unknown>;
      } catch {
        return fail('잘못된 요청이에요.');
      }
    }

    if (path === 'auth/signup' && req.method === 'POST') return this.signup(body, ip);
    if (path === 'auth/login' && req.method === 'POST') return this.login(body, ip);

    const session = await this.sessionFrom(req);
    if (path === 'auth/logout' && req.method === 'POST') {
      if (session) this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', session.tokenHash);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
    }
    if (!session) return json({ error: '로그인이 필요해요.' }, 401, { 'set-cookie': clearCookie() });
    // 로그인 유지 기간을 조금씩 늘린다 (자주 쓰면 계속 로그인 상태). 늘렸으면 어느 응답이든 새 쿠키를 붙인다
    let renewed: string | null = null;
    if (session.expires - Date.now() < RENEW_DAYS * DAY) {
      const expires = Date.now() + SESSION_DAYS * DAY;
      this.sql.exec('UPDATE sessions SET expires = ? WHERE token_hash = ?', expires, session.tokenHash);
      renewed = sessionCookie(session.token, SESSION_DAYS * 86_400);
    }
    const res = await this.authed(req, path, body, session, writes, ip);
    if (renewed && !res.headers.has('set-cookie')) res.headers.set('set-cookie', renewed);
    return res;
  }

  /** 로그인한 사람의 요청 */
  private async authed(req: Request, path: string, body: Record<string, unknown>, session: { user: UserRow; tokenHash: string }, writes: boolean, ip: string): Promise<Response> {
    const { user } = session;
    if (writes) {
      const wait = this.writeByUser.hit(user.id);
      if (wait) return fail(`요청이 너무 많아요. ${wait}초 뒤에 다시 해 주세요.`, 429);
    }

    if (path === 'auth/logout-all' && req.method === 'POST') {
      this.sql.exec('DELETE FROM sessions WHERE user_id = ?', user.id);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
    }
    if (path === 'me' && req.method === 'GET') return json({ user: this.publicUser(user) });
    if (path === 'translate' && req.method === 'POST') return this.translate(user, body);
    if (path === 'me/nickname' && req.method === 'PUT') {
      const nickname = cutText(String(body.nickname ?? '').normalize('NFC').trim(), 16);
      if (!nickname) return fail('닉네임을 써 주세요.');
      this.sql.exec('UPDATE users SET nickname = ? WHERE id = ?', nickname, user.id);
      return json({ user: { ...this.publicUser(user), nickname } });
    }
    if (path === 'me/password' && req.method === 'PUT') return this.changePassword(user, session.tokenHash, body, ip);
    if (path === 'me' && req.method === 'DELETE') return this.deleteAccount(user, body, ip);

    // 기기끼리 맞추는 묶음 자료 (공부 자료·영단어)
    const st = path.match(/^store\/(study|words)$/);
    if (st && req.method === 'GET') {
      const r = this.sql.exec<{ data: string; updated: number }>('SELECT data, updated FROM blobs WHERE user_id = ? AND name = ?', user.id, st[1]).toArray()[0];
      return json({ data: r?.data ?? null, updatedAt: r?.updated ?? 0 });
    }
    if (st && req.method === 'PUT') {
      const data = typeof body.data === 'string' ? body.data : '';
      if (!data || data.length > MAX_STORE || !/^[A-Za-z0-9+/=]+$/.test(data)) return fail('보낸 내용이 너무 크거나 잘못됐어요.', 413);
      this.sql.exec('INSERT OR REPLACE INTO blobs (user_id, name, data, updated) VALUES (?, ?, ?, ?)', user.id, st[1], data, Date.now());
      return json({ ok: true });
    }

    // 오답 노트 사진: 기기에서 줄여 보낸 JPEG(base64)
    const ph = path.match(/^study-photo\/([a-z0-9]{6,32})$/);
    if (ph) {
      const name = `photo:${ph[1]}`;
      if (req.method === 'GET') {
        const r = this.sql.exec<{ data: string }>('SELECT data FROM blobs WHERE user_id = ? AND name = ?', user.id, name).toArray()[0];
        return r ? json({ data: r.data }) : fail('사진이 없어요.', 404);
      }
      if (req.method === 'DELETE') {
        this.sql.exec('DELETE FROM blobs WHERE user_id = ? AND name = ?', user.id, name);
        return json({ ok: true });
      }
      if (req.method === 'PUT') {
        const data = typeof body.data === 'string' ? body.data : '';
        if (!data || data.length > MAX_PHOTO || !/^[A-Za-z0-9+/=]+$/.test(data)) return fail('사진이 너무 크거나 잘못됐어요.', 413);
        // JPEG 인지 (FF D8 FF → base64 「/9j/」)
        if (!data.startsWith('/9j/')) return fail('JPEG 사진만 올릴 수 있어요.', 415);
        const had = this.sql.exec('SELECT 1 FROM blobs WHERE user_id = ? AND name = ?', user.id, name).toArray().length > 0;
        const n = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM blobs WHERE user_id = ? AND name LIKE 'photo:%'", user.id).toArray()[0].n;
        if (!had && n >= MAX_PHOTOS) return fail(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요. 해결한 오답의 사진을 지워 주세요.`, 413);
        this.sql.exec('INSERT OR REPLACE INTO blobs (user_id, name, data, updated) VALUES (?, ?, ?, ?)', user.id, name, data, Date.now());
        return json({ ok: true });
      }
    }
    return fail('없는 주소예요.', 404);
  }

  private async translate(user: UserRow, body: Record<string, unknown>) {
    const r = readRequest(body);
    if ('error' in r) return fail(r.error);
    const wait = this.translateByUser.hit(user.id);
    if (wait) return fail(`번역을 너무 자주 했어요. ${wait}초 뒤에 다시 해 주세요.`, 429);
    if (this.translateByUserDay.hit(user.id)) return fail('오늘 번역할 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요.', 429);
    if (this.translateAll.hit('all')) return fail('오늘 사이트 전체의 번역 한도를 다 썼어요. 내일 다시 해 주세요.', 429);
    let out: unknown;
    try {
      out = await this.env.AI.run(TRANSLATE_MODEL, buildInput(r.text, r.to) as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('translate error', msg);
      if (/neuron|limit|quota|exceeded/i.test(msg)) return fail('오늘 번역 무료 한도를 다 썼어요. 한국 시간 오전 9시 뒤에 다시 해 주세요.', 503);
      return fail('번역 서버에 문제가 있어요. 잠시 뒤 다시 해 주세요.', 502);
    }
    const text = readOutput(out);
    if (!text) return fail('번역 결과를 받지 못했어요. 다시 해 주세요.', 502);
    return json({ text, to: r.to });
  }

  private publicUser(u: UserRow) {
    return { id: u.id, username: u.username, nickname: u.nickname };
  }

  private async newSession(userId: string): Promise<Record<string, string>> {
    const token = randomHex(32);
    const now = Date.now();
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    this.sql.exec('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)', await sha256(token), userId, now + SESSION_DAYS * DAY);
    return { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86_400) };
  }

  private async sessionFrom(req: Request): Promise<{ user: UserRow; token: string; tokenHash: string; expires: number } | null> {
    const token = readCookie(req) ?? '';
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const tokenHash = await sha256(token);
    const row = this.sql
      .exec<UserRow & { expires: number }>('SELECT u.*, s.expires AS expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?', tokenHash, Date.now())
      .toArray()[0];
    return row ? { user: row, token, tokenHash, expires: row.expires } : null;
  }

  private async signup(b: Record<string, unknown>, ip: string) {
    const username = String(b.username ?? '').normalize('NFC').trim();
    const password = String(b.password ?? '');
    const nickname = cutText(String(b.nickname ?? '').normalize('NFC').trim(), 16) || username;
    if (!USERNAME.test(username)) return fail('아이디는 3~16자의 한글·영문·숫자·_ 로 정해 주세요.');
    const bad = passwordProblem(password, username);
    if (bad) return fail(bad);
    if (this.sql.exec('SELECT id FROM users WHERE username = ?', username).toArray().length) return fail('이미 있는 아이디예요.', 409);
    const wait = this.signupByIp.hit(ip);
    if (wait) return fail('이 곳에서 오늘 만든 계정이 너무 많아요. 내일 다시 해 주세요.', 429);
    if (this.signupAll.hit('all')) return fail('지금 가입하는 사람이 너무 많아요. 잠시 뒤 다시 해 주세요.', 429);
    const id = randomHex(12);
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    try {
      this.sql.exec('INSERT INTO users (id, username, nickname, salt, hash, created) VALUES (?, ?, ?, ?, ?, ?)', id, username, nickname, salt, hash, Date.now());
    } catch (e) {
      // 같은 아이디로 거의 동시에 가입한 경우 (비밀번호를 섞는 동안 다른 가입이 먼저 들어감)
      if (/UNIQUE/i.test(e instanceof Error ? e.message : String(e))) return fail('이미 있는 아이디예요.', 409);
      throw e;
    }
    return json({ user: { id, username, nickname } }, 200, await this.newSession(id));
  }

  /**
   * 비밀번호 확인 (틀린 횟수·잠금 포함). 맞으면 null, 아니면 오류 응답.
   * 틀린 횟수는 (아이디, 접속 주소) 마다 센다: 다른 곳에서 일부러 틀려도 내 기기의 로그인은 막히지 않는다.
   * 없는 아이디도 똑같이 세고 똑같이 답한다 (잠금 안내에 남은 시간도 알리지 않음).
   */
  private async verify(u: UserRow | undefined, username: string, password: string, ip: string): Promise<Response | null> {
    const wrong = () => fail('아이디 또는 비밀번호가 맞지 않아요.', 401);
    const now = Date.now();
    const key = `${usernameKey(username)}|${ip}`;
    const row = this.sql.exec<{ fails: number; locked_until: number }>('SELECT fails, locked_until FROM login_fails WHERE key = ?', key).toArray()[0];
    if (row && row.locked_until > now) return fail('비밀번호를 여러 번 틀렸어요. 잠시 뒤에 다시 해 주세요.', 429);
    // 없는 아이디도 같은 시간이 걸리게
    const ok = u ? sameHex(await hashPassword(password, u.salt), u.hash) : (await hashPassword(password, 'x'.repeat(32)), false);
    if (!ok) {
      const fails = (row?.fails ?? 0) + 1;
      // 5번 틀릴 때마다 잠금: 1분 → 5분 → 15분 → 1시간…
      const steps = [60_000, 300_000, 900_000, 3_600_000];
      const lock = fails % 5 === 0 ? now + steps[Math.min(fails / 5 - 1, steps.length - 1)] : 0;
      this.sql.exec('INSERT OR REPLACE INTO login_fails (key, fails, locked_until, updated) VALUES (?, ?, ?, ?)', key, fails, lock, now);
      return wrong();
    }
    if (row) this.sql.exec('DELETE FROM login_fails WHERE key = ?', key);
    return null;
  }

  private async login(b: Record<string, unknown>, ip: string) {
    const wait = this.loginByIp.hit(ip);
    if (wait) return fail(`로그인 시도가 너무 많아요. ${wait}초 뒤에 다시 해 주세요.`, 429);
    const raw = String(b.username ?? '').trim().slice(0, 32);
    const username = raw.normalize('NFC');
    const password = String(b.password ?? '').slice(0, 256);
    // 오래된 틀린 횟수 기록 정리 (하루 넘게 지난 것)
    this.sql.exec('DELETE FROM login_fails WHERE updated < ? AND locked_until < ?', Date.now() - DAY, Date.now());
    // 예전에 자모가 나뉜 채로 가입한 아이디도 찾을 수 있게 그대로의 글자로도 찾는다
    const u = this.sql.exec<UserRow>('SELECT * FROM users WHERE username = ? OR username = ? LIMIT 1', username, raw).toArray()[0];
    const bad = await this.verify(u, username, password, ip);
    if (bad) return bad;
    return json({ user: this.publicUser(u) }, 200, await this.newSession(u.id));
  }

  private async changePassword(user: UserRow, keepToken: string, b: Record<string, unknown>, ip: string) {
    const current = String(b.current ?? '').slice(0, 256);
    const next = String(b.password ?? '');
    const bad = await this.verify(user, user.username, current, ip);
    if (bad) return bad.status === 401 ? fail('지금 비밀번호가 맞지 않아요.', 403) : bad;
    const problem = passwordProblem(next, user.username);
    if (problem) return fail(problem);
    const salt = randomHex(16);
    this.sql.exec('UPDATE users SET salt = ?, hash = ? WHERE id = ?', salt, await hashPassword(next, salt), user.id);
    // 다른 기기의 로그인은 모두 끊는다 (이 기기는 그대로)
    this.sql.exec('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, keepToken);
    return json({ ok: true });
  }

  private async deleteAccount(user: UserRow, b: Record<string, unknown>, ip: string) {
    const bad = await this.verify(user, user.username, String(b.password ?? '').slice(0, 256), ip);
    if (bad) return bad.status === 401 ? fail('비밀번호가 맞지 않아요.', 403) : bad;
    this.sql.exec('DELETE FROM blobs WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM users WHERE id = ?', user.id);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }
}
