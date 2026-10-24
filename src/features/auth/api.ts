// 로그인 서버(worker/accounts.ts)와 이야기하는 부분.
// 로그인 토큰은 서버가 HttpOnly 쿠키로만 주고 받는다 (이 페이지의 자바스크립트는 토큰을 볼 수 없음).
// 이 기기에는 「로그인했는지」 표시와 계정 id(자료 주인 확인용)만 남긴다.

export interface Account {
  id: string;
  username: string;
  nickname: string;
}

const FLAG_KEY = 'my-study.logged-in.v2';

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

function setFlag(userId: string | null) {
  try {
    if (userId) localStorage.setItem(FLAG_KEY, userId);
    else localStorage.removeItem(FLAG_KEY);
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
  setFlag(r.user.id);
  return r.user;
}
export async function login(username: string, password: string) {
  const r = await call<{ user: Account }>('auth/login', 'POST', { username, password });
  setFlag(r.user.id);
  return r.user;
}
export async function logout(everywhere = false) {
  try {
    await call(everywhere ? 'auth/logout-all' : 'auth/logout', 'POST', {});
  } finally {
    setFlag(null);
  }
}
export async function me() {
  try {
    const user = (await call<{ user: Account }>('me')).user;
    if (readFlag() !== user.id) setFlag(user.id);
    return user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setFlag(null);
    throw e;
  }
}
export const changeNickname = (nickname: string) => call<{ user: Account }>('me/nickname', 'PUT', { nickname }).then((r) => r.user);
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
