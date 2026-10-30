// 로그인 서버(worker/accounts.ts)와 이야기하는 부분.
// 로그인 토큰은 서버가 HttpOnly 쿠키로만 주고 받는다 (이 페이지의 자바스크립트는 토큰을 볼 수 없음).
// 이 기기에는 「로그인했는지」 표시와 계정 id(자료 주인 확인용)만 남긴다.

export interface Account {
  id: string;
  username: string;
  nickname: string;
}

const FLAG_KEY = 'my-study.logged-in.v2';
/** 마지막으로 확인한 계정 (인터넷이 안 될 때도 로그인한 채로 보이게). 토큰이 아니라 이름만 */
const ACCOUNT_KEY = 'my-study.logged-in.account';

function readFlag(): string | null {
  try {
    return localStorage.getItem(FLAG_KEY);
  } catch {
    return null;
  }
}
/** 로그인했다고 기억하고 있는지 (진짜 확인은 서버의 /api/me) */
export const isLoggedIn = () => !!readFlag();
export const loggedInUserId = () => readFlag();

/** 이 기기에 기억한 계정 (로그인 표시와 같은 계정일 때만) */
export function cachedAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null') as Account | null;
    return a && typeof a.id === 'string' && a.id === readFlag() ? a : null;
  } catch {
    return null;
  }
}

function setFlag(user: Account | null) {
  try {
    if (user) {
      localStorage.setItem(FLAG_KEY, user.id);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: user.id, username: user.username, nickname: user.nickname }));
    } else {
      localStorage.removeItem(FLAG_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
    }
  } catch {
    // 저장할 수 없는 환경
  }
  window.dispatchEvent(new Event('my-study-auth'));
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  let data: { error?: string } & T;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('서버에 연결할 수 없어요.', res.status);
  }
  if (!res.ok) {
    // 로그인이 풀림 (비밀번호가 틀린 것은 401 이 아니라 403 으로 온다: 로그인 화면 빼고)
    if (res.status === 401 && path !== 'auth/login' && readFlag()) setFlag(null);
    throw new ApiError(data.error ?? '오류가 났어요.', res.status);
  }
  return data;
}

export async function signup(username: string, password: string, nickname: string) {
  const r = await call<{ user: Account }>('auth/signup', 'POST', { username, password, nickname });
  setFlag(r.user);
  return r.user;
}
export async function login(username: string, password: string) {
  const r = await call<{ user: Account }>('auth/login', 'POST', { username, password });
  setFlag(r.user);
  return r.user;
}
/**
 * 로그아웃. 이 기기만이면 서버에 못 알려도(인터넷 끊김) 이 기기에서는 로그아웃하고 오류를 던진다.
 * 모든 기기에서면 서버가 받아야 의미가 있으므로, 실패하면 로그인한 채로 두고 오류를 던진다 (다시 할 수 있게).
 */
export async function logout(everywhere = false) {
  if (everywhere) {
    await call('auth/logout-all', 'POST', {});
    setFlag(null);
    return;
  }
  try {
    await call('auth/logout', 'POST', {});
  } finally {
    setFlag(null);
  }
}
export async function me() {
  try {
    const user = (await call<{ user: Account }>('me')).user;
    const c = cachedAccount();
    if (!c || c.id !== user.id || c.nickname !== user.nickname || c.username !== user.username) setFlag(user);
    return user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setFlag(null);
    throw e;
  }
}
export const changeNickname = (nickname: string) =>
  call<{ user: Account }>('me/nickname', 'PUT', { nickname }).then((r) => {
    setFlag(r.user);
    return r.user;
  });
export const changePassword = (current: string, password: string) => call('me/password', 'PUT', { current, password });
export async function deleteAccount(password: string) {
  await call('me', 'DELETE', { password });
  setFlag(null);
}

