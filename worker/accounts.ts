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
import { relayFetch, type Relay } from './relay';
import { fetchSpecialDays } from './holidays';
import { cleanFact, goodKo } from './fact';
import { fetch2k } from './nba2k';
import { hcBody, parseHc } from './homecourt';
import { diaryBody, noteBody, parseDiary, parseNote, parseReceipt, parseTocRead, receiptBody, tocBody } from './aiRead';
import { seojiSearch, seojiToc, yes24Search } from './books';
import { cheapShark } from './cheapshark';
import { lolMetaTables, lolMetaTick, metaChamp, metaPatches, metaTable } from './lolMeta';
import { lolNewGames, lolOlderGames, lolProfile, RiotError, type LolGame } from './lol';
import { krPrices, steamAchievements, steamMe, storeItems, storeNames, storeSearch, wishlist, type KrPrice } from './steam';
import { hlAverage, fetchHlBox, fetchHlPlayerSeasons, fetchHlStandings, hlMatchId, sameTeam } from './highlightly';
import { within, fetchGames, fetchNbaAverages, fetchBdlRoster, fetchNbaBox, fetchNbaCareer, fetchNbaRoster, fetchNbaStandings, fetchStandings, nbaGameId, Paid, seasonOf, seasonPage, standingsFrom, type NbaGame } from './nba';
import { monthOf, R2_FREE, R2_STOP, r2Block, rollMonth, type R2Use } from './r2guard';
import { modelFamily, askCompat, askGemini, readGemini, geminiDaily, pacificDay, askOpenRouter, COMPAT, compatModels, geminiModels, openRouterDaily, openRouterModels, pickCompat, SYSTEM as SOLVE_SYSTEM, type Engine, type SolveTurn } from './solve';
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
/** NBA 팀 약자 → 팀 이름 (Highlightly 순위의 팀을 약자로 맞출 때) */
const NBA_TEAM_NAMES: Record<string, string> = {
  ATL: 'Hawks',
  BKN: 'Nets',
  BOS: 'Celtics',
  CHA: 'Hornets',
  CHI: 'Bulls',
  CLE: 'Cavaliers',
  DAL: 'Mavericks',
  DEN: 'Nuggets',
  DET: 'Pistons',
  GSW: 'Warriors',
  HOU: 'Rockets',
  IND: 'Pacers',
  LAC: 'Clippers',
  LAL: 'Lakers',
  MEM: 'Grizzlies',
  MIA: 'Heat',
  MIL: 'Bucks',
  MIN: 'Timberwolves',
  NOP: 'Pelicans',
  NYK: 'Knicks',
  OKC: 'Thunder',
  ORL: 'Magic',
  PHI: '76ers',
  PHX: 'Suns',
  POR: 'Trail Blazers',
  SAC: 'Kings',
  SAS: 'Spurs',
  TOR: 'Raptors',
  UTA: 'Jazz',
  WAS: 'Wizards',
};
const norm2 = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

/** 한 모델을 기다리는 최대 시간 (오래 생각하는 추론 모델은 더 길게) · 새 모델을 더 해 보지 않는 전체 시간 */
const MODEL_TIMEOUT = 60_000;
const THINK_TIMEOUT = 150_000;
const THINKING = /deepseek-r1|qwq|thinking|magistral|reasoner|gpt-oss|nemotron.*(ultra|super)/i;
const SOLVE_BUDGET = 150_000;

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

