// 로그인·공부 자료 저장 서버 (Cloudflare Durable Object 하나 + SQLite).
// 아이디·비밀번호로 가입하고, 공부 자료(묶음 두 개: study·words)와 오답 사진을 계정에 저장해서 어느 기기에서든 같은 걸 쓴다.
// 합치기는 기기에서 하고(src/features/study/merge.ts) 서버는 저장만 한다.
//
// 보안
// - 비밀번호: PBKDF2-SHA256 10만 번 + 사람마다 다른 소금(salt). 원래 비밀번호는 저장하지 않는다.
// - 로그인 유지: 무작위 토큰을 HttpOnly·Secure·SameSite=Strict 쿠키로만 준다 (페이지의 자바스크립트가 읽을 수 없음).
//   서버에는 토큰의 SHA-256 만 저장한다 (저장소가 새어도 토큰을 되살릴 수 없음).
// - 다른 사이트에서 보낸 요청 막기: SameSite=Strict + 바꾸는 요청은 Origin 이 이 사이트인지, 본문이 JSON 인지 확인.
// - 비밀번호 마구 넣어 보기 막기: 접속 주소(IP)마다 15분에 100번까지 (틀렸다고 계정을 잠그지는 않는다: 사용자 요청).
//   없는 아이디도 똑같이 답하고 같은 시간이 걸려서 어떤 아이디가 있는지 알아낼 수 없게 한다.
// - 가입 남용 막기: 접속 주소마다 하루 가입 수 제한 + 서버 전체 시간당 가입 수 제한.
//   (학교처럼 여럿이 한 주소를 같이 쓰는 곳을 생각해 넉넉하게 잡는다)
import { DurableObject } from 'cloudflare:workers';
import { COOKIE_NAME, cutText, Limiter, passwordProblem, readCookie } from './security';
import { fetchBoxOffice, fetchCatalogPage, fetchUpcoming } from './kobis';
import { fetchEvents, fetchMeals, fetchTimetable, findSchool } from './neis';
import { koExamples, lookupKo } from './stdict';
import { findBooksAladin, findBooksKakao, findGames, findRecords, similarArtists } from './lookup';
import { fetchProviders } from './ott';
import { askGemini, askOpenRouter, geminiModels, openRouterModels, SYSTEM as SOLVE_SYSTEM, type Engine, type SolveTurn } from './solve';
import { filmFacets, searchFilms, type Film } from './catalog';
import { buildRecommendInput, normTitle, readRecommendations, readRecommendRequest } from './recommend';
import { allowedEndpoint, localDate, makeVapid, nextFire, sendPush, type PushSub, type Vapid } from './push';
import { buildExamplesInput, readExamples, readExamplesRequest, buildInput, buildMeaningsInput, FAST_MODEL, modelInput, parseTranslation, readMeanings, readOutput, readRequest, readWordsRequest, TRANSLATE_MODEL } from './translate';

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
  private recommendByUser = new Limiter(20, 60 * 60_000);
  private translateByUserDay = new Limiter(300, DAY);
  private translateAll = new Limiter(1500, DAY);
  // 영화 정보 (KOBIS): 결과는 6시간 동안 저장해 두고 같이 쓴다
  private kobisByIp = new Limiter(60, 60 * 60_000);

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
      CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs (user_id);
      CREATE TABLE IF NOT EXISTS notify (user_id TEXT PRIMARY KEY, times TEXT NOT NULL, tz INTEGER NOT NULL, next_at INTEGER, digest TEXT NOT NULL DEFAULT '[]', origin TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS vapid (id INTEGER PRIMARY KEY, pub TEXT NOT NULL, priv TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS films (code TEXT PRIMARY KEY, title TEXT NOT NULL, norm TEXT NOT NULL, title_en TEXT, open TEXT NOT NULL, genre TEXT, nation TEXT, director TEXT, type TEXT);
      CREATE INDEX IF NOT EXISTS films_norm ON films (norm);
    `);
    // 예전에 만든 표에는 type 칸이 없다
    try {
      this.sql.exec('ALTER TABLE films ADD COLUMN type TEXT');
    } catch {
      /* 이미 있음 */
    }
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
      const big = path.startsWith('store/') || path.startsWith('study-photo/') || path === 'solve';
      const text = await req.text();
      if (text.length > (big ? MAX_STORE + 1000 : path === 'translate' || path === 'notify/digest' ? 4 * MAX_SMALL_BODY : MAX_SMALL_BODY)) return fail('보낸 내용이 너무 커요.', 413);
      try {
        const parsed: unknown = text ? JSON.parse(text) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('잘못된 요청이에요.');
        body = parsed as Record<string, unknown>;
      } catch {
        return fail('잘못된 요청이에요.');
      }
    }

    if (path === 'movies/kobis' && req.method === 'GET') return this.kobis(ip, req.headers.get('x-life-kobis-key') ?? undefined);
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
    if (path === 'solve' && req.method === 'POST') return this.solve(user, body, new URL(req.url).origin);
    if (path === 'movies/catalog' && req.method === 'GET') return this.catalogSearch(new URL(req.url).searchParams);
    if (path === 'movies/recommend' && req.method === 'POST') return this.recommend(user, body);
    if (path === 'movies/ott' && req.method === 'POST') return this.ott(body);
    if (path === 'school' && req.method === 'POST') return this.school(body);
    if (path === 'dict/ko' && req.method === 'POST') return this.dictKo(body);
    if (path === 'lookup' && req.method === 'POST') return this.lookup(body);
    if (path === 'music/similar' && req.method === 'POST') return this.musicSimilar(body);
    if (path === 'movies/catalog/sync' && req.method === 'POST') return this.catalogSync(req.headers.get('x-life-kobis-key') ?? undefined, body.recent === true);
    if (path === 'notify' || path.startsWith('notify/')) return this.notifyRoute(req, path, user, body);
    if (path === 'me/nickname' && req.method === 'PUT') {
      const nickname = cutText(
        String(body.nickname ?? '')
          .normalize('NFC')
          .trim(),
        16,
      );
      if (!nickname) return fail('닉네임을 써 주세요.');
      this.sql.exec('UPDATE users SET nickname = ? WHERE id = ?', nickname, user.id);
      return json({ user: { ...this.publicUser(user), nickname } });
    }
    if (path === 'me/password' && req.method === 'PUT') return this.changePassword(user, session.tokenHash, body, ip);
    if (path === 'me' && req.method === 'DELETE') return this.deleteAccount(user, body, ip);

    // 기기끼리 맞추는 묶음 자료 (공부 자료·영단어)
    const st = path.match(/^store\/(study|words)$/);
    if (st && req.method === 'GET') {
      // since: 기기가 마지막으로 받은 때. 그 뒤로 바뀐 게 없으면 내용은 보내지 않는다
      const since = Number(new URL(req.url).searchParams.get('since')) || 0;
      const at = this.sql.exec<{ updated: number }>('SELECT updated FROM blobs WHERE user_id = ? AND name = ?', user.id, st[1]).toArray()[0]?.updated ?? 0;
      if (since && at && at <= since) return json({ unchanged: true, updatedAt: at });
      const r = at ? this.sql.exec<{ data: string }>('SELECT data FROM blobs WHERE user_id = ? AND name = ?', user.id, st[1]).toArray()[0] : undefined;
      return json({ data: r?.data ?? null, updatedAt: at });
    }
    if (st && req.method === 'PUT') {
      const data = typeof body.data === 'string' ? body.data : '';
      if (!data || data.length > MAX_STORE || !/^[A-Za-z0-9+/=]+$/.test(data)) return fail('보낸 내용이 너무 크거나 잘못됐어요.', 413);
      // base: 기기가 알고 있는 서버 판. 그 사이 다른 기기가 올렸으면 받지 않는다 (기기가 받아서 합친 뒤 다시 올림)
      if (typeof body.base === 'number') {
        const at = this.sql.exec<{ updated: number }>('SELECT updated FROM blobs WHERE user_id = ? AND name = ?', user.id, st[1]).toArray()[0]?.updated ?? 0;
        if (at !== body.base) return json({ conflict: true, updatedAt: at }, 409);
      }
      const now = Date.now();
      this.sql.exec('INSERT OR REPLACE INTO blobs (user_id, name, data, updated) VALUES (?, ?, ?, ?)', user.id, st[1], data, now);
      return json({ ok: true, updatedAt: now });
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

  // ===== 문제 풀이 AI =====
  private solveByUser = new Limiter(60, 60 * 60_000);
  private gemList: { at: number; v: string[] } | null = null;
  private orList: { at: number; v: { id: string; image: boolean }[] } | null = null;

  /** { engine, turns: [{ role, text, images: [{ mime, data(base64) }] }] } → { text, model } */
  private async solve(user: UserRow, b: Record<string, unknown>, origin: string): Promise<Response> {
    const engine = (b.engine === 'openrouter' || b.engine === 'cloudflare' ? b.engine : 'gemini') as Engine;
    const raw = Array.isArray(b.turns) ? b.turns.slice(-12) : [];
    let bytes = 0;
    const turns: SolveTurn[] = [];
    for (const t of raw as Record<string, unknown>[]) {
      if (!t || typeof t !== 'object') continue;
      const images = (Array.isArray(t.images) ? t.images : [])
        .slice(0, 4)
        .filter((i): i is { mime: string; data: string } => !!i && typeof i === 'object' && /^image\/(jpeg|png|webp)$/.test(String((i as { mime?: unknown }).mime)) && typeof (i as { data?: unknown }).data === 'string' && /^[A-Za-z0-9+/=]+$/.test((i as { data: string }).data));
      bytes += images.reduce((a, i) => a + i.data.length, 0);
      turns.push({ role: t.role === 'assistant' ? 'assistant' : 'user', text: typeof t.text === 'string' ? t.text.slice(0, 8000) : '', images: images.length ? images : undefined });
    }
    if (!turns.length || turns[turns.length - 1].role !== 'user') return fail('물어볼 문제를 넣어 주세요.');
    if (bytes > MAX_STORE) return fail('사진이 너무 커요. 사진 수를 줄여 주세요.', 413);
    const wait = this.solveByUser.hit(user.id);
    if (wait) return fail(`너무 자주 물었어요. ${wait}초 뒤에 다시 해 주세요.`, 429);
    const env = this.env as unknown as Record<string, string | undefined>;
    const needImage = turns.some((t) => t.images?.length);
    try {
      if (engine === 'gemini') {
        const key = env.Life_gemini_api_key || env.GEMINI_KEY;
        if (!key) return fail('Gemini 키가 아직 없어요.', 503);
        if (!this.gemList || Date.now() - this.gemList.at > DAY) this.gemList = { at: Date.now(), v: await geminiModels(key) };
        const models = this.gemList.v.length ? this.gemList.v : ['gemini-2.5-flash'];
        let last = '';
        for (const m of models.slice(0, 3)) {
          try {
            return json({ text: await askGemini(key, m, turns), model: m });
          } catch (e) {
            last = e instanceof Error ? e.message : String(e);
            if (/무료 사용량/.test(last)) break;
          }
        }
        throw new Error(last || 'Gemini 가 답하지 못했어요');
      }
      if (engine === 'openrouter') {
        const key = env.Openrouter || env.OPENROUTER_KEY;
        if (!key) return fail('OpenRouter 키가 아직 없어요.', 503);
        if (!this.orList || Date.now() - this.orList.at > 6 * 3600_000) this.orList = { at: Date.now(), v: await openRouterModels() };
        const models = this.orList.v.filter((m) => !needImage || m.image).map((m) => m.id);
        if (!models.length) return fail(needImage ? '지금 사진을 읽는 무료 모델이 없어요. 글로 넣거나 다른 모델을 골라 주세요.' : '지금 쓸 수 있는 무료 모델이 없어요.', 503);
        let last = '';
        for (const m of models.slice(0, 3)) {
          try {
            return json({ text: await askOpenRouter(key, m, turns, origin), model: m });
          } catch (e) {
            last = e instanceof Error ? e.message : String(e);
            if (/무료 사용량/.test(last)) break;
          }
        }
        throw new Error(last || 'OpenRouter 가 답하지 못했어요');
      }
      // Cloudflare Workers AI: 글만 (사진은 기기에서 글자로 바꿔 보낸다)
      if (needImage) return fail('이 모델은 사진을 못 읽어요. 사진은 기기에서 글자로 바꿔 보내요.');
      if (this.translateAll.hit('all')) return fail('오늘 사이트 전체의 AI 한도를 다 썼어요. 내일 다시 해 주세요.', 429);
      const out = await this.env.AI.run(TRANSLATE_MODEL as never, { messages: [{ role: 'system', content: SOLVE_SYSTEM }, ...turns.map((t) => ({ role: t.role, content: t.text }))], reasoning: { effort: 'medium' }, max_tokens: 6000 } as never);
      const text = readOutput(out);
      if (!text) throw new Error('Cloudflare AI 가 답을 주지 않았어요');
      return json({ text, model: TRANSLATE_MODEL.replace('@cf/', '') });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('solve failed', engine, msg);
      return fail(/무료 사용량|neuron|quota/i.test(msg) ? `${msg.replace(/neuron.*$/i, '')} 다른 모델을 골라 주세요.`.trim() : `풀지 못했어요: ${msg.slice(0, 200)}`, 502);
    }
  }

  private async translate(user: UserRow, body: Record<string, unknown>) {
    // { words } 이면 단어 뜻 채우기, { examples } 면 예문 만들기, 아니면 글 번역
    const er = body.examples !== undefined ? readExamplesRequest(body) : null;
    if (er && 'error' in er) return fail(er.error);
    const wr = !er && body.words !== undefined ? readWordsRequest(body) : null;
    if (wr && 'error' in wr) return fail(wr.error);
    const r = wr || er ? null : readRequest(body);
    if (r && 'error' in r) return fail(r.error);
    const wait = this.translateByUser.hit(user.id);
    if (wait) return fail(`번역을 너무 자주 했어요. ${wait}초 뒤에 다시 해 주세요.`, 429);
    if (this.translateByUserDay.hit(user.id)) return fail('오늘 번역할 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요.', 429);
    if (this.translateAll.hit('all')) return fail('오늘 사이트 전체의 번역 한도를 다 썼어요. 내일 다시 해 주세요.', 429);
    const quota = (msg: string) => /neuron|quota|exceeded|daily|limit/i.test(msg);
    const run = async (model: string, input: unknown) => {
      try {
        return { out: (await this.env.AI.run(model as never, input as never)) as unknown };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('translate error', model, msg);
        return { err: msg };
      }
    };
    const busy = (err: string) => (quota(err) ? fail('오늘 번역 무료 한도를 다 썼어요. 한국 시간 오전 9시 뒤에 다시 해 주세요.', 503) : fail('번역 서버에 문제가 있어요. 잠시 뒤 다시 해 주세요.', 502));

    if (er) {
      const b = buildExamplesInput(er.items);
      const res = await run(FAST_MODEL, modelInput(FAST_MODEL, { messages: b.messages, max: b.max }));
      if ('err' in res) return busy(res.err!);
      const examples = readExamples(res.out, er.items);
      if (!examples.some(Boolean)) return fail('예문을 받지 못했어요. 다시 해 주세요.', 502);
      return json({ examples });
    }

    if (wr) {
      const res = await run(FAST_MODEL, buildMeaningsInput(wr.words));
      if ('err' in res) return busy(res.err!);
      const meanings = readMeanings(res.out, wr.words.length);
      if (!meanings.some(Boolean)) return fail('뜻을 받지 못했어요. 다시 해 주세요.', 502);
      return json({ words: wr.words, meanings });
    }

    const q = r!;
    const input = buildInput(q.text, q.to, q.mode);
    // 큰 모델로 먼저, 실패하거나 답이 비면 작은 모델로 한 번 더
    let res = await run(TRANSLATE_MODEL, modelInput(TRANSLATE_MODEL, input));
    let t = 'out' in res ? parseTranslation(readOutput(res.out), q.mode) : null;
    if (!t) {
      const first = 'err' in res ? res.err! : '';
      res = await run(FAST_MODEL, modelInput(FAST_MODEL, input));
      t = 'out' in res ? parseTranslation(readOutput(res.out), q.mode) : null;
      if (!t) return busy(('err' in res ? res.err! : '') || first);
    }
    return json({ ...t, to: q.to, mode: q.mode });
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
    const row = this.sql.exec<UserRow & { expires: number }>('SELECT u.*, s.expires AS expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?', tokenHash, Date.now()).toArray()[0];
    return row ? { user: row, token, tokenHash, expires: row.expires } : null;
  }

  private async signup(b: Record<string, unknown>, ip: string) {
    const username = String(b.username ?? '')
      .normalize('NFC')
      .trim();
    const password = String(b.password ?? '');
    const nickname =
      cutText(
        String(b.nickname ?? '')
          .normalize('NFC')
          .trim(),
        16,
      ) || username;
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
  /** 아이디·비밀번호 확인. 틀려도 잠그지 않는다 (사용자 요청). 접속 주소마다 15분에 100번 제한만 남는다 */
  private async verify(u: UserRow | undefined, _username: string, password: string, _ip: string): Promise<Response | null> {
    const wrong = () => fail('아이디 또는 비밀번호가 맞지 않아요.', 401);
    // 없는 아이디도 같은 시간이 걸리게
    let ok = u ? sameHex(await hashPassword(password, u.salt), u.hash) : (await hashPassword(password, 'x'.repeat(32)), false);
    // 한글이 든 비밀번호: 기기마다 글자를 합쳐 쓰거나(NFC) 풀어 쓰는(NFD) 방식이 달라 같은 글자가 다른 값이 될 수 있다
    if (!ok && u && /[^\x00-\x7f]/.test(password))
      for (const form of ['NFC', 'NFD'] as const) {
        const alt = password.normalize(form);
        if (alt !== password && sameHex(await hashPassword(alt, u.salt), u.hash)) {
          ok = true;
          break;
        }
      }
    if (!ok) return wrong();
    return null;
  }

  private async login(b: Record<string, unknown>, ip: string) {
    const wait = this.loginByIp.hit(ip);
    if (wait) return fail(`로그인 시도가 너무 많아요. ${wait}초 뒤에 다시 해 주세요.`, 429);
    const raw = String(b.username ?? '')
      .trim()
      .slice(0, 32);
    const username = raw.normalize('NFC');
    const password = String(b.password ?? '').slice(0, 256);
    // 오래된 틀린 횟수 기록 정리 (하루 넘게 지난 것)
    // 예전 잠금 기록은 더 쓰지 않으므로 지운다
    this.sql.exec('DELETE FROM login_fails');
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

  // ===== 영화 정보 (KOBIS) =====

  private async kobis(ip: string, fromWorker?: string): Promise<Response> {
    if (this.kobisByIp.hit(ip)) return fail('잠시 뒤에 다시 해 주세요.', 429);
    // 키는 바깥 Worker 가 비밀값에서 꺼내 붙여 준다 (밖에서 온 같은 이름 머리글은 Worker 가 지운다)
    const key = fromWorker || (this.env as unknown as { KOBIS_KEY?: string }).KOBIS_KEY;
    if (!key) return fail('영화 정보 키(KOBIS_KEY)가 아직 설정되지 않았어요.', 503);
    // 한국 날짜
    const kst = (offset: number) => new Date(Date.now() + 9 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
    const today = kst(0);
    const cached = this.sql.exec<{ data: string; at: number }>("SELECT data, at FROM cache WHERE key = 'kobis'").toArray()[0];
    if (cached && Date.now() - cached.at < 6 * 3600_000 && (JSON.parse(cached.data) as { today?: string }).today === today) return json(JSON.parse(cached.data));
    const out: { today: string; boxOffice?: unknown; upcoming?: unknown; errors: string[] } = { today, errors: [] };
    try {
      out.boxOffice = await fetchBoxOffice(key, kst(-1));
    } catch (e) {
      out.errors.push(`박스오피스: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      out.upcoming = await fetchUpcoming(key, today, kst(90));
    } catch (e) {
      out.errors.push(`개봉 예정: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (out.boxOffice || out.upcoming) this.sql.exec("INSERT OR REPLACE INTO cache (key, data, at) VALUES ('kobis', ?, ?)", JSON.stringify(out), Date.now());
    else console.error('kobis failed', out.errors.join(' / '));
    return json(out);
  }

  // ===== 영화 목록 (1990년부터 KOBIS 에 올라 있는 장편) =====

  private catalogBusy = false;
  /** 영화 목록 (찾을 때마다 표 전체를 읽으면 무료 한도를 빨리 써서, 처음 한 번만 읽어 메모리에 둔다) */
  private filmList: Film[] | null = null;
  private filmsInMemory(): Film[] {
    if (!this.filmList) this.filmList = this.sql.exec<Film & Record<string, SqlStorageValue>>('SELECT code, title, norm, title_en, open, genre, nation, director, type FROM films').toArray();
    return this.filmList;
  }
  private filmFacetCache: { genres: string[]; nations: string[] } | null = null;
  private films(): number {
    return this.filmsInMemory().length;
  }

  private catalogState(): { year: number; page: number; done: boolean; count: number } {
    // catalog2: 단편·성인물까지 모두 받는 두 번째 판 (처음 판은 장편만이라 다시 처음부터)
    const r = this.sql.exec<{ data: string }>("SELECT data FROM cache WHERE key = 'catalog2'").toArray()[0];
    const s = r ? (JSON.parse(r.data) as { year: number; page: number; done: boolean; count?: number }) : { year: 1990, page: 1, done: false };
    // 수만 셀 때는 저장해 둔 수를 쓴다 (목록을 읽지 않게)
    return { year: s.year, page: s.page, done: s.done, count: this.filmList?.length ?? s.count ?? this.films() };
  }

  /** 제목·감독으로 찾기 + 장르·나라·연도·유형 거르기 */
  private catalogSearch(sp: URLSearchParams): Response {
    const state = this.catalogState();
    const facets = sp.get('facets') === '1' ? (this.filmFacetCache ??= filmFacets(this.filmsInMemory())) : undefined;
    const found = searchFilms(this.filmsInMemory(), {
      norm: normTitle(sp.get('q') ?? '').slice(0, 40),
      genre: (sp.get('genre') ?? '').slice(0, 20),
      nation: (sp.get('nation') ?? '').slice(0, 20),
      from: Number(sp.get('from')) || 0,
      to: Number(sp.get('to')) || 0,
      type: sp.get('type') ?? '',
      adult: sp.get('adult') === '1',
      offset: Math.max(0, Math.min(5000, Number(sp.get('offset')) || 0)),
    });
    const items = found.slice(0, 60).map((f) => ({ code: f.code, title: f.title, open: f.open, genre: f.genre, nation: f.nation, director: f.director, type: f.type }));
    return json({ items, more: found.length > 60, state, facets });
  }

  /** 한 번에 몇 쪽씩 받아 저장하고, 어디까지 했는지 돌려준다. 화면이 다 될 때까지 되풀이해서 부른다 */
  private async catalogSync(fromWorker?: string, recent = false): Promise<Response> {
    const key = fromWorker || (this.env as unknown as { KOBIS_KEY?: string }).KOBIS_KEY;
    if (!key) return fail('영화 정보 키(KOBIS_KEY)가 아직 설정되지 않았어요.', 503);
    if (this.catalogBusy) return json({ state: this.catalogState(), busy: true });
    this.catalogBusy = true;
    const last = new Date(Date.now() + 9 * 3600_000).getUTCFullYear() + 1;
    let { year, page, done } = this.catalogState();
    // 다 받은 뒤 「새 영화 더 받기」: 올해부터만 다시 훑는다 (예전 것은 다시 받지 않음)
    if (done && recent) ({ year, page, done } = { year: last - 1, page: 1, done: false });
    const list = this.filmsInMemory();
    const have = new Set(list.map((f) => f.code));
    let error = '';
    try {
      for (let n = 0; n < 20 && !done; n++) {
        const { items, total } = await fetchCatalogPage(key, year, page);
        // 이미 있는 영화는 다시 쓰지 않는다 (쓰기 한도)
        for (const m of items) {
          if (have.has(m.code)) continue;
          const f: Film = { code: m.code, title: m.title, norm: normTitle(m.title), title_en: m.titleEn ?? null, open: m.open, genre: m.genre ?? null, nation: m.nation ?? null, director: m.director ?? null, type: m.type ?? null };
          this.sql.exec('INSERT OR REPLACE INTO films (code, title, norm, title_en, open, genre, nation, director, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', f.code, f.title, f.norm, f.title_en, f.open, f.genre, f.nation, f.director, f.type);
          have.add(f.code);
          list.push(f);
        }
        if (page * 100 >= total) {
          year++;
          page = 1;
          if (year > last) done = true;
        } else page++;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      this.sql.exec("INSERT OR REPLACE INTO cache (key, data, at) VALUES ('catalog2', ?, ?)", JSON.stringify({ year, page, done, count: list.length }), Date.now());
      this.filmFacetCache = null;
      this.catalogBusy = false;
    }
    return json({ state: this.catalogState(), last, error: error || undefined });
  }

  /** 추천: 모델이 고른 제목 중 영화 목록에서 확인된 것만 */
  private async recommend(user: UserRow, body: Record<string, unknown>): Promise<Response> {
    const r = readRecommendRequest(body);
    if ('error' in r) return fail(r.error);
    const total = this.films();
    if (!total) return fail('영화 목록이 아직 비어 있어요. 극장가 탭에서 「영화 목록 받기」를 먼저 해 주세요.');
    if (this.recommendByUser.hit(user.id)) return fail('추천을 너무 자주 했어요. 잠시 뒤에 다시 해 주세요.', 429);
    if (this.translateAll.hit('all')) return fail('오늘 사이트 전체의 AI 한도를 다 썼어요. 내일 다시 해 주세요.', 429);
    const b = buildRecommendInput(r);
    let out: unknown;
    try {
      out = await this.env.AI.run(TRANSLATE_MODEL as never, modelInput(TRANSLATE_MODEL, { messages: b.messages, max: b.max }) as never);
    } catch (e) {
      console.error('recommend error', e instanceof Error ? e.message : String(e));
      return fail('추천 서버에 문제가 있어요. 잠시 뒤 다시 해 주세요.', 502);
    }
    const seen = new Set(r.seen.map(normTitle));
    const items: { code: string; title: string; open: string; genre: string | null; nation: string | null; director: string | null; type: string | null; reason: string }[] = [];
    const used = new Set<string>();
    for (const rec of readRecommendations(out)) {
      const n = normTitle(rec.title);
      if (seen.has(n)) continue;
      const rows = this.sql.exec<{ code: string; title: string; open: string; genre: string | null; nation: string | null; director: string | null; type: string | null }>('SELECT code, title, open, genre, nation, director, type FROM films WHERE norm = ? ORDER BY open DESC LIMIT 8', n).toArray();
      // 같은 제목이 여럿이면 연도가 가까운 것 (장편 먼저)
      const hit = rows.sort((a, c) => Number((c.type ?? '장편') === '장편') - Number((a.type ?? '장편') === '장편') || Math.abs(Number(a.open.slice(0, 4)) - (rec.year ?? Number(a.open.slice(0, 4)))) - Math.abs(Number(c.open.slice(0, 4)) - (rec.year ?? Number(c.open.slice(0, 4)))))[0];
      if (!hit || used.has(hit.code)) continue;
      used.add(hit.code);
      items.push({ ...hit, reason: rec.reason });
    }
    return json({ items });
  }

  /** OTT: 영화마다 한국에서 구독으로 볼 수 있는 서비스 (TMDB, 7일 저장) */
  private async ott(body: Record<string, unknown>): Promise<Response> {
    const env = this.env as unknown as { TMDB_KEY?: string; Tmdb?: string };
    const key = env.TMDB_KEY || env.Tmdb;
    if (!key) return fail('OTT 정보를 쓰려면 TMDB 키(TMDB_KEY)가 필요해요.', 503);
    const list = Array.isArray(body.items) ? (body.items as { title?: unknown; year?: unknown }[]).slice(0, 12) : [];
    const providers: (string[] | null)[] = [];
    for (const it of list) {
      const title = typeof it?.title === 'string' ? it.title.trim().slice(0, 80) : '';
      const year = typeof it?.year === 'number' && it.year > 1880 && it.year < 2200 ? Math.floor(it.year) : undefined;
      if (!title) {
        providers.push(null);
        continue;
      }
      const ck = `ott:${normTitle(title)}:${year ?? ''}`;
      const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
      if (c && Date.now() - c.at < 7 * 86_400_000) {
        providers.push(JSON.parse(c.data) as string[]);
        continue;
      }
      try {
        const p = await fetchProviders(key, title, year);
        this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(p), Date.now());
        providers.push(p);
      } catch (e) {
        console.error('ott failed', e instanceof Error ? e.message : String(e));
        providers.push(null);
      }
    }
    return json({ providers });
  }

  /** 학교: 급식 · 학사일정 · 시간표 (나이스). 학교 코드는 30일, 나머지는 6시간 저장 */
  private async school(b: Record<string, unknown>): Promise<Response> {
    const env = this.env as unknown as { NEIS_KEY?: string; Nice?: string };
    const key = env.NEIS_KEY || env.Nice;
    if (!key) return fail('학교 정보를 쓰려면 나이스 키(NEIS_KEY)가 필요해요.', 503);
    const name = typeof b.name === 'string' ? b.name.normalize('NFC').trim().slice(0, 40) : '';
    const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
    const from = day(b.from);
    const to = day(b.to);
    if (!name || !from || !to || to < from || Date.parse(to) - Date.parse(from) > 92 * 86_400_000) return fail('학교 이름과 날짜를 확인해 주세요.');
    const grade = typeof b.grade === 'number' && Number.isInteger(b.grade) && b.grade >= 1 && b.grade <= 3 ? b.grade : 0;
    const cls = typeof b.cls === 'string' && /^\d{1,2}$/.test(b.cls) ? String(Number(b.cls)) : '';
    const want = new Set(Array.isArray(b.want) ? b.want.filter((x) => typeof x === 'string') : []);
    const cached = async <T>(ck: string, ms: number, get: () => Promise<T>): Promise<T> => {
      const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
      if (c && Date.now() - c.at < ms) return JSON.parse(c.data) as T;
      const v = await get();
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(v), Date.now());
      return v;
    };
    try {
      const codes = await cached(`neis:school:${name}`, 30 * 86_400_000, () => findSchool(key, name));
      if (!codes) return fail(`「${name}」을 나이스에서 찾지 못했어요. 학교 이름을 정확히 써 주세요.`, 404);
      const H6 = 6 * 3_600_000;
      const id = `${codes.office}${codes.school}`;
      const meals = want.has('meals') ? await cached(`neis:meal:${id}:${from}:${to}`, H6, () => fetchMeals(key, codes, from, to)) : undefined;
      const events = want.has('events') ? await cached(`neis:event:${id}:${from}:${to}`, H6, () => fetchEvents(key, codes, from, to)) : undefined;
      const timetable = want.has('timetable') && grade && cls ? await cached(`neis:tt:${id}:${grade}:${cls}:${from}:${to}`, H6, () => fetchTimetable(key, codes, grade, cls, from, to)) : undefined;
      return json({ school: codes.name, meals, events, timetable });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('neis failed', msg);
      return fail(msg.startsWith('나이스') ? msg : '나이스에서 정보를 받지 못했어요. 잠시 뒤 다시 해 주세요.', 502);
    }
  }

  /** 이름으로 찾기: 게임 · 책 · 음반 (하루 저장) */
  private async lookup(b: Record<string, unknown>): Promise<Response> {
    const env = this.env as unknown as Record<string, string | undefined>;
    const type = b.type === 'game' || b.type === 'book' || b.type === 'music' ? b.type : null;
    const q = typeof b.q === 'string' ? b.q.normalize('NFC').trim().slice(0, 60) : '';
    if (!type || !q) return fail('찾을 이름을 써 주세요.');
    const need = type === 'game' ? env.RAWG_KEY : type === 'book' ? env.KAKAO_KEY || env.ALADIN_KEY : env.DISCOGS_TOKEN;
    if (!need) return fail(type === 'game' ? '게임 찾기에는 RAWG 키(RAWG_KEY)가 필요해요.' : type === 'book' ? '책 찾기에는 카카오 키(KAKAO_KEY)나 알라딘 키(ALADIN_KEY)가 필요해요.' : '음반 찾기에는 Discogs 토큰(DISCOGS_TOKEN)이 필요해요.', 503);
    const ck = `lookup:${type}:${q.toLowerCase()}`;
    const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
    if (c && Date.now() - c.at < 86_400_000) return json({ items: JSON.parse(c.data) });
    try {
      const items = type === 'game' ? await findGames(need, q) : type === 'book' ? (env.KAKAO_KEY ? await findBooksKakao(env.KAKAO_KEY, q) : await findBooksAladin(need, q)) : await findRecords(need, q);
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(items), Date.now());
      return json({ items });
    } catch (e) {
      console.error('lookup failed', type, e instanceof Error ? e.message : String(e));
      return fail('찾지 못했어요. 잠시 뒤 다시 해 주세요.', 502);
    }
  }

  /** 좋아하는 아티스트들과 비슷한 아티스트 (Last.fm, 7일 저장) → 많이 겹치는 순 */
  private async musicSimilar(b: Record<string, unknown>): Promise<Response> {
    const key = (this.env as unknown as { LASTFM_KEY?: string }).LASTFM_KEY;
    if (!key) return fail('음악 추천에는 Last.fm 키(LASTFM_KEY)가 필요해요.', 503);
    const artists = Array.isArray(b.artists) ? [...new Set(b.artists.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim().slice(0, 60)))].slice(0, 8) : [];
    const have = new Set((Array.isArray(b.have) ? b.have : []).filter((a): a is string => typeof a === 'string').map((a) => a.trim().toLowerCase()));
    if (!artists.length) return fail('별점을 준 음반이 있어야 추천할 수 있어요.');
    const score = new Map<string, { n: number; from: string[] }>();
    for (const a of artists) {
      const ck = `similar:${a.toLowerCase()}`;
      const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
      let list: string[];
      if (c && Date.now() - c.at < 7 * 86_400_000) list = JSON.parse(c.data) as string[];
      else {
        try {
          list = await similarArtists(key, a);
          this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(list), Date.now());
        } catch {
          continue;
        }
      }
      list.forEach((name, i) => {
        if (have.has(name.toLowerCase())) return;
        const e = score.get(name) ?? { n: 0, from: [] };
        score.set(name, { n: e.n + (12 - i), from: [...e.from, a] });
      });
    }
    return json({
      items: [...score]
        .sort((x, y) => y[1].n - x[1].n)
        .slice(0, 12)
        .map(([name, e]) => ({ name, because: e.from.slice(0, 2) })),
    });
  }

  /** 국어 낱말 뜻 (표준국어대사전, 30일 저장) */
  private async dictKo(b: Record<string, unknown>): Promise<Response> {
    const env = this.env as unknown as { STDICT_KEY?: string; Onyongu?: string };
    const key = env.STDICT_KEY || env.Onyongu;
    if (!key) return fail('국어사전을 쓰려면 국립국어원 키(STDICT_KEY)가 필요해요.', 503);
    const q = typeof b.word === 'string' ? b.word.normalize('NFC').trim().slice(0, 30) : '';
    if (!q || !/[가-힣]/.test(q)) return fail('찾을 낱말을 한글로 골라 주세요.');
    // detail: 예문까지 (표제어마다 자세히 보기를 한 번 더 부른다)
    const detail = b.detail === true;
    const ck = `stdict${detail ? 'd' : ''}:${q}`;
    const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
    if (c && Date.now() - c.at < 30 * 86_400_000) return json({ senses: JSON.parse(c.data) });
    try {
      const senses = await lookupKo(key, q);
      if (detail) {
        const codes = [...new Set(senses.map((x) => x.code).filter((x): x is string => !!x))].slice(0, 3);
        const ex = new Map<string, string[]>();
        for (const code of codes) ex.set(code, await koExamples(key, code).catch(() => []));
        for (const x of senses) if (x.code && ex.get(x.code)?.length) x.examples = ex.get(x.code);
      }
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(senses), Date.now());
      return json({ senses });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('stdict failed', msg);
      return fail(msg.startsWith('사전') ? msg : '국어사전에서 뜻을 받지 못했어요.', 502);
    }
  }

  // ===== 알림 (웹 푸시) =====

  /** 서버 알림 열쇠: 처음 쓸 때 만들어 이 저장소에만 둔다 */
  private async vapid(): Promise<Vapid> {
    const r = this.sql.exec<{ pub: string; priv: string }>('SELECT pub, priv FROM vapid WHERE id = 1').toArray()[0];
    if (r) return { pub: r.pub, priv: JSON.parse(r.priv) as JsonWebKey };
    const v = await makeVapid();
    this.sql.exec('INSERT OR IGNORE INTO vapid (id, pub, priv) VALUES (1, ?, ?)', v.pub, JSON.stringify(v.priv));
    const again = this.sql.exec<{ pub: string; priv: string }>('SELECT pub, priv FROM vapid WHERE id = 1').toArray()[0];
    return { pub: again.pub, priv: JSON.parse(again.priv) as JsonWebKey };
  }

  /** 다음 알림 시각에 깨어나도록 */
  private async scheduleAlarm() {
    const r = this.sql.exec<{ at: number | null }>('SELECT MIN(next_at) AS at FROM notify WHERE next_at IS NOT NULL').toArray()[0];
    if (r?.at) await this.ctx.storage.setAlarm(r.at);
    else await this.ctx.storage.deleteAlarm();
  }

  private async notifyRoute(req: Request, path: string, user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const origin = new URL(req.url).origin;
    if (path === 'notify' && req.method === 'GET') {
      const n = this.sql.exec<{ times: string; tz: number }>('SELECT times, tz FROM notify WHERE user_id = ?', user.id).toArray()[0];
      const subs = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', user.id).toArray()[0].n;
      return json({ publicKey: (await this.vapid()).pub, times: n ? (JSON.parse(n.times) as string[]) : [], devices: subs });
    }
    if (path === 'notify' && req.method === 'PUT') {
      const sub = b.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
      const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
      const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
      const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : '';
      if (!allowedEndpoint(endpoint) || endpoint.length > 1000 || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,30}$/.test(auth)) return fail('이 브라우저의 알림 정보를 받을 수 없어요.');
      const times = Array.isArray(b.times) ? (b.times.filter((t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) as string[]).slice(0, 3) : [];
      const tz = typeof b.tzOffset === 'number' && Number.isInteger(b.tzOffset) && Math.abs(b.tzOffset) <= 14 * 60 ? b.tzOffset : 540;
      const mine = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ? AND endpoint != ?', user.id, endpoint).toArray()[0].n;
      if (mine >= 5) return fail('알림은 기기 5개까지 켤 수 있어요. 안 쓰는 기기에서 알림을 꺼 주세요.', 409);
      this.sql.exec('INSERT OR REPLACE INTO push_subs (endpoint, user_id, p256dh, auth, created) VALUES (?, ?, ?, ?, ?)', endpoint, user.id, p256dh, auth, Date.now());
      const old = this.sql.exec<{ digest: string }>('SELECT digest FROM notify WHERE user_id = ?', user.id).toArray()[0];
      this.sql.exec('INSERT OR REPLACE INTO notify (user_id, times, tz, next_at, digest, origin) VALUES (?, ?, ?, ?, ?, ?)', user.id, JSON.stringify(times), tz, nextFire(times, tz), old?.digest ?? '[]', origin);
      await this.scheduleAlarm();
      return json({ ok: true, publicKey: (await this.vapid()).pub });
    }
    if (path === 'notify' && req.method === 'DELETE') {
      const endpoint = typeof b.endpoint === 'string' ? b.endpoint : '';
      if (endpoint) this.sql.exec('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?', user.id, endpoint);
      else this.sql.exec('DELETE FROM push_subs WHERE user_id = ?', user.id);
      const left = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', user.id).toArray()[0].n;
      if (!left) this.sql.exec('DELETE FROM notify WHERE user_id = ?', user.id);
      await this.scheduleAlarm();
      return json({ ok: true });
    }
    if (path === 'notify/digest' && req.method === 'PUT') {
      // 기기가 계산해 둔 날짜별 알림 글 (서버는 공부 자료를 열어 보지 않는다)
      const entries = (Array.isArray(b.entries) ? b.entries : [])
        .filter(
          (e): e is { date: string; slot: number; title: string; body: string } =>
            !!e && typeof e === 'object' && /^\d{4}-\d{2}-\d{2}$/.test((e as { date?: unknown }).date as string) && Number.isInteger((e as { slot?: unknown }).slot) && typeof (e as { title?: unknown }).title === 'string' && typeof (e as { body?: unknown }).body === 'string',
        )
        .slice(0, 24)
        .map((e) => {
          const u = (e as { url?: unknown }).url;
          return { date: e.date, slot: Math.max(0, Math.min(2, e.slot)), title: e.title.slice(0, 60), body: e.body.slice(0, 240), url: typeof u === 'string' && /^\/[\w/-]{0,60}$/.test(u) ? u : undefined };
        });
      this.sql.exec('UPDATE notify SET digest = ? WHERE user_id = ?', JSON.stringify(entries), user.id);
      return json({ ok: true });
    }
    if (path === 'notify/test' && req.method === 'POST') {
      const subs = this.sql.exec<PushSub & { [k: string]: SqlStorageValue }>('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?', user.id).toArray();
      if (!subs.length) return fail('알림을 켠 기기가 없어요.', 404);
      const sent = await this.pushTo(subs, { title: 'Life', body: '알림이 잘 와요. 정한 시각에 오늘 할 것을 알려 드릴게요.' }, origin);
      return sent ? json({ ok: true, sent }) : fail('알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요.', 502);
    }
    return fail('없는 주소예요.', 404);
  }

  /** 여러 기기에 보내기 (없어진 구독은 지운다). 보낸 수 */
  private async pushTo(subs: PushSub[], message: { title: string; body: string; url?: string }, origin: string): Promise<number> {
    const v = await this.vapid();
    let ok = 0;
    for (const s of subs) {
      try {
        const r = await sendPush(s, message, v, origin);
        if (r.ok) ok++;
        else if (r.gone) this.sql.exec('DELETE FROM push_subs WHERE endpoint = ?', s.endpoint);
        else console.error('push failed', r.status);
      } catch (e) {
        console.error('push error', e instanceof Error ? e.message : String(e));
      }
    }
    return ok;
  }

  /** 정한 시각: 그 사람이 넣어 둔 그날 그 시각 글을 보낸다 */
  async alarm() {
    const now = Date.now();
    const due = this.sql.exec<{ user_id: string; times: string; tz: number; next_at: number; digest: string; origin: string }>('SELECT * FROM notify WHERE next_at IS NOT NULL AND next_at <= ?', now + 30_000).toArray();
    for (const n of due) {
      const times = JSON.parse(n.times) as string[];
      const date = localDate(n.next_at, n.tz);
      const hhmm = new Date(n.next_at + n.tz * 60_000).toISOString().slice(11, 16);
      const slot = Math.max(0, times.indexOf(hhmm));
      const entries = JSON.parse(n.digest) as { date: string; slot: number; title: string; body: string; url?: string }[];
      const e = entries.find((x) => x.date === date && x.slot === slot);
      // 기기를 오래 안 열어 날짜 글이 없으면 짧은 기본 글 (한참 지난 내용을 보내지 않게)
      const message = e ? { title: e.title, body: e.body, url: e.url } : { title: 'Life', body: '오늘 할 것을 확인해 보세요' };
      const subs = this.sql.exec<PushSub & { [k: string]: SqlStorageValue }>('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?', n.user_id).toArray();
      if (subs.length) await this.pushTo(subs, message, n.origin);
      this.sql.exec('UPDATE notify SET next_at = ? WHERE user_id = ?', nextFire(times, n.tz, Math.max(now, n.next_at) + 1000), n.user_id);
    }
    await this.scheduleAlarm();
  }

  private async deleteAccount(user: UserRow, b: Record<string, unknown>, ip: string) {
    const bad = await this.verify(user, user.username, String(b.password ?? '').slice(0, 256), ip);
    if (bad) return bad.status === 401 ? fail('비밀번호가 맞지 않아요.', 403) : bad;
    this.sql.exec('DELETE FROM blobs WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM push_subs WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM notify WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM users WHERE id = ?', user.id);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }
}
