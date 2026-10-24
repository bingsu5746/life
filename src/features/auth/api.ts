// 로그인 서버(worker/accounts.ts)와 이야기하는 부분. 로그인 토큰은 이 기기(localStorage)에 저장한다.

export interface Account {
  id: string;
  username: string;
  nickname: string;
}

const TOKEN_KEY = 'my-study.session.v1';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
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
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
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
    if (res.status === 401 && token && path !== 'auth/login') setToken(null); // 로그인이 풀림
    throw new ApiError(data.error ?? '오류가 났어요.', res.status);
  }
  return data;
}

export async function signup(username: string, password: string, nickname: string) {
  const r = await call<{ token: string; user: Account }>('auth/signup', 'POST', { username, password, nickname });
  setToken(r.token);
  return r.user;
}
export async function login(username: string, password: string) {
  const r = await call<{ token: string; user: Account }>('auth/login', 'POST', { username, password });
  setToken(r.token);
  return r.user;
}
export async function logout() {
  try {
    await call('auth/logout', 'POST', {});
  } finally {
    setToken(null);
  }
}
export const me = () => call<{ user: Account }>('me').then((r) => r.user);

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