const SECURITY_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
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
      CREATE TABLE IF NOT EXISTS facts (en TEXT NOT NULL UNIQUE, ko TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS films (code TEXT PRIMARY KEY, title TEXT NOT NULL, norm TEXT NOT NULL, title_en TEXT, open TEXT NOT NULL, genre TEXT, nation TEXT, director TEXT, type TEXT);
      CREATE INDEX IF NOT EXISTS films_norm ON films (norm);
    `);
    lolMetaTables(this.sql);
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
      const big = path.startsWith('store/') || path.startsWith('study-photo/') || path === 'solve' || path === 'solve/img' || path === 'bb/scan' || path === 'ai/note' || path === 'ai/receipt' || path === 'ai/toc';
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
    if (path === 'solve' && req.method === 'POST') return typeof body.jobId === 'string' ? this.solveStart(user, body, new URL(req.url).origin) : this.solve(user, body, new URL(req.url).origin);
    if (path.startsWith('solve/job/') && req.method === 'GET') return this.solveJob(user, path.slice('solve/job/'.length));
    if (path === 'solve/usage' && req.method === 'GET') return this.solveUsage(user);
    if (path === 'solve/img' && req.method === 'POST') return this.solveImgPut(user, body);
    if (path.startsWith('solve/img/') && req.method === 'GET') return this.solveImgGet(user, path.slice('solve/img/'.length));
    if (path === 'movies/catalog' && req.method === 'GET') return this.catalogSearch(new URL(req.url).searchParams);
    if (path === 'movies/recommend' && req.method === 'POST') return this.recommend(user, body);
    if (path === 'movies/ott' && req.method === 'POST') return this.ott(body);
    if (path === 'school' && req.method === 'POST') return this.school(body);
    if (path === 'keys' && req.method === 'GET') return this.keysInfo();
    if (path === 'games/csmap' && req.method === 'GET')
      return this.csMap(
        (new URL(req.url).searchParams.get('ids') ?? '')
          .split(',')
          .map(Number)
          .filter((x) => Number.isInteger(x) && x > 0),
      );
    if ((path === 'lol/meta' || path === 'lol/champ') && req.method === 'GET') return this.lolMetaRoute(path, new URL(req.url).searchParams);
    if (path === 'lol/profile' && req.method === 'GET') return this.lolProfileRoute(new URL(req.url).searchParams.get('id') ?? '');
    if (path === 'lol/games' && req.method === 'GET') return this.lolGamesRoute(new URL(req.url).searchParams.get('puuid') ?? '', new URL(req.url).searchParams.get('older') === '1');
    if (path === 'steam/thumbs' && req.method === 'GET') {
      const ids = (new URL(req.url).searchParams.get('ids') ?? '')
        .split(',')
        .map(Number)
        .filter((x) => Number.isInteger(x) && x > 0)
        .slice(0, 100);
      return this.steamThumbs(ids).then(
        (thumbs) => json({ thumbs }),
        (e) => fail(`그림을 받지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502),
      );
    }
    if (path === 'steam/names' && req.method === 'GET') {
      const ids = (new URL(req.url).searchParams.get('ids') ?? '')
        .split(',')
        .map(Number)
        .filter((x) => Number.isInteger(x) && x > 0)
        .slice(0, 100);
      return storeNames(ids).then(
        (names) => json({ names }),
        (e) => fail(`이름을 받지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502),
      );
    }
    if (path === 'steam/watch' && req.method === 'PUT') return this.steamWatch(req, user, body);
    if (path === 'steam/watch' && req.method === 'GET') return json({ on: this.steamWatchOn(user) });
    if (path === 'steam/me' && req.method === 'GET') return this.steamMeRoute(new URL(req.url).searchParams.get('steamid') ?? '');
    if (path === 'steam/ach' && req.method === 'GET') return this.steamAchRoute(new URL(req.url).searchParams.get('steamid') ?? '', Number(new URL(req.url).searchParams.get('appid')));
    if (path === 'games/search' && req.method === 'GET') return this.gameSearch((new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80));
    if (path === 'games/prices' && req.method === 'GET')
      return this.gamePrices(
        (new URL(req.url).searchParams.get('ids') ?? '')
          .split(',')
          .map(Number)
          .filter((x) => Number.isInteger(x) && x > 0)
          .slice(0, 100),
      );
    if (path === 'games/watch' && req.method === 'PUT') return this.gameWatch(req, user, body);
    if (path === 'nba/fav' && (req.method === 'GET' || req.method === 'PUT')) return this.nbaFav(req, user, body);
    if (path === 'music/discogs' && req.method === 'GET') return this.discogs((new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80));
    if (path === 'ai/note' && req.method === 'POST') return this.noteScan(user, body);
    if (path === 'ai/receipt' && req.method === 'POST') return this.receiptScan(user, body);
    if (path === 'ai/toc' && req.method === 'POST') return this.tocScan(user, body);
    if (path === 'books/search' && req.method === 'GET') return this.bookSearch((new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80));
    if (path === 'books/toc' && req.method === 'GET') return this.bookToc(new URL(req.url).searchParams.get('url') ?? '');
    if (path === 'ai/diary' && req.method === 'POST') return this.diarySplit(user, body);
    if (path === 'bb/scan' && req.method === 'POST') return this.bbScan(user, body);
    if (path.startsWith('bb/scan/') && req.method === 'GET') return this.bbScanGet(user, path.slice('bb/scan/'.length));
    if (path === 'nba/games' && req.method === 'GET') return this.nbaGames(new URL(req.url).searchParams.get('date'));
    if (path === 'nba/standings' && req.method === 'GET') return this.nbaStandings();
    if (path === 'nba/box' && req.method === 'GET') return this.nbaBox(new URL(req.url).searchParams);
    if (path === 'nba/avg' && req.method === 'GET') return this.nbaAvg(new URL(req.url).searchParams);
    if (path === 'nba/players' && req.method === 'GET') return this.nbaPlayers();
    if (path === 'nba/hlplayer' && req.method === 'GET') return this.hlPlayer((new URL(req.url).searchParams.get('name') ?? '').trim().slice(0, 60));
    if (path === 'nba/2k' && req.method === 'GET') return this.nba2k();
    if (path === 'nba/roster' && req.method === 'GET') return this.nbaRoster((new URL(req.url).searchParams.get('team') ?? '').toUpperCase());
    if (path === 'nba/career' && req.method === 'GET') return this.nbaCareer(Number(new URL(req.url).searchParams.get('player')));
    if (path === 'fact' && req.method === 'GET') return this.uselessFact(user, new URL(req.url).searchParams.get('random') === '1');
    if (path === 'holidays' && req.method === 'GET') return this.holidays(new URL(req.url).searchParams.get('year'));
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

  /** Gemini 모델마다 오늘(태평양 시간) 쓴 횟수 · 막힌 모델 */
  private gemUse(userId: string): { n: Record<string, number>; out: Record<string, boolean> } {
    const r = this.sql.exec<{ data: string }>('SELECT data FROM cache WHERE key = ?', `gemuse:${userId}:${pacificDay(Date.now())}`).toArray()[0];
    const u = r ? JSON.parse(r.data) : {};
    // 예전에 분당 한도까지 하루 한도로 적던 「out」 은 버린다
    return { n: u.n ?? {}, out: u.blocked ?? {} };
  }
  private bumpGem(userId: string, model: string, out = false) {
    const u = this.gemUse(userId);
    if (out) u.out[model] = true;
    else u.n[model] = (u.n[model] ?? 0) + 1;
    this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', `gemuse:${userId}:${pacificDay(Date.now())}`, JSON.stringify({ n: u.n, blocked: u.out }), Date.now());
  }
  /** Gemini 모델 순서 중 아직 남은 것 (모델 · 남은 횟수) */
  private gemLeft(userId: string): { model: string; left: number }[] {
    const u = this.gemUse(userId);
    return (this.gemList?.v ?? []).map((m) => ({ model: m, left: u.out[m] ? 0 : Math.max(0, (geminiDaily(m) ?? 20) - (u.n[m] ?? 0)) })).filter((x) => x.left > 0);
  }
  private orList: { at: number; v: { id: string; image: boolean }[] } | null = null;
  private orDaily: { at: number; v: number | null } | null = null;
  /** OpenAI 모양 API: 맞는 주소와 모델 목록 (6시간) */
  private compatList: Record<string, { at: number; base: string; json: unknown }> = {};
  private cfAgreed = false;

  /** OpenAI 모양 API 의 맞는 주소와 모델 목록 (6시간 기억) */
  private async compatEntry(engine: keyof typeof COMPAT): Promise<{ at: number; base: string; json: unknown }> {
    const key = this.keyOf(engine);
    if (!key) throw new Error('키가 없어요');
    const old = this.compatList[engine];
    if (old && Date.now() - old.at < 6 * 3600_000) return old;
    let err = '';
    for (const base of COMPAT[engine].bases) {
      try {
        const entry = { at: Date.now(), base, json: await compatModels(base, key) };
        this.compatList[engine] = entry;
        return entry;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(err || '모델 목록을 받지 못했어요');
  }

  /** Gemini 는 미국 중계 서버를 거쳐 보낸다 (지원 지역 문제) */
  private gemFetch(): typeof fetch {
    return relayFetch((this.env as unknown as { RELAY?: DurableObjectNamespace<Relay> }).RELAY);
  }

  /** 이름을 정확히 모르는 비밀값 찾기: 대소문자 · _ · - 무시하고 후보 이름과 같은 것 */
  private secret(...names: string[]): string | undefined {
    const env = this.env as unknown as Record<string, unknown>;
    const n = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    const want = names.map(n);
    for (const k of Object.keys(env)) if (want.includes(n(k)) && typeof env[k] === 'string' && (env[k] as string).trim()) return (env[k] as string).trim();
    return undefined;
  }

  private keyOf(engine: Engine): string | undefined {
    const env = this.env as unknown as Record<string, string | undefined>;
    if (engine === 'gemini') return env.Life_gemini_api_key || env.GEMINI_KEY;
    if (engine === 'openrouter') return env.Openrouter || env.OPENROUTER_KEY;
    if (engine === 'cloudflare') return 'on';
    for (const k of COMPAT[engine].keys) if (env[k]) return env[k];
    return undefined;
  }

  /** 오늘(한국 날짜) 이 사람이 모델마다 쓴 횟수 · 막힌 모델 · 서비스가 알려 준 남은 횟수 */
  private solveUse(userId: string): { n: Record<string, number>; out: Record<string, boolean>; left: Record<string, number> } {
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const r = this.sql.exec<{ data: string }>('SELECT data FROM cache WHERE key = ?', `solveuse:${userId}:${day}`).toArray()[0];
    const u = r ? JSON.parse(r.data) : {};
    // 「blocked」: 예전에 잠깐 막힘까지 하루 한도로 잘못 적던 「out」 은 버린다
    return { n: u.n ?? {}, out: u.blocked ?? {}, left: u.left ?? {} };
  }
  private bumpUse(userId: string, engine: string, how: { out?: boolean; left?: number | null } = {}) {
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const u = this.solveUse(userId);
    if (how.out) u.out[engine] = true;
    else {
      u.n[engine] = (u.n[engine] ?? 0) + 1;
      delete u.out[engine];
    }
    if (typeof how.left === 'number') u.left[engine] = how.left;
    this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', `solveuse:${userId}:${day}`, JSON.stringify({ n: u.n, blocked: u.out, left: u.left }), Date.now());
  }

  // ===== 풀이를 뒤에서 (화면을 옮기거나 다른 앱으로 가도 계속) =====
  /** 끝난 풀이: 번호 → (상태 코드 · 답). 가져가면 지운다 */
  private jobs = new Map<string, { code: number; body: string }>();
  private running = new Set<string>();

  /** 푸는 중인 풀이가 지금 무엇을 하는지 (어느 모델에 묻는 중 · 기다리는 중) */
  private steps = new Map<string, string>();

  /** 풀이 시작: 바로 번호만 돌려주고, 끝나면 저장해 둔다 (기기는 몇 초마다 물어봄) */
  private solveStart(user: UserRow, b: Record<string, unknown>, origin: string): Response {
    const id = String(b.jobId);
    if (!/^[a-z0-9]{6,32}$/.test(id)) return fail('잘못된 요청이에요.');
    const key = `${user.id}:${id}`;
    if (this.running.has(key) || this.jobs.has(key)) return json({ jobId: id }, 202);
    this.running.add(key);
    // 받아 가지 않은 지 하루 넘은 풀이 결과는 지운다
    this.sql.exec("DELETE FROM cache WHERE key LIKE 'solvejob:%' AND at < ?", Date.now() - DAY);
    const work = this.solve(user, b, origin, (step) => this.steps.set(key, step))
      .then(async (res) => ({ code: res.status, body: await res.text() }))
      .catch((e) => ({ code: 500, body: JSON.stringify({ error: `풀지 못했어요: ${e instanceof Error ? e.message : String(e)}` }) }))
      .then((r) => {
        this.running.delete(key);
        this.steps.delete(key);
        this.jobs.set(key, r);
        // 서버가 잠깐 내려가도 남게 저장 (가져가면 지움)
        this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', `solvejob:${key}`, JSON.stringify(r), Date.now());
      });
    this.ctx.waitUntil(work);
    return json({ jobId: id }, 202);
  }

  /** 풀이 상태: 아직이면 running, 끝났으면 답(한 번 주고 지운다) */
  private solveJob(user: UserRow, id: string): Response {
    const key = `${user.id}:${id}`;
    if (this.running.has(key)) return json({ running: true, step: this.steps.get(key) });
    let r = this.jobs.get(key);
    if (!r) {
      const row = this.sql.exec<{ data: string }>('SELECT data FROM cache WHERE key = ?', `solvejob:${key}`).toArray()[0];
      if (row) r = JSON.parse(row.data) as { code: number; body: string };
    }
    if (!r) return json({ missing: true });
    this.jobs.delete(key);
    this.sql.exec('DELETE FROM cache WHERE key = ?', `solvejob:${key}`);
    return json({ done: true, code: r.code, result: JSON.parse(r.body) });
  }

  // ===== 문제 사진 저장 (R2, 무료 한도 넘기 전에 막음) =====
  private r2Ops = 0;
  private r2(): R2Bucket | undefined {
    return (this.env as unknown as { PROBLEMS?: R2Bucket }).PROBLEMS;
  }
  private r2Use(): R2Use {
    const r = this.sql.exec<{ data: string }>("SELECT data FROM cache WHERE key = 'r2use'").toArray()[0];
    return rollMonth(r ? JSON.parse(r.data) : { bytes: 0, month: monthOf(Date.now()), a: 0, b: 0 }, Date.now());
  }
  private saveR2Use(u: R2Use) {
    this.sql.exec("INSERT OR REPLACE INTO cache (key, data, at) VALUES ('r2use', ?, ?)", JSON.stringify(u), Date.now());
  }

  private cacheGet(key: string): string | undefined {
    return this.sql.exec<{ data: string }>('SELECT data FROM cache WHERE key = ?', key).toArray()[0]?.data;
  }
  private cacheSet(key: string, data: string) {
    this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', key, data, Date.now());
  }

  /** 사진 올리기: { mime, data(base64) } → { key }. 같은 사진(내용이 똑같은 파일)은 한 번만 저장하고 같은 열쇠를 준다 */
  private async solveImgPut(user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const bucket = this.r2();
    if (!bucket) return fail('사진 저장소(R2)가 아직 연결되지 않았어요.', 503);
    const mime = b.mime === 'image/webp' ? 'image/webp' : b.mime === 'image/jpeg' ? 'image/jpeg' : '';
    const data = typeof b.data === 'string' ? b.data : '';
    if (!mime || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) return fail('사진이 잘못됐어요.');
    const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    if (bin.length > 800_000) return fail('사진이 너무 커요.', 413);
    const sum = hex(await crypto.subtle.digest('SHA-256', bin));
    const same = this.cacheGet(`r2hash:${user.id}:${sum}`);
    if (same) return json({ key: same });
    const u = this.r2Use();
    const block = r2Block(u, 'put', bin.length);
    if (block) return fail(block, 507);
    const key = `${user.id}/${sum.slice(0, 16)}-${sum.slice(16, 24)}.${mime === 'image/webp' ? 'webp' : 'jpg'}`;
    await bucket.put(key, bin, { httpMetadata: { contentType: mime } });
    this.cacheSet(`r2hash:${user.id}:${sum}`, key);
    this.saveR2Use({ ...u, bytes: u.bytes + bin.length, a: u.a + 1 });
    return json({ key });
  }

  /** 예전에 올린 사진 중 똑같은 것은 하나만 남기고 지운다 (사람마다 한 번). 지운 열쇠는 남긴 사진으로 이어 준다 */
  private dedupeRunning = new Set<string>();
  private async r2Dedupe(userId: string): Promise<void> {
    const bucket = this.r2();
    if (!bucket || this.dedupeRunning.has(userId) || this.cacheGet(`r2dedup:${userId}`)) return;
    this.dedupeRunning.add(userId);
    try {
      let u = this.r2Use();
      const objs: { key: string; size: number; uploaded: number }[] = [];
      let cursor: string | undefined;
      let lists = 0;
      do {
        // 목록 읽기도 올리기(A) 횟수에 들어간다. 저장 공간이 찼어도 정리는 해야 하니 횟수만 본다
        if (u.a + lists + 1 > R2_STOP.a) return;
        const r = await bucket.list({ prefix: `${userId}/`, cursor, limit: 1000 });
        lists++;
        for (const o of r.objects) objs.push({ key: o.key, size: o.size, uploaded: o.uploaded.getTime() });
        cursor = r.truncated ? r.cursor : undefined;
      } while (cursor);
      // 내용(SHA-256)이 같은 것끼리 묶기. 똑같은 파일은 크기도 같으니, 크기가 겹치는 것만 받아 본다 (목록에는 크기가 같이 와서 읽기 횟수가 들지 않는다)
      const bySize = new Map<number, number>();
      for (const o of objs) bySize.set(o.size, (bySize.get(o.size) ?? 0) + 1);
      const groups = new Map<string, typeof objs>();
      let gets = 0;
      for (const o of objs.filter((x) => (bySize.get(x.size) ?? 0) > 1)) {
        if (r2Block({ ...u, a: u.a + lists, b: u.b + gets }, 'get')) break;
        const obj = await bucket.get(o.key);
        gets++;
        if (!obj) continue;
        const sum = hex(await crypto.subtle.digest('SHA-256', await obj.arrayBuffer()));
        groups.set(sum, [...(groups.get(sum) ?? []), o]);
      }
      const drop: string[] = [];
      let freed = 0;
      for (const [sum, g] of groups) {
        g.sort((a, b) => a.uploaded - b.uploaded);
        const keep = g[0].key;
        this.cacheSet(`r2hash:${userId}:${sum}`, keep);
        for (const o of g.slice(1)) {
          this.cacheSet(`r2alias:${o.key}`, keep);
          drop.push(o.key);
          freed += o.size;
        }
      }
      for (let i = 0; i < drop.length; i += 1000) await bucket.delete(drop.slice(i, i + 1000));
      u = this.r2Use();
      this.saveR2Use({ ...u, bytes: Math.max(0, u.bytes - freed), a: u.a + lists, b: u.b + gets });
      this.cacheSet(`r2dedup:${userId}`, JSON.stringify({ at: Date.now(), total: objs.length, removed: drop.length, freed }));
      console.log('r2 dedupe', userId, objs.length, 'objects,', drop.length, 'removed,', freed, 'bytes freed');
    } catch (e) {
      console.error('r2 dedupe failed', userId, e instanceof Error ? e.message : String(e));
    } finally {
      this.dedupeRunning.delete(userId);
    }
  }

  /** 사진 보기 (자기 것만). 읽기 횟수는 20번마다 저장 */
  private async solveImgGet(user: UserRow, key: string): Promise<Response> {
    const bucket = this.r2();
    if (!bucket) return fail('사진 저장소가 없어요.', 503);
    if (!key.startsWith(`${user.id}/`)) return fail('볼 수 없는 사진이에요.', 403);
    // 똑같은 사진이라 지운 것이면 남긴 사진으로
    key = this.cacheGet(`r2alias:${key}`) ?? key;
    const u = this.r2Use();
    const block = r2Block({ ...u, b: u.b + this.r2Ops }, 'get');
    if (block) return fail(block, 507);
    const obj = await bucket.get(key);
    this.r2Ops++;
    if (this.r2Ops >= 20) {
      this.saveR2Use({ ...u, b: u.b + this.r2Ops });
      this.r2Ops = 0;
    }
    if (!obj) return fail('사진이 없어요.', 404);
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  }

  /** 모델 고르는 창: 키가 있는 모델 · 오늘 쓴 횟수 · 남은 횟수(알 수 있을 때) */
  private async solveUsage(user: UserRow): Promise<Response> {
    // 같은 사진 정리는 한 번만, 뒤에서
    if (this.r2() && !this.cacheGet(`r2dedup:${user.id}`)) this.ctx.waitUntil(this.r2Dedupe(user.id));
    const engines: Engine[] = ['gemini', 'openrouter', 'mistral', 'groq', 'siliconflow', 'nvidia', 'huggingface', 'cloudflare'];
    const available = engines.filter((e) => this.keyOf(e));
    const orKey = this.keyOf('openrouter');
    if (orKey && (!this.orDaily || Date.now() - this.orDaily.at > 6 * 3600_000)) this.orDaily = { at: Date.now(), v: await openRouterDaily(orKey).catch(() => null) };
    const u = this.solveUse(user.id);
    const left: Record<string, number> = { ...u.left };
    let gemini: { flash: number; lite: number; gemma: number } | null = null;
    const gk = this.keyOf('gemini');
    if (gk) {
      if (!this.gemList || Date.now() - this.gemList.at > DAY) this.gemList = { at: Date.now(), v: await geminiModels(gk, this.gemFetch()).catch(() => []) };
      if (this.gemList.v.length) {
        const g = this.gemLeft(user.id);
        left.gemini = g.reduce((a, x) => a + x.left, 0);
        const sum = (re: RegExp, not?: RegExp) => g.filter((x) => re.test(x.model) && !(not && not.test(x.model))).reduce((a, x) => a + x.left, 0);
        gemini = { flash: sum(/flash/, /lite/), lite: sum(/flash-lite/), gemma: sum(/^gemma/) };
      }
    }
    if (this.orDaily?.v) left.openrouter = Math.max(0, this.orDaily.v - (u.n.openrouter ?? 0));
    // 사진을 읽을 수 있는 서비스 (모델 목록 기준, 6시간 기억)
    const vision: Record<string, boolean> = { gemini: true, cloudflare: true };
    if (available.includes('openrouter')) {
      if (!this.orList || Date.now() - this.orList.at > 6 * 3600_000) this.orList = { at: Date.now(), v: await openRouterModels().catch(() => []) };
      vision.openrouter = this.orList.v.some((m) => m.image);
    }
    for (const e of ['mistral', 'groq', 'siliconflow', 'nvidia', 'huggingface'] as const) {
      if (!available.includes(e)) continue;
      const entry = await this.compatEntry(e).catch(() => null);
      vision[e] = !!entry && pickCompat(entry.json, true, COMPAT[e].prefer).length > 0;
    }
    const r = this.r2Use();
    return json({ available, vision, used: u.n, out: u.out, left, gemini, r2: this.r2() ? { bytes: r.bytes, a: r.a, b: r.b + this.r2Ops, free: R2_FREE, stop: R2_STOP } : null });
  }

  /** { engine, turns: [{ role, text, images: [{ mime, data(base64) }] }] } → { text, model } */
  private async solve(user: UserRow, b: Record<string, unknown>, origin: string, step: (s: string) => void = () => {}): Promise<Response> {
    const ENG: Engine[] = ['gemini', 'openrouter', 'mistral', 'groq', 'siliconflow', 'nvidia', 'huggingface', 'cloudflare'];
    const engine = (ENG.includes(b.engine as Engine) ? b.engine : 'gemini') as Engine;
    const raw = Array.isArray(b.turns) ? b.turns.slice(-12) : [];
    let bytes = 0;
    const turns: SolveTurn[] = [];
    for (const t of raw as Record<string, unknown>[]) {
      if (!t || typeof t !== 'object') continue;
      const images = (Array.isArray(t.images) ? t.images : [])
        .slice(0, 4)
        .filter((i): i is { mime: string; data: string } => !!i && typeof i === 'object' && /^image\/(jpeg|png|webp)$/.test(String((i as { mime?: unknown }).mime)) && typeof (i as { data?: unknown }).data === 'string' && /^[A-Za-z0-9+/=]+$/.test((i as { data: string }).data));
      bytes += images.reduce((a, i) => a + i.data.length, 0);
      const imgKeys = (Array.isArray(t.imgKeys) ? t.imgKeys : []).filter((k): k is string => typeof k === 'string' && k.startsWith(`${user.id}/`) && /^[a-f0-9]{8,64}\/[a-z0-9]+-[a-f0-9]{8}\.(webp|jpg)$/.test(k)).slice(0, 4);
      turns.push({ role: t.role === 'assistant' ? 'assistant' : 'user', text: typeof t.text === 'string' ? t.text.slice(0, 8000) : '', images: images.length ? images : undefined, imgKeys: !images.length && imgKeys.length ? imgKeys : undefined });
    }
    // 이어서 묻기 · 다시 보내기: 사진을 다시 보내지 않았으면 저장소(R2)에 둔 사진을 꺼내 붙인다 (가장 최근 사진 질문 하나만)
    const withKeys = [...turns].reverse().find((t) => t.imgKeys?.length);
    let fromStore = false;
    const bucket = this.r2();
    if (withKeys && bucket && turns.reduce((a, t) => a + (t.images?.length ?? 0), 0) === 0) {
      const imgs: { mime: string; data: string }[] = [];
      for (const k0 of withKeys.imgKeys!) {
        const u = this.r2Use();
        if (r2Block({ ...u, b: u.b + this.r2Ops }, 'get')) break;
        const k = this.cacheGet(`r2alias:${k0}`) ?? k0;
        const obj = await bucket.get(k);
        this.r2Ops++;
        if (!obj) continue;
        const buf = new Uint8Array(await obj.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        imgs.push({ mime: obj.httpMetadata?.contentType === 'image/webp' ? 'image/webp' : 'image/jpeg', data: btoa(bin) });
        bytes += imgs[imgs.length - 1].data.length;
      }
      if (imgs.length) {
        withKeys.images = imgs;
        fromStore = true;
      }
    }
    for (const t of turns) delete t.imgKeys;
    if (!turns.length || turns[turns.length - 1].role !== 'user') return fail('물어볼 문제를 넣어 주세요.');
    if (bytes > MAX_STORE) return fail('사진이 너무 커요. 사진 수를 줄여 주세요.', 413);
    const wait = this.solveByUser.hit(user.id);
    if (wait) return fail(`너무 자주 물었어요. ${wait}초 뒤에 다시 해 주세요.`, 429);
    const key = this.keyOf(engine);
    if (!key) return fail('이 모델의 키가 아직 없어요.', 503);
    // 웹 검색 참고 (SerpApi, 사이트 전체 한 달 240번까지): 마지막 질문 글로 구글 검색 → 결과 몇 개를 질문 뒤에 붙인다
    if (b.web === true) {
      const last = turns[turns.length - 1];
      const q = last.text.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (q.length >= 4) {
        step('웹에서 찾아보는 중');
        const found = await this.webSearch(q).catch((e) => (console.error('serp failed', e instanceof Error ? e.message : String(e)), null));
        if (found?.length) last.text += `\n\n[웹 검색 결과 — 참고용이에요. 틀릴 수 있으니 풀이는 직접 확인하고, 참고했다면 어느 결과인지 밝혀 주세요]\n${found.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.link})`).join('\n')}`;
      }
    }
    let needImage = turns.some((t) => t.images?.length);
    /** 저장소에서 꺼낸 사진(이어서 묻기)은 사진을 못 읽는 모델이면 빼고 글만 보낸다 */
    const dropStored = () => {
      if (!fromStore) return false;
      for (const t of turns) delete t.images;
      needImage = false;
      return true;
    };
    const ok = (r: { text: string; model: string }, left?: number | null) => (this.bumpUse(user.id, engine, { left }), json(r));
    /** 앞에서부터 몇 개 모델을 해 보고, 사용량이 다 됐다는 답이면 바로 멈춘다 */
    const t0 = Date.now();
    const short = (m: string) => m.split('/').pop()!;
    /** 한 모델에 묻기: 너무 오래 걸리면(75초) 그 모델은 그만두고 다음으로 */
    const timed = <T>(p: Promise<T>, m: string) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('너무 오래 걸려서 다음 모델로')), THINKING.test(m) ? THINK_TIMEOUT : MODEL_TIMEOUT))]);
    /** 앞에서부터 6개까지 모델을 해 보고, 사용량이 다 됐다는 답이면 바로 멈춘다.
     *  잠깐 막히면(429) 같은 묶음(다른 이름의 같은 모델)은 건너뛰고 다음 모델로. 무료 한도는 모델마다 따로다 (Mistral 콘솔 「모델별」 한도) */
    const tryModels = async (models: string[], ask: (m: string, big?: boolean) => Promise<{ text: string; remaining?: number | null }>, bigOk = true) => {
      let last = '';
      const tried: string[] = [];
      const blockedFam = new Set<string>();
      const list = models.slice(0, 12);
      for (const [i, m] of list.entries()) {
        if (blockedFam.has(modelFamily(m))) continue;
        if (tried.length >= 6) break;
        // 전체로 너무 오래 걸렸으면 새 모델은 그만
        if (tried.length > 0 && Date.now() - t0 > SOLVE_BUDGET) break;
        // 생각하다 글자 수 한도에 걸리면 더 길게 쓰게 해서 같은 모델로 한 번 더
        let big = false;
        for (let again = 0; again < 2; again++) {
          step(`${short(m)} 에게 묻는 중${tried.length ? ` (${tried.length + 1}번째 모델)` : ''}${big ? ' · 더 길게 쓰게 해서 다시' : ''}${THINKING.test(m) || big ? ' · 오래 생각하는 모델이라 1~2분 걸릴 수 있어요' : ''}`);
          const t1 = Date.now();
          try {
            const r = await timed(ask(m, big), m);
            console.log('solve model ok', engine, m, `${Date.now() - t1}ms`);
            return ok({ text: r.text, model: m }, r.remaining);
          } catch (e) {
            last = e instanceof Error ? e.message : String(e);
            console.error('solve model failed', engine, m, `${Date.now() - t1}ms`, last);
            if (/글자 수 한도/.test(last) && !big && bigOk) {
              big = true;
              continue;
            }
            break;
          }
        }
        tried.push(`${short(m)}: ${last.slice(0, 80)}`);
        // 계정 전체가 막힌 것(하루 사용량 · 크레딧)은 멈추고, 그 모델만 막히거나(429) 바쁘거나(503) 없거나(404) 한 것은 잠깐 쉬고 다음 모델로
        if (/사용량|크레딧/.test(last)) break;
        if (/잠깐 막혔/.test(last)) blockedFam.add(modelFamily(m));
        if (i < list.length - 1) await new Promise((r) => setTimeout(r, /^503|busy|잠깐 막혔/i.test(last) ? 1500 : 500));
      }
      // 어떤 모델을 해 봤고 각각 왜 안 됐는지 화면에도 보이게
      throw new Error(tried.length > 1 ? `모델 ${tried.length}개 모두 안 됐어요 → ${tried.join(' / ')}` : last || '답하지 못했어요');
    };
    try {
      if (engine === 'gemini') {
        if (!this.gemList || Date.now() - this.gemList.at > DAY) this.gemList = { at: Date.now(), v: await geminiModels(key, this.gemFetch()) };
        // 한도가 남은 모델부터. 한 모델이 다 됐다고(429) 하면 그 모델만 막고 다음 모델로
        // 모델 목록에서 하나도 못 고르면 알려진 이름으로 해 본다
        const chain = this.gemLeft(user.id).map((x) => x.model);
        if (!chain.length) throw new Error('Gemini 무료 사용량을 다 썼어요');
        let last = '';
        const tried: string[] = [];
        for (const [i, m] of chain.slice(0, 8).entries()) {
          if (i > 0 && Date.now() - t0 > SOLVE_BUDGET) break;
          step(`${m} 에게 묻는 중`);
          const t1 = Date.now();
          try {
            const text = await timed(askGemini(key, m, turns, this.gemFetch()), m);
            console.log('solve model ok', 'gemini', m, `${Date.now() - t1}ms`);
            this.bumpGem(user.id, m);
            return ok({ text, model: m });
          } catch (e) {
            last = e instanceof Error ? e.message : String(e);
            tried.push(`${m}: ${last.slice(0, 80)}`);
            console.error('solve model failed', 'gemini', m, `${Date.now() - t1}ms`, last);
            // 하루 한도면 그 모델만 오늘 막고, 분당 한도면 이번만 건너뛴다
            // 하루 한도 · 없는 모델(404)은 오늘 그 모델을 건너뛴다
            if (/사용량|Gemini 404/.test(last)) this.bumpGem(user.id, m, true);
          }
        }
        throw new Error(tried.length > 1 ? `Gemini 모델 ${tried.length}개 모두 안 됐어요 → ${tried.join(' / ')}` : last || 'Gemini 가 답하지 못했어요');
      }
      if (engine === 'openrouter') {
        if (!this.orList || Date.now() - this.orList.at > 6 * 3600_000) this.orList = { at: Date.now(), v: await openRouterModels() };
        let models = this.orList.v.filter((m) => !needImage || m.image).map((m) => m.id);
        if (!models.length && dropStored()) models = this.orList.v.map((m) => m.id);
        if (!models.length) return fail(needImage ? '지금 사진을 읽는 무료 모델이 없어요. 다른 모델을 골라 주세요.' : '지금 쓸 수 있는 무료 모델이 없어요.', 503);
        return await tryModels(models, async (m) => ({ text: await askOpenRouter(key, m, turns, origin) }));
      }
      if (engine === 'cloudflare') {
        if (this.translateAll.hit('all')) return fail('오늘 사이트 전체의 AI 한도를 다 썼어요. 한국 시간 오전 9시 뒤에 다시 해 주세요.', 429);
        const ai = this.env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> };
        if (needImage) {
          // 사진: Meta Llama 3.2 11B Vision. 처음 쓸 때 사용 조건 동의(prompt: "agree")가 필요하다 (Cloudflare 문서)
          const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
          if (!this.cfAgreed) {
            await ai.run(VISION_MODEL, { prompt: 'agree' }).catch(() => undefined);
            this.cfAgreed = true;
          }
          const last = turns[turns.length - 1];
          const img = last.images?.[0] ?? turns.flatMap((t) => t.images ?? [])[0];
          const out = await ai.run(VISION_MODEL, { messages: [{ role: 'system', content: SOLVE_SYSTEM }, ...turns.map((t) => ({ role: t.role, content: t.text || '이 문제를 풀어 줘.' }))], image: `data:${img.mime};base64,${img.data}`, max_tokens: 2048 });
          const text = readOutput(out);
          if (!text) throw new Error('Cloudflare AI 가 답을 주지 않았어요');
          return ok({ text, model: VISION_MODEL.replace('@cf/', '') });
        }
        const out = await ai.run(TRANSLATE_MODEL, { messages: [{ role: 'system', content: SOLVE_SYSTEM }, ...turns.map((t) => ({ role: t.role, content: t.text || '(사진 문제)' }))], reasoning: { effort: 'medium' }, max_tokens: 6000 });
        const text = readOutput(out);
        if (!text) throw new Error('Cloudflare AI 가 답을 주지 않았어요');
        return ok({ text, model: TRANSLATE_MODEL.replace('@cf/', '') });
      }
      // Mistral · Groq · SiliconFlow · NVIDIA: 모델 목록에서 고르기
      const c = COMPAT[engine];
      const entry = await this.compatEntry(engine);
      let models = pickCompat(entry.json, needImage, c.prefer, c.first);
      if (!models.length && dropStored()) models = pickCompat(entry.json, false, c.prefer, c.first);
      if (!models.length) return fail(needImage ? '이 서비스에는 사진을 읽는 모델이 없어요. 다른 모델을 골라 주세요.' : '쓸 수 있는 모델이 없어요.', 503);
      return await tryModels(models, (m, big) => askCompat(entry.base, key, m, turns, big ? 16_000 : 6000), engine !== 'mistral');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('solve failed', engine, msg);
      if (/잠깐 막혔/.test(msg)) return fail(`${msg} 잠시 뒤 다시 하거나 다른 모델을 골라 주세요.`, 429);
      if (/사용량|크레딧|quota|exhaust|neuron/i.test(msg)) {
        // Gemini 는 모델마다 따로 막는다 (전체를 막지 않음)
        if (engine !== 'gemini') this.bumpUse(user.id, engine, { out: true });
        return fail(`${/크레딧/.test(msg) ? '크레딧이 없어요.' : '오늘 무료 사용량을 다 썼어요.'} 다른 모델을 골라 주세요.`, 429);
      }
      return fail(`풀지 못했어요: ${msg.slice(0, 200)}`, 502);
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
  /** NBA 하루 경기 (미국 날짜). 1분에 5번이라 기억해 둔다: 지난 날 하루 · 오늘·어제 1분(경기 중 점수) · 앞날 3시간 */
  private async nbaGames(date: string | null): Promise<Response> {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('날짜를 확인해 주세요.');
    const key = this.nbaKey();
    if (!key) return fail('NBA 를 보려면 balldontlie 키가 필요해요.', 503);
    const usToday = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const age = date < usToday && Date.parse(usToday) - Date.parse(date) > DAY ? DAY : date > usToday ? 3 * 3600_000 : 60_000;
    const ck = `nba:${date}`;
    const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
    if (c && Date.now() - c.at < age) return json({ games: JSON.parse(c.data), at: c.at });
    try {
      const games = await fetchGames(key, date);
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(games), Date.now());
      return json({ games, at: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('nba failed', date, msg);
      if (c) return json({ games: JSON.parse(c.data), at: c.at, stale: true });
      return fail(`NBA 경기를 받지 못했어요. (${msg.slice(0, 120)})`, /잠깐/.test(msg) ? 429 : 502);
    }
  }

  /** stats.nba.com 은 Cloudflare 에 답하지 않을 때가 많다: 한 번 안 되면 1시간 동안은 묻지 않고 바로 다른 길로 (서버가 다시 시작해도 기억) */
  private async stats<T>(get: () => Promise<T>): Promise<T> {
    const until = Number(this.cacheGet('nba:statsdown') ?? 0);
    if (Date.now() < until) throw new Error('stats.nba.com 이 우리 서버에 답하지 않아요 (잠시 쉬는 중)');
    try {
      return await get();
    } catch (e) {
      this.cacheSet('nba:statsdown', String(Date.now() + 3600_000));
      throw e;
    }
  }

  private hlKey(): string | undefined {
    const env = this.env as unknown as Record<string, string | undefined>;
    return env.Highlightly || env.HIGHLIGHTLY_KEY;
  }
  private nbaKey(): string | undefined {
    const env = this.env as unknown as Record<string, string | undefined>;
    return env.balldontlie || env.BALLDONTLIE_KEY;
  }
  /** 기억해 둔 값 (ms 안이면) 또는 새로 받아 기억 */
  private async nbaCached<T>(ck: string, ms: number, get: () => Promise<T>): Promise<{ v: T; at: number; stale?: boolean }> {
    const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
    if (c && Date.now() - c.at < ms) return { v: JSON.parse(c.data) as T, at: c.at };
    try {
      const v = await get();
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(v), Date.now());
      return { v, at: Date.now() };
    } catch (e) {
      // 받아 둔 게 있으면 오래됐어도 그걸로 (유료라서 안 되는 건 그대로 알린다)
      if (c && !(e instanceof Paid)) return { v: JSON.parse(c.data) as T, at: c.at, stale: true };
      throw e;
    }
  }
  private nbaFail(e: unknown, what: string): Response {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('nba failed', what, msg);
    if (e instanceof Paid) return fail(msg, 402);
    return fail(`${what}을 받지 못했어요. (${msg.slice(0, 120)})`, /잠깐/.test(msg) ? 429 : 502);
  }

  /** 순위: 순위 기능이 되면 그걸로(3시간 기억), 유료라면 이번 시즌 끝난 경기로 직접 센다 (6시간마다 뒤에서 모음) */
  private nbaBuilding = false;
  private async nbaStandings(): Promise<Response> {
    const key = this.nbaKey();
    if (!key) return fail('NBA 를 보려면 balldontlie 키가 필요해요.', 503);
    const season = seasonOf(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
    // 1) NBA 공식 순위 (키 없음)
    try {
      const r = await this.nbaCached(`nba:standings:nbacom:${season}`, 3 * 3600_000, () => this.stats(() => fetchNbaStandings(season)));
      if (r.v.length) return json({ season, rows: r.v, at: r.at, from: 'nba' });
    } catch (e) {
      console.error('nba.com standings failed', e instanceof Error ? e.message : String(e));
    }
    // 2) Highlightly 순위
    const hk = this.hlKey();
    if (hk) {
      try {
        const abbrOf = (name: string, ab: string) => Object.entries(NBA_TEAM_NAMES).find(([a, nm]) => a === ab.toUpperCase() || norm2(nm) === norm2(name))?.[0] ?? '';
        const r = await this.nbaCached(`hl:standings:${season}`, 3 * 3600_000, () => fetchHlStandings(hk, abbrOf));
        if (r.v.length >= 20) return json({ season, rows: r.v, at: r.at, from: 'hl' });
      } catch (e) {
        console.error('highlightly standings failed', e instanceof Error ? e.message : String(e));
      }
    }
    // 3) balldontlie 순위 (유료일 수 있음) → 4) 끝난 경기로 직접 세기
    const paidMark = this.sql.exec<{ at: number }>("SELECT at FROM cache WHERE key = 'nba:standings:paid'").toArray()[0];
    if (!paidMark || Date.now() - paidMark.at > 7 * DAY) {
      try {
        const r = await this.nbaCached(`nba:standings:${season}`, 3 * 3600_000, () => fetchStandings(key, season));
        if (r.v.length) return json({ season, rows: r.v, at: r.at, from: 'api' });
      } catch (e) {
        if (!(e instanceof Paid)) return this.nbaFail(e, '순위');
        this.sql.exec("INSERT OR REPLACE INTO cache (key, data, at) VALUES ('nba:standings:paid', '1', ?)", Date.now());
      }
    }
    const ck = `nba:season:${season}`;
    const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
    const games = c ? (JSON.parse(c.data) as NbaGame[]) : [];
    if ((!c || Date.now() - c.at > 6 * 3600_000) && !this.nbaBuilding) this.ctx.waitUntil(this.nbaBuildSeason(key, season));
    return json({ season, rows: standingsFrom(games), at: c?.at ?? 0, from: 'games', building: this.nbaBuilding });
  }
  /** 이번 시즌 경기를 모두 받아 기억 (1분 5번 한도라 쪽마다 13초 쉰다) */
  private async nbaBuildSeason(key: string, season: number) {
    this.nbaBuilding = true;
    // 서버가 중간에 쉬어도 이어서 받게, 받은 만큼과 다음 쪽을 적어 둔다 (1시간 안이면 이어서)
    const pk = `nba:season:${season}:partial`;
    try {
      const p = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', pk).toArray()[0];
      const prev = p && Date.now() - p.at < 3600_000 ? (JSON.parse(p.data) as { games: NbaGame[]; cursor?: number }) : null;
      const all: NbaGame[] = prev?.games ?? [];
      let cursor: number | undefined = prev?.cursor;
      for (let i = 0; i < 20; i++) {
        const r = await seasonPage(key, season, cursor);
        all.push(...r.games.filter((g) => /final/i.test(g.status)));
        cursor = r.next;
        if (!cursor) break;
        this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', pk, JSON.stringify({ games: all, cursor }), Date.now());
        await new Promise((res) => setTimeout(res, 13_000));
      }
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', `nba:season:${season}`, JSON.stringify(all), Date.now());
      this.sql.exec('DELETE FROM cache WHERE key = ?', pk);
      console.log('nba season built', season, all.length);
    } catch (e) {
      console.error('nba season build failed', e instanceof Error ? e.message : String(e));
    } finally {
      this.nbaBuilding = false;
    }
  }
  /** 경기 선수 기록: NBA 공식(키 없음)을 먼저, 안 되면 balldontlie(유료일 수 있음). 끝난 경기는 7일, 경기 중은 1분 기억 */
  private async nbaBox(q: URLSearchParams): Promise<Response> {
    const game = Number(q.get('game'));
    const final = q.get('final') === '1';
    const date = q.get('date') ?? '';
    const home = (q.get('home') ?? '').toUpperCase();
    const away = (q.get('away') ?? '').toUpperCase();
    if (!Number.isInteger(game) || game <= 0) return fail('경기를 확인해 주세요.');
    const ms = final ? 7 * DAY : 60_000;
    let why = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^[A-Z]{3}$/.test(home) && /^[A-Z]{3}$/.test(away)) {
      try {
        const gid = await this.nbaCached(`nba:gid:${game}`, 365 * DAY, async () => {
          const id = await nbaGameId(date, home, away);
          if (!id) throw new Error('NBA 경기 번호를 찾지 못했어요');
          return id;
        });
        const r = await this.nbaCached(`nba:box:nbacom:${gid.v}`, ms, () => fetchNbaBox(gid.v));
        if (r.v.length) return json({ lines: r.v, at: r.at, src: 'nba' });
      } catch (e) {
        why = e instanceof Error ? e.message : String(e);
        console.error('nba.com box failed', game, why);
      }
    }
    // 2) Highlightly (키 「Highlightly」): 날짜 · 두 팀으로 경기를 찾아 박스스코어
    const hk = this.hlKey();
    const homeName = (q.get('homeName') ?? '').slice(0, 40);
    const awayName = (q.get('awayName') ?? '').slice(0, 40);
    if (hk && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      try {
        const mid = await this.nbaCached(`hl:mid:${game}`, 365 * DAY, async () => {
          const id = await hlMatchId(hk, date, { abbr: home, name: homeName }, { abbr: away, name: awayName });
          if (!id) throw new Error('Highlightly 에서 경기를 찾지 못했어요');
          return id;
        });
        const abbrOf = (teamName: string) => (sameTeam({ name: teamName, displayName: teamName }, '', homeName) ? home : sameTeam({ name: teamName, displayName: teamName }, '', awayName) ? away : '');
        const r = await this.nbaCached(`hl:box:${mid.v}`, ms, () => fetchHlBox(hk, mid.v, abbrOf));
        if (r.v.length) return json({ lines: r.v, at: r.at, src: 'hl' });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        why = why ? `${why} / ${m}` : m;
        console.error('highlightly box failed', game, m);
      }
    }
    // balldontlie 경기 선수 기록은 유료(ALL-STAR)라서 부르지 않는다
    if (why) console.error('box all failed', why);
    return fail(final ? '이 경기 선수 기록을 찾지 못했어요. (NBA 공식 · Highlightly 둘 다 없음)' : '아직 선수 기록이 없어요. 경기가 시작하면 나와요.', 502);
  }

  /** 선수 시즌 평균: NBA 공식 전체 표(6시간 기억)에서 번호(공식 기록에서 온 선수) 또는 이름으로 찾고, 없으면 balldontlie */
  private async nbaAvg(q: URLSearchParams): Promise<Response> {
    const player = Number(q.get('player'));
    const season = Number(q.get('season'));
    const name = (q.get('name') ?? '').trim().slice(0, 80);
    const src = q.get('src') === 'nba' ? 'nba' : 'bdl';
    if (!Number.isInteger(player) || player < 0 || (!player && !name) || !Number.isInteger(season) || season < 1990 || season > 2100) return fail('선수를 확인해 주세요.');
    const norm = (x: string) =>
      x
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    try {
      const all = await this.nbaCached(`nba:avgs2:nbacom:${season}`, 6 * 3600_000, () => this.stats(() => fetchNbaAverages(season)));
      const hit = all.v.find((p) => (src === 'nba' ? p.id === player : norm(p.name) === norm(name)));
      if (hit) return json({ avg: hit, at: all.at });
      if (src === 'nba') return json({ avg: null, at: all.at });
    } catch (e) {
      console.error('nba.com averages failed', e instanceof Error ? e.message : String(e));
    }
    // balldontlie 시즌 평균은 유료(GOAT)라서 부르지 않는다. Highlightly 선수 시즌 기록으로 (이름으로 찾음)
    const hk = this.hlKey();
    if (hk && name) {
      try {
        const r = await this.nbaCached(`hl:player2:${name.toLowerCase()}`, DAY, () => fetchHlPlayerSeasons(hk, name));
        return json({ avg: r.v ? hlAverage(r.v.seasons, season) : null, at: r.at, src: 'hl' });
      } catch (e) {
        console.error('highlightly avg failed', name, e instanceof Error ? e.message : String(e));
      }
    }
    return fail('NBA 공식 기록 서버가 지금 우리 서버에 답하지 않아서, 아래 Highlightly 기록으로 보여 줘요.', 502);
  }

  /** 구글 검색 (SerpApi). 사이트 전체로 한 달 240번까지 (무료 250번) */
  private async webSearch(q: string): Promise<{ title: string; snippet: string; link: string }[] | null> {
    const key = this.secret('serpapi', 'serpapikey', 'serp', 'serpkey', 'serpapiapikey');
    if (!key) return null;
    const mk = `serp:${new Date().toISOString().slice(0, 7)}`;
    const used = Number(this.cacheGet(mk) ?? 0);
    if (used >= 240) return null;
    this.cacheSet(mk, String(used + 1));
    const res = await within(fetch(`https://serpapi.com/search.json?${new URLSearchParams({ engine: 'google', q, hl: 'ko', gl: 'kr', num: '5', api_key: key })}`), 15_000, 'SerpApi');
    if (!res.ok) throw new Error(`SerpApi ${res.status}`);
    const j = (await res.json()) as { answer_box?: { title?: string; answer?: string; snippet?: string; link?: string }; organic_results?: { title?: string; snippet?: string; link?: string }[] };
    const out: { title: string; snippet: string; link: string }[] = [];
    const ab = j.answer_box;
    if (ab && (ab.answer || ab.snippet)) out.push({ title: ab.title ?? '바로 답', snippet: String(ab.answer ?? ab.snippet).slice(0, 300), link: ab.link ?? '' });
    for (const r of j.organic_results ?? []) if (r.title && r.snippet) out.push({ title: r.title.slice(0, 120), snippet: r.snippet.slice(0, 300), link: r.link ?? '' });
    return out.slice(0, 5);
  }

  /** 음반 찾기 (Discogs, 키 · 비밀은 Cloudflare 비밀값). 2000년 이후 · 모은 사람 100명 넘는 것만, 인기 순 */
  private async discogs(q: string): Promise<Response> {
    if (q.length < 2) return fail('찾을 음반이나 가수를 넣어 주세요.');
    const key = this.secret('discogskey', 'discogsconsumerkey', 'discogsuserkey', 'discogsapikey');
    const sec = this.secret('discogssecret', 'discogsconsumersecret', 'discogsusersecret', 'discogsapisecret');
    const token = this.secret('discogs', 'discogstoken', 'discogsusertoken', 'discogspersonaltoken', 'discogsaccesstoken');
    const auth = key && sec ? `Discogs key=${key}, secret=${sec}` : token ? `Discogs token=${token}` : '';
    if (!auth) return fail('Discogs 키가 아직 없어요.', 503);
    const ck = `discogs:${q.toLowerCase()}`;
    const c = this.cacheGet(ck);
    if (c) {
      const v = JSON.parse(c) as { at: number; list: unknown[] };
      if (Date.now() - v.at < 7 * DAY) return json({ list: v.list });
    }
    try {
      // Discogs 는 보내는 곳(IP)마다 1분 횟수를 센다. Cloudflare 주소는 여럿이 같이 써서 429 가 날 수 있다 → 잠시 뒤, 미국 중계 서버로도 다시
      const url = `https://api.discogs.com/database/search?${new URLSearchParams({ q, type: 'master', per_page: '50' })}`;
      const init = { headers: { authorization: auth, 'user-agent': 'LifeApp/1.0 +https://life.silent-recipe-8e5c.workers.dev' } };
      let res = await within(fetch(url, init), 15_000, 'Discogs');
      for (let i = 0; i < 2 && res.status === 429; i++) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        res = await within((i === 0 ? this.gemFetch() : fetch)(url, init), 15_000, 'Discogs');
      }
      // 그래도 막히면 기기가 직접 찾게 한다 (기기 주소는 따로 센다. 키 없이라 표지는 없음)
      if (res.status === 429) return json({ busy: true, list: [] });
      if (!res.ok) throw new Error(`Discogs ${res.status}`);
      const j = (await res.json()) as { results?: { id?: number; title?: string; year?: string; cover_image?: string; thumb?: string; genre?: string[]; style?: string[]; community?: { have?: number; want?: number } }[] };
      const list = (j.results ?? [])
        .map((r) => {
          const [artist, ...rest] = (r.title ?? '').split(' - ');
          return {
            id: r.id ?? 0,
            artist: rest.length ? artist.replace(/\s*\(\d+\)$/, '').replace(/\*$/, '') : '',
            title: rest.length ? rest.join(' - ') : artist,
            year: Number(r.year) || 0,
            cover: r.cover_image || r.thumb || '',
            genre: (r.genre ?? []).slice(0, 3),
            style: (r.style ?? []).slice(0, 3),
            have: r.community?.have ?? 0,
            want: r.community?.want ?? 0,
          };
        })
        .filter((r) => r.id && r.year >= 2000 && r.have >= 100)
        .sort((a, b) => b.have - a.have)
        .slice(0, 20);
      this.cacheSet(ck, JSON.stringify({ at: Date.now(), list }));
      return json({ list });
    } catch (e) {
      return fail(`음반을 찾지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502);
    }
  }

  private steamKey() {
    return this.secret('steam', 'steamkey', 'steamapikey', 'steamwebapikey', 'steamapi');
  }
  /** Steam 게임 찾기 (한국 상점 값, 원) */
  private async gameSearch(q: string): Promise<Response> {
    if (q.length < 1) return fail('게임 이름을 넣어 주세요.');
    try {
      const r = await this.nbaCached(`st:search:${q.toLowerCase()}`, 6 * 3600_000, () => storeSearch(q));
      return json({ list: r.v });
    } catch (e) {
      return fail(`게임을 찾지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502);
    }
  }
  /** 여러 게임의 지금 한국 Steam 값 (3시간 기억) + 이 앱이 본 가장 싼 값 */
  private async gamePrices(ids: number[]): Promise<Response> {
    if (!ids.length) return json({ prices: {} });
    try {
      return json({ prices: await this.steamPrices(ids) });
    } catch (e) {
      return fail(`값을 받지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502);
    }
  }
  private async steamPrices(ids: number[]): Promise<Record<number, KrPrice & { low: number; lowAt: number }>> {
    const out: Record<number, KrPrice & { low: number; lowAt: number }> = {};
    const need: number[] = [];
    const lowOf = (id: number) => (JSON.parse(this.cacheGet(`st:low:${id}`) ?? 'null') as { low: number; at: number } | null) ?? null;
    for (const id of ids) {
      const c = this.cacheGet(`st:price:${id}`);
      const v = c ? (JSON.parse(c) as { at: number; v: KrPrice }) : null;
      const low = lowOf(id);
      if (v && Date.now() - v.at < 3 * 3600_000) out[id] = { ...v.v, low: low?.low ?? v.v.final, lowAt: low?.at ?? v.at };
      else need.push(id);
    }
    if (need.length) {
      const got = await krPrices(need);
      for (const [k, v] of Object.entries(got)) {
        const id = Number(k);
        this.cacheSet(`st:price:${id}`, JSON.stringify({ at: Date.now(), v }));
        // 여기서 본 가장 싼 값을 적어 둔다 (Steam 이 역대 최저를 알려 주지 않아서)
        const low = lowOf(id);
        const keep = low && low.low <= v.final ? low : { low: v.final, at: Date.now() };
        if (!low || keep !== low) this.cacheSet(`st:low:${id}`, JSON.stringify(keep));
        out[id] = { ...v, low: keep.low, lowAt: keep.at };
      }
    }
    return out;
  }
  /** 예전 CheapShark 번호 → Steam 번호 (예전에 넣은 게임 옮기기) */
  private async csMap(ids: number[]): Promise<Response> {
    try {
      const j = (await cheapShark(`games?ids=${ids.slice(0, 25).join(',')}`)) as Record<string, { info?: { steamAppID?: string | null } }>;
      return json({ map: Object.fromEntries(Object.entries(j).map(([k, v]) => [k, Number(v.info?.steamAppID) || 0])) });
    } catch (e) {
      return fail(`옮기지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502);
    }
  }
  /** 내 Steam: 프로필 · 가진 게임 · 찜 목록 (10분 기억). 가진 게임은 키(steam)가 있어야 */
  private async steamMeRoute(steamid: string): Promise<Response> {
    if (!/^\d{17}$/.test(steamid)) return fail('Steam ID(17자리 숫자)를 확인해 주세요.');
    const key = this.steamKey();
    try {
      const wish = await this.nbaCached(`st:wish:${steamid}`, 10 * 60_000, () => wishlist(steamid)).catch(() => ({ v: [] as { appid: number; added: number }[] }));
      if (!key) return json({ me: null, wish: wish.v, needKey: true });
      const me = await this.nbaCached(`st:me:${steamid}`, 10 * 60_000, () => steamMe(key, steamid));
      this.steamSnap(steamid, me.v);
      return json({ me: me.v, wish: wish.v, hist: this.steamHist(steamid) });
    } catch (e) {
      return fail(`Steam 정보를 받지 못했어요. 프로필이 「공개」인지 확인해 주세요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502);
    }
  }
  /** 하루 한 번(마지막 것으로) 게임마다 모두 한 시간을 적어 둔다 → 날마다 한 시간 = 다음 날 기록과의 차이 (최근 70일) */
  private steamSnap(steamid: string, me: { owned: { appid: number; minutes: number }[] }) {
    const ck = `st:hist:${steamid}`;
    const h = (JSON.parse(this.cacheGet(ck) ?? '{}') as Record<string, Record<number, number>>) ?? {};
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    h[day] = Object.fromEntries(me.owned.filter((g) => g.minutes > 0).map((g) => [g.appid, g.minutes]));
    const keep = Object.keys(h).sort().slice(-70);
    this.cacheSet(ck, JSON.stringify(Object.fromEntries(keep.map((k) => [k, h[k]]))));
  }
  private steamHist(steamid: string): Record<string, Record<number, number>> {
    return (JSON.parse(this.cacheGet(`st:hist:${steamid}`) ?? '{}') as Record<string, Record<number, number>>) ?? {};
  }
  /** 찜 할인 알림 · 한 시간 기록을 서버가 6시간마다 하게: { steamid, on } */
  private steamWatch(req: Request, user: UserRow, b: Record<string, unknown>): Response {
    const ck = `steamwish:${user.id}`;
    const steamid = typeof b.steamid === 'string' && /^\d{17}$/.test(b.steamid) ? b.steamid : '';
    const prev = JSON.parse(this.cacheGet(ck) ?? 'null') as { sent?: Record<string, number>; alert?: boolean } | null;
    // track: 알림 없이 게임 시간만 서버가 6시간마다 적어 두게 (이미 알림을 켰으면 그대로)
    if (b.track === true) {
      if (steamid) this.cacheSet(ck, JSON.stringify({ steamid, origin: new URL(req.url).origin, sent: prev?.sent ?? {}, alert: prev ? prev.alert !== false : false }));
      void this.scheduleAlarm();
      return json({ on: !!prev && prev.alert !== false });
    }
    // 알림 끄기: 게임 시간 적기는 계속
    if (steamid) this.cacheSet(ck, JSON.stringify({ steamid, origin: new URL(req.url).origin, sent: prev?.sent ?? {}, alert: b.on === true }));
    else this.sql.exec('DELETE FROM cache WHERE key = ?', ck);
    void this.scheduleAlarm();
    return json({ on: !!steamid && b.on === true });
  }
  private steamWatchOn(user: UserRow): boolean {
    const v = JSON.parse(this.cacheGet(`steamwish:${user.id}`) ?? 'null') as { alert?: boolean } | null;
    return !!v && v.alert !== false;
  }
  /** 찜한 게임이 새로 할인하면 한 번 알림 (같은 값이면 다시 안 보냄) · 한 시간 기록 */
  private async steamWishCheck() {
    const rows = this.sql.exec<{ key: string; data: string }>("SELECT key, data FROM cache WHERE key LIKE 'steamwish:%'").toArray();
    const key = this.steamKey();
    for (const row of rows) {
      const uid = row.key.slice('steamwish:'.length);
      const v = JSON.parse(row.data) as { steamid: string; origin: string; sent: Record<string, number>; alert?: boolean };
      try {
        if (key) this.steamSnap(v.steamid, await steamMe(key, v.steamid));
        if (v.alert === false) continue;
        const wish = await wishlist(v.steamid);
        const prices = await this.steamPrices(wish.map((w) => w.appid).slice(0, 150));
        const sale = wish.filter((w) => prices[w.appid]?.discount > 0 && v.sent[w.appid] !== prices[w.appid].final);
        for (const w of wish) if (!prices[w.appid]?.discount) delete v.sent[w.appid];
        if (sale.length) {
          for (const w of sale) v.sent[w.appid] = prices[w.appid].final;
          const names = await storeNames(sale.map((w) => w.appid)).catch(() => ({}) as Record<number, string>);
          const top = sale.sort((a, b) => prices[b.appid].discount - prices[a.appid].discount).slice(0, 3);
          const subs = this.sql.exec<PushSub & { [k: string]: SqlStorageValue }>('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?', uid).toArray();
          if (subs.length) await this.pushTo(subs, { title: `🎮 찜한 게임 ${sale.length}개 할인 시작`, body: top.map((w) => `${names[w.appid] ?? w.appid} ${prices[w.appid].discount}% → ${prices[w.appid].final.toLocaleString('ko-KR')}원`).join(' · '), url: '/#/games/wish' }, v.origin);
        }
        this.cacheSet(row.key, JSON.stringify(v));
      } catch (e) {
        console.error('steam wish check failed', e instanceof Error ? e.message : String(e));
      }
    }
  }
  /** 게임 그림 주소 (상점에서 받은 진짜 주소, 7일 기억) */
  private async steamThumbs(ids: number[]): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    const need: number[] = [];
    for (const id of ids) {
      const c = this.cacheGet(`st:thumb:${id}`);
      if (c !== undefined) out[id] = c;
      else need.push(id);
    }
    if (need.length) {
      const got = await storeItems(need);
      for (const id of need) {
        out[id] = got[id]?.thumb ?? '';
        this.cacheSet(`st:thumb:${id}`, out[id]);
      }
    }
    return out;
  }
  private async steamAchRoute(steamid: string, appid: number): Promise<Response> {
    const key = this.steamKey();
    if (!key) return fail('Steam 키가 아직 없어요.', 503);
    if (!/^\d{17}$/.test(steamid) || !Number.isInteger(appid) || appid <= 0) return fail('게임을 확인해 주세요.');
    try {
      const r = await this.nbaCached(`st:ach:${steamid}:${appid}`, 30 * 60_000, () => steamAchievements(key, steamid, appid));
      return json(r.v);
    } catch (e) {
      return fail(`업적을 받지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`, 502);
    }
  }
  /** 값 알림: 이 값(원) 아래로 내려가면 알림. { list: [{ id(Steam 번호), title, target }] } (빈 목록이면 끔) */
  private gameWatch(req: Request, user: UserRow, b: Record<string, unknown>): Response {
    const list = (Array.isArray(b.list) ? b.list : [])
      .map((x) => x as { id?: unknown; title?: unknown; target?: unknown })
      .filter((x) => Number.isInteger(x.id) && typeof x.target === 'number' && x.target > 0 && x.target < 10_000_000)
      .slice(0, 50)
      .map((x) => ({ id: x.id as number, title: String(x.title ?? '').slice(0, 80), target: x.target as number }));
    const ck = `gamewatch:${user.id}`;
    if (!list.length) this.sql.exec('DELETE FROM cache WHERE key = ?', ck);
    else {
      const old = this.cacheGet(ck);
      const sent = old ? ((JSON.parse(old) as { sent?: Record<string, number> }).sent ?? {}) : {};
      this.cacheSet(ck, JSON.stringify({ list, origin: new URL(req.url).origin, sent, krw: true }));
    }
    void this.scheduleAlarm();
    return json({ ok: true, n: list.length });
  }
  /** 6시간마다: 값 알림을 건 게임의 한국 Steam 값이 목표 아래면 알림 (같은 값이면 다시 안 보냄) */
  private async gameWatchCheck() {
    const rows = this.sql.exec<{ key: string; data: string }>("SELECT key, data FROM cache WHERE key LIKE 'gamewatch:%'").toArray();
    const parsed = rows.map((r) => ({ r, v: JSON.parse(r.data) as { list: { id: number; title: string; target: number }[]; origin: string; sent: Record<string, number>; krw?: boolean } })).filter((x) => x.v.krw);
    const all = [...new Set(parsed.flatMap((x) => x.v.list.map((g) => g.id)))];
    if (!all.length) return;
    const prices = await this.steamPrices(all);
    for (const { r, v } of parsed) {
      const uid = r.key.slice('gamewatch:'.length);
      const msgs: { title: string; body: string; url: string }[] = [];
      for (const g of v.list) {
        const p = prices[g.id];
        if (!p || !p.final || p.final > g.target || v.sent[g.id] === p.final) continue;
        v.sent[g.id] = p.final;
        msgs.push({
          title: `🎮 ${g.title} ${p.final.toLocaleString('ko-KR')}원`,
          body: `Steam ${p.discount ? `${p.discount}% 할인 · 정가 ${p.initial.toLocaleString('ko-KR')}원 → ` : ''}${p.final.toLocaleString('ko-KR')}원 · 정해 둔 ${g.target.toLocaleString('ko-KR')}원 아래예요`,
          url: `https://store.steampowered.com/app/${g.id}/`,
        });
      }
      this.cacheSet(r.key, JSON.stringify(v));
      const subs = msgs.length ? this.sql.exec<PushSub & { [k: string]: SqlStorageValue }>('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?', uid).toArray() : [];
      for (const m of msgs) if (subs.length) await this.pushTo(subs, m, v.origin);
    }
  }

  private riotKey() {
    return this.secret('riot', 'riotkey', 'riotapikey', 'riotapi', 'lol', 'lolkey');
  }
  /** 롤 프로필: { id: '이름#태그' } → 계정 · 레벨 · 랭크 · 숙련도 (10분 기억) */
  private async lolProfileRoute(id: string): Promise<Response> {
    const key = this.riotKey();
    if (!key) return fail('Riot 키가 아직 없어요.', 503);
    const m = id.trim().match(/^(.{2,16})#([^#\s]{2,5})$/);
    if (!m) return fail('라이엇 ID 를 「이름#태그」 처럼 넣어 주세요 (예: Hide on bush#KR1).');
    try {
      const r = await this.nbaCached(`lol:p:${id.toLowerCase()}`, 10 * 60_000, () => lolProfile(key, m[1], m[2]));
      return json(r.v);
    } catch (e) {
      const st = e instanceof RiotError ? e.status : 502;
      return fail(st === 404 ? '그 라이엇 ID 를 찾지 못했어요. 이름과 태그를 확인해 주세요.' : `롤 정보를 받지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 100)})`, st === 404 ? 404 : 502);
    }
  }
  /** 롤 경기: 서버에 모아 둔 경기 + 새 경기(최대 30판). older=1 이면 예전 경기를 40판 더 (올해 통계용) */
  private async lolGamesRoute(puuid: string, older: boolean): Promise<Response> {
    const key = this.riotKey();
    if (!key) return fail('Riot 키가 아직 없어요.', 503);
    if (!/^[\w-]{40,100}$/.test(puuid)) return fail('계정을 확인해 주세요.');
    const ck = `lol:g:${puuid}`;
    const cur = (JSON.parse(this.cacheGet(ck) ?? 'null') as { games: LolGame[]; at: number; end?: boolean } | null) ?? { games: [], at: 0 };
    const have = new Set(cur.games.map((g) => g.id));
    let more = false,
      warn = '';
    try {
      if (older) {
        const r = await lolOlderGames(key, puuid, have, cur.games.length);
        cur.games.push(...r.games);
        cur.end = r.end;
      } else if (Date.now() - cur.at > 60_000) {
        const r = await lolNewGames(key, puuid, have);
        cur.games.unshift(...r.games);
        more = r.more;
        cur.at = Date.now();
      }
    } catch (e) {
      warn = e instanceof Error ? e.message : String(e);
    }
    cur.games = [...new Map(cur.games.map((g) => [g.id, g])).values()].sort((a, b) => b.at - a.at).slice(0, 2000);
    this.cacheSet(ck, JSON.stringify(cur));
    return json({ games: cur.games, more, end: !!cur.end, warn });
  }

  /** 롤 챔피언 통계 (서버가 모은 마스터 이상 솔랭): 패치 목록 · 티어표 · 챔피언 하나 · 모은 상태 */
  private async lolMetaRoute(path: string, q: URLSearchParams): Promise<Response> {
    // 모으기 알람이 아직 안 돌고 있으면 켠다
    // (다른 알림 때문에 더 늦은 알람이 걸려 있어도 1분 안으로 당긴다)
    const alarm = await this.ctx.storage.getAlarm();
    // 알람이 없거나, 너무 늦게 걸렸거나, 지난 시각에 멈춰 있으면 다시 건다
    if (this.riotKey() && (alarm === null || alarm > Date.now() + 90_000 || alarm < Date.now() - 120_000)) await this.scheduleAlarm();
    const patches = metaPatches(this.sql);
    const patch = q.get('patch') === 'all' ? 'all' : (patches.find((x) => x.patch === q.get('patch'))?.patch ?? patches[0]?.patch ?? 'all');
    const status = {
      matches: patches.reduce((a, x) => a + x.games, 0),
      last: JSON.parse(this.cacheGet('lolmeta:last') ?? 'null'),
      err: JSON.parse(this.cacheGet('lolmeta:err') ?? 'null'),
      alarm: await this.ctx.storage.getAlarm(),
      alarmErr: JSON.parse(this.cacheGet('alarm:err') ?? 'null'),
      pushErr: JSON.parse(this.cacheGet('alarm:pusherr') ?? 'null'),
    };
    if (path === 'lol/meta') return json({ patch, patches, status, ...metaTable(this.sql, patch) });
    const cid = Number(q.get('cid'));
    if (!Number.isInteger(cid) || cid <= 0) return fail('챔피언을 확인해 주세요.');
    return json({ patch, patches, status, ...metaChamp(this.sql, patch, cid) });
  }

  /** 어떤 서비스 키가 등록돼 있는지만 (값은 보내지 않음) */
  private keysInfo(): Response {
    const used = Number(this.cacheGet(`serp:${new Date().toISOString().slice(0, 7)}`) ?? 0);
    return json({
      serpapi: !!this.secret('serpapi', 'serpapikey', 'serp', 'serpkey', 'serpapiapikey'),
      serpUsed: used,
      discogs: !!(
        (this.secret('discogskey', 'discogsconsumerkey', 'discogsuserkey', 'discogsapikey') && this.secret('discogssecret', 'discogsconsumersecret', 'discogsusersecret', 'discogsapisecret')) ||
        this.secret('discogs', 'discogstoken', 'discogsusertoken', 'discogspersonaltoken', 'discogsaccesstoken')
      ),
      datagokr: !!this.secret('datagokr', 'datagokrkey', 'datagokey', 'publicdata', 'publicdatakey', 'kasi', 'kasikey', 'DATA_GO_KR_KEY'),
      gemini: !!this.keyOf('gemini'),
      steam: !!this.steamKey(),
      riot: !!this.riotKey(),
      nl: !!this.nlKey(),
      yes24: !!this.secret('yes24', 'yes24key', 'yes24api'),
    });
  }

  /** Gemini 에게 JSON 으로 묻기를 뒤에서 하고 번호를 돌려준다 → GET bb/scan/{번호} (또는 ai/job/{번호}) 로 { done, read, model }.
   *  가벼운 lite 모델부터, 모델마다 70초. 문제 풀이와 같은 하루 한도를 같이 센다 */
  private async aiJob(user: UserRow, body: unknown, parse: (text: string) => unknown, what: string): Promise<Response> {
    const key = this.keyOf('gemini');
    if (!key) return fail('AI 로 읽으려면 Gemini 키가 필요해요.', 503);
    if (!this.gemList || Date.now() - this.gemList.at > DAY) this.gemList = { at: Date.now(), v: await geminiModels(key, this.gemFetch()) };
    const chain = this.gemLeft(user.id)
      .map((x) => x.model)
      .filter((m) => !m.startsWith('gemma'))
      .sort((x, y) => Number(/lite/.test(y)) - Number(/lite/.test(x)));
    if (!chain.length) return fail('오늘 Gemini 무료 사용량을 다 썼어요. 내일 다시 해 주세요.', 429);
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const ck = `bbscan:${user.id}:${id}`;
    this.cacheSet(ck, JSON.stringify({ running: true }));
    const run = async () => {
      const tried: string[] = [];
      for (const m of chain.slice(0, 3)) {
        try {
          const res = await within(this.gemFetch()(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }), 70_000, m);
          const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          if (!res.ok) {
            const em = j?.error?.message ?? '';
            if (res.status === 429 || res.status === 404) this.bumpGem(user.id, m, /per ?day|daily|PerDay/i.test(em) || res.status === 404);
            throw new Error(`Gemini ${res.status}: ${em.slice(0, 80)}`);
          }
          this.bumpGem(user.id, m);
          console.log('ai job ok', what, m);
          return this.cacheSet(ck, JSON.stringify({ done: true, read: parse(readGemini(j)), model: m }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('ai job failed', what, m, msg);
          tried.push(`${m}: ${msg.slice(0, 80)}`);
        }
      }
      this.cacheSet(ck, JSON.stringify({ done: true, error: `AI 가 읽지 못했어요. (${tried.join(' / ').slice(0, 200)})` }));
    };
    this.ctx.waitUntil(run());
    return json({ jobId: id });
  }
  private imageOf(b: Record<string, unknown>): { mime: string; data: string } | null {
    const img = b.image as { mime?: unknown; data?: unknown } | undefined;
    const mime = typeof img?.mime === 'string' && /^image\/(jpeg|png|webp)$/.test(img.mime) ? img.mime : '';
    const data = typeof img?.data === 'string' ? img.data : '';
    return mime && data && data.length <= 1_500_000 && /^[A-Za-z0-9+/=]+$/.test(data) ? { mime, data } : null;
  }
  /** 홈코트 화면 사진 → 숫자 */
  private async bbScan(user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const img = this.imageOf(b);
    if (!img) return fail('사진이 너무 크거나 잘못됐어요.', 413);
    return this.aiJob(user, hcBody(img.mime, img.data), parseHc, 'homecourt');
  }
  /** 문제 사진 → 과목 · 번호 · 문제 글 (오답 노트 칸 채우기) */
  private async noteScan(user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const img = this.imageOf(b);
    if (!img) return fail('사진이 너무 크거나 잘못됐어요.', 413);
    const subjects = (Array.isArray(b.subjects) ? b.subjects : [])
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.slice(0, 20))
      .slice(0, 30);
    return this.aiJob(user, noteBody(img.mime, img.data, subjects), (t) => parseNote(t, subjects), 'note');
  }
  /** 영수증 사진 → 금액 · 날짜 · 가게 (돈 기록 채우기) */
  private async receiptScan(user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const img = this.imageOf(b);
    if (!img) return fail('사진이 너무 크거나 잘못됐어요.', 413);
    return this.aiJob(user, receiptBody(img.mime, img.data), parseReceipt, 'receipt');
  }
  /** 목차 사진(여러 장) → 단원 · 쪽 */
  private async tocScan(user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const imgs = (Array.isArray(b.images) ? b.images : [])
      .slice(0, 4)
      .map((x) => this.imageOf({ image: x }))
      .filter((x): x is { mime: string; data: string } => !!x);
    if (!imgs.length) return fail('사진이 너무 크거나 잘못됐어요.', 413);
    if (imgs.reduce((a, x) => a + x.data.length, 0) > MAX_STORE) return fail('사진이 너무 커요. 장 수를 줄여 주세요.', 413);
    return this.aiJob(user, tocBody(imgs), parseTocRead, 'toc');
  }
  private nlKey() {
    return this.secret('nl', 'nlkey', 'nlapi', 'nlgokr', 'nlgo', 'seoji', 'seojikey', 'nationallibrary', 'library', 'librarykey', 'kolis', 'nlcertkey', 'certkey');
  }
  /** 책 찾기 (국립중앙도서관 ISBN 서지정보, 하루 기억) */
  private async bookSearch(q: string): Promise<Response> {
    if (q.length < 2) return json({ list: [] });
    const yk = this.secret('yes24', 'yes24key', 'yes24api');
    const key = this.nlKey();
    if (!yk && !key) return json({ list: [], needKey: true });
    let why = '';
    // 1) 예스24 (표지 · 값 · 쪽수 · 목차) → 2) 국립중앙도서관
    if (yk) {
      try {
        const r = await this.nbaCached(`y24b:${q.toLowerCase()}`, DAY, () => yes24Search(yk, q));
        if (r.v.length) return json({ list: r.v });
      } catch (e) {
        why = e instanceof Error ? e.message : String(e);
        console.error('yes24 failed', why);
      }
    }
    if (key) {
      try {
        const r = await this.nbaCached(`nl:${q.toLowerCase()}`, DAY, () => seojiSearch(key, q));
        return json({ list: r.v });
      } catch (e) {
        why = `${why ? `${why} / ` : ''}${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return why ? fail(`책을 찾지 못했어요. (${why.slice(0, 120)})`, 502) : json({ list: [] });
  }
  private async bookToc(url: string): Promise<Response> {
    try {
      const r = await this.nbaCached(`nltoc:${url}`, 30 * DAY, () => seojiToc(url));
      return json({ text: r.v });
    } catch (e) {
      return fail(`목차를 받지 못했어요. (${(e instanceof Error ? e.message : String(e)).slice(0, 100)})`, 502);
    }
  }
  /** 받아쓴 일기 글 → 칸마다 (좋았던 것 · 힘들었던 것 …). 쓴 말만 옮기고 지어내지 않게 */
  private async diarySplit(user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const text = typeof b.text === 'string' ? b.text.trim().slice(0, 6000) : '';
    if (text.length < 5) return fail('나눌 글이 너무 짧아요.');
    return this.aiJob(user, diaryBody(text), parseDiary, 'diary');
  }
  private bbScanGet(user: UserRow, id: string): Response {
    if (!/^[a-f0-9]{16}$/.test(id)) return fail('번호가 잘못됐어요.');
    const c = this.cacheGet(`bbscan:${user.id}:${id}`);
    if (!c) return json({ missing: true });
    const v = JSON.parse(c) as { running?: boolean; done?: boolean };
    if (v.done) this.sql.exec('DELETE FROM cache WHERE key = ?', `bbscan:${user.id}:${id}`);
    return json(v);
  }

  /** 이번 시즌 모든 선수 경기당 평균 (선수 찾기 · 정렬용, 시즌 평균과 같은 표를 6시간 기억) */
  private async nbaPlayers(): Promise<Response> {
    const season = seasonOf(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
    try {
      const r = await this.nbaCached(`nba:avgs2:nbacom:${season}`, 6 * 3600_000, () => this.stats(() => fetchNbaAverages(season)));
      return json({ season, players: r.v, at: r.at });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('nba.com players failed', msg);
    }
    // NBA 공식 기록이 안 되면 2K 의 지금 팀 선수 목록으로 (현실 기록 칸은 비움)
    try {
      const k = await this.get2k();
      const abbrOf = (team: string) => Object.entries(NBA_TEAM_NAMES).find(([, nm]) => norm2(team).endsWith(norm2(nm)))?.[0] ?? '';
      const players = k.v.map((p) => ({ id: 0, name: p.name, team: abbrOf(p.team), age: 0, fg3m: 0, gp: 0, min: '', pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgPct: 0, fg3Pct: 0, ftPct: 0, tov: 0 }));
      return json({ season, players, at: k.at, src: '2k' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(`선수 목록을 받지 못했어요. (${msg.slice(0, 80)})`, 502);
    }
  }

  /** 2K 지금 팀 선수 전체 (12시간 기억) */
  private get2k() {
    const env = this.env as unknown as Record<string, string | undefined>;
    const key = env.Nba2k || env.NBA2K || env.nba2k || env.Nba2kapi || env.NBA2KAPI || env.NBA2K_KEY || env.Nba2K;
    return this.nbaCached('nba2k:curr', 12 * 3600_000, () => fetch2k(key));
  }
  /** NBA 2K 능력치 전체 (지금 팀 선수, 12시간 기억. 키가 있으면 한 번에, 없으면 공개 목록으로) */
  private async nba2k(): Promise<Response> {
    const env = this.env as unknown as Record<string, string | undefined>;
    const key = env.Nba2k || env.NBA2K || env.nba2k || env.Nba2kapi || env.NBA2KAPI || env.NBA2K_KEY || env.Nba2K;
    try {
      const r = await this.nbaCached('nba2k:curr', 12 * 3600_000, () => fetch2k(key));
      return json({ players: r.v, at: r.at, key: !!key });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('nba2k failed', msg);
      return fail(`NBA 2K 능력치를 받지 못했어요. (${msg.slice(0, 80)})`, 502);
    }
  }

  /** Highlightly 선수 시즌별 기록 (정규시즌, 하루 기억) */
  private async hlPlayer(name: string): Promise<Response> {
    if (!name) return fail('선수를 확인해 주세요.');
    const hk = this.hlKey();
    if (!hk) return fail('Highlightly 키가 없어요.', 503);
    try {
      const r = await this.nbaCached(`hl:player2:${name.toLowerCase()}`, DAY, () => fetchHlPlayerSeasons(hk, name));
      return json({ player: r.v, at: r.at });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('highlightly player failed', name, msg);
      return fail(`선수 기록을 받지 못했어요. (Highlightly: ${msg.slice(0, 80)})`, 502);
    }
  }

  /** 팀 로스터 (NBA 공식, 12시간 기억) */
  private async nbaRoster(team: string): Promise<Response> {
    if (!/^[A-Z]{3}$/.test(team)) return fail('팀을 확인해 주세요.');
    const season = seasonOf(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
    let why = '';
    try {
      const r = await this.nbaCached(`nba:roster:${season}:${team}`, 12 * 3600_000, () => this.stats(() => fetchNbaRoster(team, season)));
      return json({ season, players: r.v, at: r.at, src: 'nba' });
    } catch (e) {
      why = e instanceof Error ? e.message : String(e);
      console.error('nba.com roster failed', team, why);
    }
    // NBA 공식이 안 되면 2K 의 지금 팀 선수로 (지금 로스터에 맞춰 매주 고쳐진다고 nba2kapi 홈페이지에 적혀 있음)
    try {
      const k = await this.get2k();
      const name = NBA_TEAM_NAMES[team];
      const players = k.v
        .filter((p) => name && norm2(p.team).endsWith(norm2(name)))
        .sort((a, b) => b.ovr - a.ovr)
        .map((p) => ({ id: 0, name: p.name, num: '', pos: p.pos.join('/'), height: p.height ?? '', weight: (p.weight ?? '').replace(/\s*lbs?$/i, ''), age: 0, exp: '', school: '' }));
      if (players.length) return json({ season, players, at: k.at, src: '2k' });
    } catch (e) {
      why += ` / 2K: ${e instanceof Error ? e.message : String(e)}`;
    }
    // 그것도 안 되면 balldontlie 선수 목록으로 (예전 선수까지 섞여 있을 수 있음)
    const key = this.nbaKey();
    try {
      if (!key) throw new Error('balldontlie 키 없음');
      const r = await this.nbaCached(`nba:roster:bdl:${team}`, 12 * 3600_000, () => fetchBdlRoster(key, team));
      return json({ season, players: r.v, at: r.at, src: 'bdl' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(`로스터를 받지 못했어요. (NBA 공식: ${why.slice(0, 60)} / balldontlie: ${msg.slice(0, 60)})`, 502);
    }
  }
  /** 선수 커리어 (NBA 공식, 12시간 기억) */
  private async nbaCareer(player: number): Promise<Response> {
    if (!Number.isInteger(player) || player <= 0) return fail('선수를 확인해 주세요.');
    try {
      const r = await this.nbaCached(`nba:career:${player}`, 12 * 3600_000, () => this.stats(() => fetchNbaCareer(player)));
      return json({ rows: r.v, at: r.at });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('nba.com career failed', player, msg);
      return fail(`커리어 기록을 받지 못했어요. (NBA 공식 데이터: ${msg.slice(0, 80)})`, 502);
    }
  }

  /** 쓸모없는 지식 (uselessfacts.jsph.pl, 영어 → 한국어로 번역). 오늘 것은 하루 기억, random 이면 아무거나 하나 (번역 한도를 같이 쓴다)
   *  글만 받으려고 Accept: text/plain (문서에 있는 형식). 출처 · 주소 같은 뒤에 붙은 글은 지운다 */
  /** 쓸모없는 지식. 받아서 번역한 것은 서버에 모아 두고(같은 글은 한 번만), 사람마다 이미 본 것은 다시 보여 주지 않는다 */
  private async uselessFact(user: UserRow, random: boolean): Promise<Response> {
    try {
      const seen = this.factSeen(user.id);
      if (random) {
        // 아직 안 본 모아 둔 지식이 있으면 대부분은 거기서 바로 (번역 · 바깥 요청 없이). 가끔 · 다 봤으면 새로 받아 모은다
        const unseen: number[] = [];
        for (let id = 1, max = this.factMax(); id <= max; id++) if (!seen.has(id)) unseen.push(id);
        if (unseen.length && (unseen.length >= 5 || Math.random() < 0.8)) {
          const id = unseen[Math.floor(Math.random() * unseen.length)];
          const row = this.sql.exec<{ en: string; ko: string }>('SELECT en, ko FROM facts WHERE rowid = ?', id).toArray()[0];
          if (row) return json(this.factMark(user.id, seen, id, row));
        }
        const wait = this.translateByUser.hit(user.id);
        if (wait) return fail(unseen.length ? `너무 자주 눌렀어요. ${wait}초 뒤에 다시 해 주세요.` : `모아 둔 지식은 다 봤어요. ${wait}초 뒤에 새로 받아 올게요.`, 429);
        // 사이트의 랜덤도 겹칠 수 있어서, 이미 본 것이면 몇 번 더 받아 본다
        let got = await this.factFetch('random');
        for (let i = 0; i < 3 && got.id && seen.has(got.id); i++) got = await this.factFetch('random');
        return json(this.factMark(user.id, seen, got.id, got));
      }
      const day = new Date().toISOString().slice(0, 10);
      const fresh = !this.sql.exec<{ at: number }>('SELECT at FROM cache WHERE key = ?', `fact3:${day}`).toArray()[0];
      const r = await this.nbaCached(`fact3:${day}`, DAY, () => this.factFetch('today'));
      // 하루에 한 번, 뒤에서 몇 개 더 받아 번역해 모은다 (사이트가 새로 넣는 지식도 이렇게 조금씩 들어온다)
      if (fresh) this.ctx.waitUntil(this.factGrow(8));
      return json({ ...this.factMark(user.id, seen, r.v.id, r.v), day });
    } catch (e) {
      console.error('fact failed', e instanceof Error ? e.message : String(e));
      return fail('쓸모없는 지식을 받지 못했어요.', 502);
    }
  }
  /** 이 사람이 본 지식 번호들 */
  private factSeen(userId: string): Set<number> {
    const r = this.sql.exec<{ data: string }>('SELECT data FROM cache WHERE key = ?', `factseen:${userId}`).toArray()[0];
    return new Set(r ? (JSON.parse(r.data) as number[]) : []);
  }
  private factMark(userId: string, seen: Set<number>, id: number | undefined, f: { en: string; ko: string }) {
    if (id && !seen.has(id)) {
      seen.add(id);
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', `factseen:${userId}`, JSON.stringify([...seen]), Date.now());
    }
    return { en: f.en, ko: f.ko };
  }
  private factMax(): number {
    return this.sql.exec<{ m: number | null }>('SELECT MAX(rowid) AS m FROM facts').toArray()[0]?.m ?? 0;
  }
  /** 사이트에서 하나 받아 (이미 모아 둔 글이면 그 번역을 쓰고) 번역해서 모은다. id: 모아 둔 번호 (번역이 안 돼서 못 모았으면 없음) */
  private async factFetch(kind: 'random' | 'today'): Promise<{ en: string; ko: string; id?: number }> {
    // JSON 으로 받아 text 만 쓴다 (실제 응답 확인: { id, text, source, source_url, language, permalink }. text/plain 은 「> 글 · Source · Via」 마크다운이라 안 씀)
    const res = await fetch(`https://uselessfacts.jsph.pl/api/v2/facts/${kind}?language=en`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`uselessfacts ${res.status}`);
    const en = cleanFact(String(((await res.json()) as { text?: unknown })?.text ?? ''));
    if (!en) throw new Error('uselessfacts 빈 답');
    const have = this.sql.exec<{ ko: string; id: number }>('SELECT ko, rowid AS id FROM facts WHERE en = ?', en).toArray()[0];
    if (have && goodKo(have.ko)) return { en, ko: have.ko, id: have.id };
    // 예전에 번역이 깨져(「!!!!!!」 같은 것) 저장된 것이면 다시 번역해서 고친다
    if (have) {
      const again = await this.factKo(en);
      if (again) this.sql.exec('UPDATE facts SET ko = ? WHERE rowid = ?', again, have.id);
      return { en, ko: again, id: have.id };
    }
    const ko = await this.factKo(en);
    if (!ko) return { en, ko };
    this.sql.exec('INSERT OR IGNORE INTO facts (en, ko, at) VALUES (?, ?, ?)', en, ko, Date.now());
    const id = this.sql.exec<{ id: number }>('SELECT rowid AS id FROM facts WHERE en = ?', en).toArray()[0]?.id;
    return { en, ko, id };
  }
  private async factGrow(n: number) {
    for (let i = 0; i < n; i++) {
      try {
        await this.factFetch('random');
      } catch (e) {
        console.error('fact grow failed', e instanceof Error ? e.message : String(e));
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  /** 영어 지식 → 한국어 (번역과 같은 모델 · 한도). 안 되면 빈 글 (그때는 영어로 보여 준다) */
  private async factKo(en: string): Promise<string> {
    if (this.translateAll.hit('all')) return '';
    const input = buildInput(en, 'ko', 'text');
    for (const model of [TRANSLATE_MODEL, FAST_MODEL]) {
      try {
        const t = parseTranslation(readOutput(await this.env.AI.run(model as never, modelInput(model, input) as never)), 'text');
        // 모델이 가끔 「!!!!!!!!」 처럼 깨진 글을 낸다 → 한글이 제대로 있는 것만
        if (t?.text && goodKo(t.text)) return t.text.trim();
      } catch (e) {
        console.error('fact translate failed', model, e instanceof Error ? e.message : String(e));
      }
    }
    return '';
  }

  /** 공휴일 · 기념일 (한 해씩, 7일 기억. 새로 정해진 대체공휴일도 일주일 안에 들어온다) */
  private async holidays(y: string | null): Promise<Response> {
    const year = Number(y);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('연도를 확인해 주세요.');
    const env = this.env as unknown as Record<string, string | undefined>;
    const key = env.Datagokr || env.DATA_GO_KR_KEY || this.secret('datagokr', 'datagokrkey', 'datagokey', 'publicdata', 'publicdatakey', 'kasi', 'kasikey');
    if (!key) return fail('공휴일을 보려면 공공데이터포털 키(Datagokr)가 필요해요.', 503);
    const ck = `holidays:${year}`;
    const c = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', ck).toArray()[0];
    if (c && Date.now() - c.at < 7 * DAY) return json({ days: JSON.parse(c.data) });
    try {
      const days = await fetchSpecialDays(key, year);
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', ck, JSON.stringify(days), Date.now());
      return json({ days });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('holidays failed', year, msg);
      // 받아 둔 게 있으면 오래됐어도 그걸로
      if (c) return json({ days: JSON.parse(c.data) });
      return fail(`공휴일을 받지 못했어요. (${msg.slice(0, 120)})`, 502);
    }
  }

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
    // 나이스가 실패하면 30분 동안은 다시 묻지 않는다 (화면을 열 때마다 같은 오류가 반복되지 않게)
    const failKey = `neis:fail:${name}`;
    const lastFail = this.sql.exec<{ data: string; at: number }>('SELECT data, at FROM cache WHERE key = ?', failKey).toArray()[0];
    if (lastFail && Date.now() - lastFail.at < 30 * 60_000) return fail(`나이스가 응답하지 않아 잠시 쉬어요. (${JSON.parse(lastFail.data)})`, 503);
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
      this.sql.exec('INSERT OR REPLACE INTO cache (key, data, at) VALUES (?, ?, ?)', failKey, JSON.stringify(msg.slice(0, 200)), Date.now());
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
    // 응원팀 경기 알림을 켠 사람이 있으면 10분마다 경기를 본다
    const favs = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM cache WHERE key LIKE 'nbafav:%'").toArray()[0].n;
    const nbaAt = favs ? Math.max(Date.now() + 5_000, Number(this.cacheGet('nba:nextcheck') ?? 0)) : 0;
    const games = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM cache WHERE key LIKE 'gamewatch:%' OR key LIKE 'steamwish:%'").toArray()[0].n;
    const gameAt = games ? Math.max(Date.now() + 5_000, Number(this.cacheGet('games:nextcheck') ?? 0)) : 0;
    // 롤 챔피언 통계 모으기: Riot 키가 있으면 1분마다 (키가 막히면 1시간 쉼)
    const lolAt = this.riotKey() ? Math.max(Date.now() + 5_000, Number(this.cacheGet('lolmeta:next') ?? 0)) : 0;
    const at = [r?.at ?? 0, nbaAt, gameAt, lolAt].filter((x) => x > 0);
    if (at.length) await this.ctx.storage.setAlarm(Math.min(...at));
    else await this.ctx.storage.deleteAlarm();
  }

  /** 응원팀 경기 알림: { team: 'LAL' | '' }. 켤 때 이미 시작했거나 끝난 경기는 알리지 않는다 */
  private async nbaFav(req: Request, user: UserRow, b: Record<string, unknown>): Promise<Response> {
    const ck = `nbafav:${user.id}`;
    const subs = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', user.id).toArray()[0].n;
    if (req.method === 'GET') {
      const c = this.cacheGet(ck);
      return json({ team: c ? (JSON.parse(c) as { team: string }).team : '', subs });
    }
    const team = typeof b.team === 'string' && /^[A-Z]{2,3}$/.test(b.team) ? b.team : '';
    if (!team) this.sql.exec('DELETE FROM cache WHERE key = ?', ck);
    else this.cacheSet(ck, JSON.stringify({ team, origin: new URL(req.url).origin, sent: {}, init: false }));
    await this.scheduleAlarm();
    return json({ team, subs });
  }

  /** 응원팀 경기가 시작했거나 끝났으면 알림 (10분마다) */
  private async nbaFavCheck() {
    const rows = this.sql.exec<{ key: string; data: string }>("SELECT key, data FROM cache WHERE key LIKE 'nbafav:%'").toArray();
    if (!rows.length) return;
    const usToday = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const days = [new Date(Date.parse(usToday) - DAY).toISOString().slice(0, 10), usToday];
    const games: NbaGame[] = [];
    for (const dd of days) {
      const r = await this.nbaGames(dd);
      if (r.ok) games.push(...((await r.json()) as { games: NbaGame[] }).games);
    }
    for (const row of rows) {
      const uid = row.key.slice('nbafav:'.length);
      const v = JSON.parse(row.data) as { team: string; origin: string; sent: Record<string, 1>; init: boolean };
      const mine = games.filter((g) => g.home.abbr === v.team || g.away.abbr === v.team);
      const msgs: { title: string; body: string; url: string }[] = [];
      for (const g of mine) {
        const fin = /final/i.test(g.status);
        const live = !fin && g.period > 0;
        const score = `${g.away.abbr} ${g.awayScore} : ${g.homeScore} ${g.home.abbr}`;
        const url = `/#/basketball/nba/game-${g.id}`;
        if ((live || fin) && !v.sent[`${g.id}:s`]) {
          v.sent[`${g.id}:s`] = 1;
          if (v.init && live) msgs.push({ title: `🏀 ${g.away.abbr} @ ${g.home.abbr} 경기 시작`, body: `${g.period}쿼터 · ${score}`, url });
        }
        if (fin && !v.sent[`${g.id}:e`]) {
          v.sent[`${g.id}:e`] = 1;
          const mineScore = g.home.abbr === v.team ? g.homeScore : g.awayScore;
          const other = g.home.abbr === v.team ? g.awayScore : g.homeScore;
          if (v.init) msgs.push({ title: `🏀 ${v.team} ${mineScore > other ? '승리!' : '패배'}`, body: `경기 끝 · ${score}`, url });
        }
      }
      v.init = true;
      // 오래된 기록은 지운다 (최근 40개만)
      v.sent = Object.fromEntries(Object.entries(v.sent).slice(-40));
      this.cacheSet(row.key, JSON.stringify(v));
      if (!msgs.length) continue;
      const subs = this.sql.exec<PushSub & { [k: string]: SqlStorageValue }>('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?', uid).toArray();
      for (const m of msgs) if (subs.length) await this.pushTo(subs, m, v.origin);
    }
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
    // 무엇이 실패해도 다음 알람은 꼭 다시 건다 (예전에는 한 번 실패하면 알람이 멈춰 모든 알림이 안 갔다)
    try {
      await this.alarmWork();
    } catch (e) {
      const msg = e instanceof Error ? `${e.message} ${e.stack?.split('\n')[1]?.trim() ?? ''}` : String(e);
      console.error('alarm failed', msg);
      this.cacheSet('alarm:err', JSON.stringify({ at: Date.now(), msg: msg.slice(0, 300) }));
    } finally {
      await this.scheduleAlarm();
    }
  }

  private async alarmWork() {
    const now = Date.now();
    const rk = this.riotKey();
    if (rk && now + 5_000 >= Number(this.cacheGet('lolmeta:next') ?? 0)) {
      try {
        const r = await lolMetaTick(
          rk,
          this.sql,
          (k) => this.cacheGet(k),
          (k, v) => this.cacheSet(k, v),
        );
        this.cacheSet('lolmeta:next', String(now + 60_000));
        this.cacheSet('lolmeta:last', JSON.stringify({ at: now, counted: r.counted }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('lol meta tick failed', msg);
        // 401/403(키 문제)이면 1시간, 그 밖(429 등)은 5분 쉼
        this.cacheSet('lolmeta:next', String(now + (/40[13]/.test(msg) ? 3600_000 : 300_000)));
        this.cacheSet('lolmeta:err', JSON.stringify({ at: now, msg }));
      }
    }
    if (now + 30_000 >= Number(this.cacheGet('games:nextcheck') ?? 0) && this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM cache WHERE key LIKE 'gamewatch:%' OR key LIKE 'steamwish:%'").toArray()[0].n) {
      this.cacheSet('games:nextcheck', String(now + 6 * 3600_000));
      await this.gameWatchCheck().catch((e) => console.error('game watch failed', e instanceof Error ? e.message : String(e)));
      await this.steamWishCheck().catch((e) => console.error('steam wish failed', e instanceof Error ? e.message : String(e)));
    }
    if (now + 30_000 >= Number(this.cacheGet('nba:nextcheck') ?? 0) && this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM cache WHERE key LIKE 'nbafav:%'").toArray()[0].n) {
      this.cacheSet('nba:nextcheck', String(now + 10 * 60_000));
      await this.nbaFavCheck().catch((e) => console.error('nba fav check failed', e instanceof Error ? e.message : String(e)));
    }
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
      // 한 사람 알림이 실패해도 다음 시각으로 넘기고 다른 사람 것은 보낸다
      try {
        const subs = this.sql.exec<PushSub & { [k: string]: SqlStorageValue }>('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?', n.user_id).toArray();
        if (subs.length) await this.pushTo(subs, message, n.origin);
      } catch (err) {
        console.error('notify push failed', n.user_id, err instanceof Error ? err.message : String(err));
        this.cacheSet('alarm:pusherr', JSON.stringify({ at: Date.now(), msg: (err instanceof Error ? err.message : String(err)).slice(0, 200) }));
      }
      this.sql.exec('UPDATE notify SET next_at = ? WHERE user_id = ?', nextFire(times, n.tz, Math.max(now, n.next_at) + 1000), n.user_id);
    }
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
