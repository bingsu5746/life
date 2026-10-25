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
export async function getStore<T>(name: StoreName): Promise<T | null> {
  const r = await call<{ data: string | null }>('store/' + name);
  return r.data ? (JSON.parse(await gunzipB64(r.data)) as T) : null;
}
export async function putStore(name: StoreName, value: unknown) {
  await call('store/' + name, 'PUT', { data: await gzipB64(JSON.stringify(value)) });
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