// ===== 기기끼리 맞추는 묶음 자료 (gzip 으로 줄여 base64 글자로 보낸다) =====
async function gzipB64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzipB64(b64: string): Promise<string> {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
export type StoreName = 'study' | 'words';
/** since 뒤로 바뀐 게 없으면 unchanged */
export async function getStore<T>(name: StoreName, since = 0): Promise<{ unchanged: true; updatedAt: number } | { unchanged?: false; value: T | null; updatedAt: number }> {
  const r = await call<{ data?: string | null; unchanged?: boolean; updatedAt?: number }>(`store/${name}${since ? `?since=${since}` : ''}`);
  if (r.unchanged) return { unchanged: true, updatedAt: r.updatedAt ?? since };
  return { value: r.data ? (JSON.parse(await gunzipB64(r.data)) as T) : null, updatedAt: r.updatedAt ?? 0 };
}
/** base(기기가 아는 서버 판)를 주면, 그 사이 다른 기기가 올렸을 때 conflict */
export async function putStore(name: StoreName, value: unknown, base?: number): Promise<{ ok: true; updatedAt: number } | { conflict: true }> {
  try {
    const r = await call<{ updatedAt?: number }>('store/' + name, 'PUT', { data: await gzipB64(JSON.stringify(value)), ...(base === undefined ? {} : { base }) });
    return { ok: true, updatedAt: r.updatedAt ?? 0 };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { conflict: true };
    throw e;
  }
}

// ===== 오답 노트 사진 =====
export const putStudyPhoto = (id: string, data: string) => call('study-photo/' + id, 'PUT', { data });
export const getStudyPhoto = (id: string) => call<{ data: string }>('study-photo/' + id).then((r) => r.data);
export const deleteStudyPhoto = (id: string) => call('study-photo/' + id, 'DELETE');

/** 한국어 ↔ 영어 번역 (로그인한 사람만, worker/translate.ts) */
export interface TranslateResult {
  text: string;
  to: 'ko' | 'en';
  mode: 'text' | 'both' | 'dict';
  /** 직역 (의역·직역을 함께 고를 때) */
  literal?: string;
  /** 낱말 뜻 (품사별) */
  senses?: { pos: string; text: string }[];
  examples?: { a: string; b: string }[];
}
/** literal: 의역과 직역을 함께. 아니면 짧은 말은 사전처럼, 긴 글은 자연스럽게 */
export async function translate(text: string, to: 'ko' | 'en', literal = false) {
  return call<TranslateResult>('translate', 'POST', { text, to, mode: literal ? 'both' : undefined });
}

/** 영어 낱말들의 뜻 (로그인한 사람만, 한 번에 60개까지) */
export async function wordMeanings(words: string[]) {
  return call<{ words: string[]; meanings: string[] }>('translate', 'POST', { words });
}

// ===== 알림 (웹 푸시) =====
export async function notifyInfo() {
  return call<{ publicKey: string; times: string[]; devices: number }>('notify');
}
export async function notifyOn(subscription: PushSubscriptionJSON, times: string[], tzOffset: number) {
  return call<{ ok: true }>('notify', 'PUT', { subscription, times, tzOffset });
}
export async function notifyOff(endpoint?: string) {
  return call<{ ok: true }>('notify', 'DELETE', { endpoint });
}
export async function notifyDigest(entries: { date: string; slot: number; title: string; body: string; url?: string }[]) {
  return call<{ ok: true }>('notify/digest', 'PUT', { entries });
}
export async function notifyTest() {
  return call<{ ok: true; sent: number }>('notify/test', 'POST', {});
}

/** 영어 낱말 예문 (로그인한 사람만, 한 번에 30개까지). 단어 순서대로, 못 만든 것은 null */
export async function wordExamples(items: { term: string; meaning: string }[]) {
  return call<{ examples: ({ s: string; ko: string } | null)[] }>('translate', 'POST', { examples: items });
}

export interface KobisInfo {
  today: string;
  boxOffice?: { rank: number; title: string; open?: string; audience?: number; code?: string }[];
  upcoming?: { code: string; title: string; titleEn?: string; open: string; genre?: string; nation?: string; director?: string }[];
  errors: string[];
}
/** 영화진흥위원회(KOBIS) 어제 박스오피스 · 개봉 예정 (서버가 6시간 저장해 둠) */
export async function kobisInfo() {
  return call<KobisInfo>('movies/kobis');
}

export interface CatalogState {
  year: number;
  page: number;
  done: boolean;
  count: number;
}
export interface CatalogFilm {
  code: string;
  title: string;
  open: string;
  genre: string | null;
  nation: string | null;
  director: string | null;
  type?: string | null;
}
export interface CatalogQuery {
  q?: string;
  genre?: string;
  nation?: string;
  from?: number;
  to?: number;
  type?: '' | '장편' | '단편';
  adult?: boolean;
  offset?: number;
  facets?: boolean;
}
/** 서버에 쌓아 둔 영화 목록(1990년~)에서 제목·감독으로 찾고 장르·나라·연도·유형으로 거르기 */
export async function catalogSearch(q: string | CatalogQuery) {
  const o: CatalogQuery = typeof q === 'string' ? { q } : q;
  const sp = new URLSearchParams();
  if (o.q) sp.set('q', o.q);
  if (o.genre) sp.set('genre', o.genre);
  if (o.nation) sp.set('nation', o.nation);
  if (o.from) sp.set('from', String(o.from));
  if (o.to) sp.set('to', String(o.to));
  if (o.type) sp.set('type', o.type);
  if (o.adult) sp.set('adult', '1');
  if (o.offset) sp.set('offset', String(o.offset));
  if (o.facets) sp.set('facets', '1');
  return call<{ items: CatalogFilm[]; more?: boolean; state: CatalogState; facets?: { genres: string[]; nations: string[] } }>(`movies/catalog?${sp}`);
}
/** 영화 목록을 몇 쪽 더 받는다 (done 이 될 때까지 되풀이) */
export async function catalogSync(recent = false) {
  return call<{ state: CatalogState; last?: number; error?: string; busy?: boolean }>('movies/catalog/sync', 'POST', recent ? { recent: true } : {});
}
export interface RecommendInput {
  wish?: string;
  liked: { title: string; rating: number; note?: string }[];
  disliked: { title: string; rating: number; note?: string }[];
  seen: string[];
}
/** 내 별점·감상이나 지금 보고 싶은 것으로 영화 추천 (영화 목록에서 확인된 것만) */
export async function recommendMovies(input: RecommendInput) {
  return call<{ items: (CatalogFilm & { reason: string })[] }>('movies/recommend', 'POST', input);
}
/** 영화마다 한국에서 구독으로 볼 수 있는 서비스 이름들 (모르면 null) */
export async function movieProviders(items: { title: string; year?: number }[]) {
  return call<{ providers: (string[] | null)[] }>('movies/ott', 'POST', { items });
}

// ===== 학교 (나이스: 급식 · 학사일정 · 시간표) =====
export interface SchoolMeal {
  date: string;
  kind: string;
  dishes: string[];
  cal?: string;
}
export interface SchoolEvent {
  date: string;
  name: string;
  off: boolean;
}
export interface SchoolPeriod {
  date: string;
  period: number;
  subject: string;
}
/** NBA 하루 경기 (미국 날짜, balldontlie) */
export interface NbaTeam {
  abbr: string;
  name: string;
  city: string;
  conf?: string;
}
export interface NbaGame {
  id: number;
  date: string;
  home: NbaTeam;
  away: NbaTeam;
  homeScore: number;
  awayScore: number;
  status: string;
  period: number;
  time: string;
  start?: string;
  season?: number;
}
export interface NbaStanding {
  abbr: string;
  name: string;
  city: string;
  conf: string;
  w: number;
  l: number;
}
export interface NbaLine {
  playerId: number;
  name: string;
  pos: string;
  team: string;
  min: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  tov: number;
  pf: number;
}
export interface NbaAverage {
  /** NBA 공식 선수 번호 (공식 데이터에서 찾았을 때) */
  id?: number;
  gp: number;
  min: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  tov: number;
}
export const nbaStandings = () => call<{ season: number; rows: NbaStanding[]; at: number; from: 'nba' | 'api' | 'games'; building?: boolean }>('nba/standings');
/** 경기 선수 기록: NBA 공식 기록을 찾으려고 날짜 · 홈 · 원정 약자도 보낸다. src: 어디서 왔는지 (선수 번호가 달라서) */
export const nbaBox = (g: { id: number; date: string; home: string; away: string; final: boolean }) => call<{ lines: NbaLine[]; at: number; src: 'nba' | 'bdl' }>(`nba/box?${new URLSearchParams({ game: String(g.id), date: g.date, home: g.home, away: g.away, ...(g.final ? { final: '1' } : {}) })}`);
export const nbaAvg = (p: { id: number; name: string; season: number; src: 'nba' | 'bdl' }) => call<{ avg: NbaAverage | null; at: number }>(`nba/avg?${new URLSearchParams({ player: String(p.id), name: p.name, season: String(p.season), src: p.src })}`);
export interface NbaRosterPlayer {
  id: number;
  name: string;
  num: string;
  pos: string;
  height: string;
  weight: string;
  age: number;
  exp: string;
  school: string;
}
export interface NbaCareerRow {
  season: string;
  team: string;
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
}
export const nbaRoster = (team: string) => call<{ season: number; players: NbaRosterPlayer[]; at: number }>(`nba/roster?team=${team}`);
export const nbaCareer = (player: number) => call<{ rows: NbaCareerRow[]; at: number }>(`nba/career?player=${player}`);
export const nbaGames = (date: string) => call<{ games: NbaGame[]; at: number; stale?: boolean }>(`nba/games?date=${date}`);

/** 오늘의 쓸모없는 지식 (영어, 하루 하나) */
export const uselessFact = () => call<{ text: string; day: string }>('fact');

/** 공휴일 · 기념일 (한국천문연구원 특일 정보, 서버가 7일 기억) */
export interface SpecialDay {
  date: string;
  name: string;
  holiday: boolean;
}
export const specialDays = (year: number) => call<{ days: SpecialDay[] }>(`holidays?year=${year}`);

export async function schoolInfo(body: { name: string; grade?: number; cls?: string; from: string; to: string; want: ('meals' | 'events' | 'timetable')[] }) {
  return call<{ school: string; meals?: SchoolMeal[]; events?: SchoolEvent[]; timetable?: SchoolPeriod[] }>('school', 'POST', body);
}

/** 국어 낱말 뜻 (표준국어대사전, 로그인한 사람만) */
export async function dictKo(word: string, detail = false) {
  return call<{ senses: { word: string; pos?: string; definition: string; examples?: string[] }[] }>('dict/ko', 'POST', detail ? { word, detail: true } : { word });
}

// ===== 이름으로 찾기 (게임 · 책 · 음반) · 음악 추천 =====
export interface Found {
  title: string;
  by?: string;
  year?: number;
  image?: string;
  extra?: string;
}
export async function lookup(type: 'game' | 'book' | 'music', q: string) {
  return call<{ items: Found[] }>('lookup', 'POST', { type, q });
}
export async function musicSimilar(artists: string[], have: string[]) {
  return call<{ items: { name: string; because: string[] }[] }>('music/similar', 'POST', { artists, have });
}

// ===== 문제 풀이 AI =====
export type SolveEngine = 'gemini' | 'openrouter' | 'mistral' | 'groq' | 'siliconflow' | 'nvidia' | 'huggingface' | 'cloudflare';
export interface SolveTurn {
  role: 'user' | 'assistant';
  text: string;
  images?: { mime: string; data: string }[];
  /** 저장소(R2)에 둔 사진 (서버가 꺼내 붙인다) */
  imgKeys?: string[];
}
export const solveAsk = (engine: SolveEngine, turns: SolveTurn[]) => call<{ text: string; model: string }>('solve', 'POST', { engine, turns });
export interface R2Info {
  bytes: number;
  a: number;
  b: number;
  free: { bytes: number; a: number; b: number };
  stop: { bytes: number; a: number; b: number };
}
export const solveUsage = () => call<{ available: SolveEngine[]; vision?: Record<string, boolean>; used: Record<string, number>; out: Record<string, boolean>; left: Record<string, number>; gemini?: { flash: number; lite: number; gemma: number } | null; r2: R2Info | null }>('solve/usage');
/** 문제 사진을 R2 에 올리기 → 열쇠 */
export const solveImgPut = (mime: string, data: string) => call<{ key: string }>('solve/img', 'POST', { mime, data });
export const solveImgUrl = (key: string) => `/api/solve/img/${key}`;
/** 풀이를 서버에 맡기기 (바로 돌아옴) · 끝났는지 묻기 */
export const solveJobStart = (engine: SolveEngine, turns: SolveTurn[], jobId: string) => call<{ jobId: string }>('solve', 'POST', { engine, turns, jobId });
export const solveJobGet = (jobId: string) => call<{ running?: boolean; step?: string; missing?: boolean; done?: boolean; code?: number; result?: unknown }>(`solve/job/${jobId}`);
