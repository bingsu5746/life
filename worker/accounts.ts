// 로그인·공부 자료 저장 서버 (Cloudflare Durable Object 하나 + SQLite).
// 아이디·비밀번호로 가입하고, 공부 자료(묶음 두 개: study·words)와 오답 사진을 계정에 저장해서 어느 기기에서든 같은 걸 쓴다.
// 합치기는 기기에서 하고(src/features/study/merge.ts) 서버는 저장만 한다.
// 비밀번호는 PBKDF2-SHA256(10만 번)으로 바꿔 저장하고, 로그인 토큰도 SHA-256 으로 바꿔 저장한다(원래 값은 저장하지 않음).
import { DurableObject } from 'cloudflare:workers';

const ITER = 100_000;
const SESSION_DAYS = 90;
/** 묶음 자료(gzip·base64 글자) 하나의 최대 크기 */
const MAX_STORE = 1_800_000;
/** 사진: 한 장(base64) 최대 크기, 사람마다 최대 장 수 */
const MAX_PHOTO = 700_000;
const MAX_PHOTOS = 300;
const USERNAME = /^[A-Za-z0-9_가-힣]{3,16}$/;

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

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

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

export class Accounts extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, nickname TEXT NOT NULL,
        salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS blobs (user_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, name));
    `);
  }

  async fetch(req: Request): Promise<Response> {
    try {
      return await this.handle(req);
    } catch (e) {
      console.error('accounts error', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/Exceeded allowed .* free tier/i.test(msg)) return fail('오늘 서버 무료 사용 한도를 다 써서 한국 시간 오전 9시까지 로그인·저장을 쓸 수 없어요.', 503);
      return fail(`서버 오류: ${msg}`, 500);
    }
  }

  private async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\//, '');
    let body: Record<string, unknown> = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_STORE + 1000) return fail('보낸 내용이 너무 커요.', 413);
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        return fail('잘못된 요청이에요.');
      }
    }
    if (path === 'auth/signup' && req.method === 'POST') return this.signup(body);
    if (path === 'auth/login' && req.method === 'POST') return this.login(body);
    const user = await this.userFrom(req);
    if (!user) return fail('로그인이 필요해요.', 401);
    if (path === 'auth/logout' && req.method === 'POST') {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
      return json({ ok: true });
    }
    if (path === 'me' && req.method === 'GET') return json({ user: this.publicUser(user) });

    // 기기끼리 맞추는 묶음 자료 (공부 자료·영단어)
    const st = path.match(/^store\/(study|words)$/);
    if (st && req.method === 'GET') {
      const r = this.sql.exec<{ data: string; updated: number }>('SELECT data, updated FROM blobs WHERE user_id = ? AND name = ?', user.id, st[1]).toArray()[0];
      return json({ data: r?.data ?? null, updatedAt: r?.updated ?? 0 });
    }
    if (st && req.method === 'PUT') {
      const data = typeof body.data === 'string' ? body.data : '';
      if (!data || data.length > MAX_STORE) return fail('보낸 내용이 너무 커요.', 413);
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
        if (!data || data.length > MAX_PHOTO) return fail('사진이 너무 커요.', 413);
        const had = this.sql.exec('SELECT 1 FROM blobs WHERE user_id = ? AND name = ?', user.id, name).toArray().length > 0;
        const n = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM blobs WHERE user_id = ? AND name LIKE 'photo:%'", user.id).toArray()[0].n;
        if (!had && n >= MAX_PHOTOS) return fail(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요. 해결한 오답의 사진을 지워 주세요.`, 413);
        this.sql.exec('INSERT OR REPLACE INTO blobs (user_id, name, data, updated) VALUES (?, ?, ?, ?)', user.id, name, data, Date.now());
        return json({ ok: true });
      }
    }
    return fail('없는 주소예요.', 404);
  }

  private publicUser(u: UserRow) {
    return { id: u.id, username: u.username, nickname: u.nickname };
  }

  private async newSession(userId: string) {
    const token = randomHex(32);
    const now = Date.now();
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    this.sql.exec('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)', await sha256(token), userId, now + SESSION_DAYS * 86_400_000);
    return token;
  }

  private async userFrom(req: Request): Promise<UserRow | null> {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const row = this.sql
      .exec<UserRow>('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?', await sha256(token), Date.now())
      .toArray()[0];
    return row ?? null;
  }

  private async signup(b: Record<string, unknown>) {
    const username = String(b.username ?? '').trim();
    const password = String(b.password ?? '');
    const nickname = String(b.nickname ?? '').trim().slice(0, 16) || username;
    if (!USERNAME.test(username)) return fail('아이디는 3~16자의 한글·영문·숫자·_ 로 정해 주세요.');
    if (password.length < 6 || password.length > 100) return fail('비밀번호는 6자 이상으로 정해 주세요.');
    if (this.sql.exec('SELECT id FROM users WHERE username = ?', username).toArray().length) return fail('이미 있는 아이디예요.', 409);
    const id = randomHex(12);
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    this.sql.exec('INSERT INTO users (id, username, nickname, salt, hash, created) VALUES (?, ?, ?, ?, ?, ?)', id, username, nickname, salt, hash, Date.now());
    const token = await this.newSession(id);
    return json({ token, user: { id, username, nickname } });
  }

  private async login(b: Record<string, unknown>) {
    const username = String(b.username ?? '').trim();
    const password = String(b.password ?? '');
    const u = this.sql.exec<UserRow>('SELECT * FROM users WHERE username = ?', username).toArray()[0];
    const wrong = () => fail('아이디 또는 비밀번호가 맞지 않아요.', 401);
    if (!u) {
      // 없는 아이디도 같은 시간이 걸리게
      await hashPassword(password, 'x'.repeat(32));
      return wrong();
    }
    const now = Date.now();
    if (u.locked_until > now) return fail(`비밀번호를 여러 번 틀렸어요. ${Math.ceil((u.locked_until - now) / 1000)}초 뒤에 다시 해 주세요.`, 429);
    if (!sameHex(await hashPassword(password, u.salt), u.hash)) {
      const fails = u.fails + 1;
      // 5번 틀릴 때마다 1분씩 잠금
      this.sql.exec('UPDATE users SET fails = ?, locked_until = ? WHERE id = ?', fails, fails % 5 === 0 ? now + 60_000 : 0, u.id);
      return wrong();
    }
    this.sql.exec('UPDATE users SET fails = 0, locked_until = 0 WHERE id = ?', u.id);
    const token = await this.newSession(u.id);
    return json({ token, user: this.publicUser(u) });
  }
}
