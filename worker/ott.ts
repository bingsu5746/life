// 어느 OTT 에 있는지: TMDB(The Movie Database) 의 「시청 가능한 곳」 (JustWatch 자료). 키는 비밀값 TMDB_KEY.
const BASE = 'https://api.themoviedb.org/3';

/** v3 키는 주소에, v4 읽기 토큰(긴 값)은 머리글에 */
function auth(key: string, url: string): { url: string; headers: Record<string, string> } {
  const bearer = key.length > 60;
  return { url: bearer ? url : `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`, headers: bearer ? { authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' } };
}

async function get(key: string, path: string): Promise<unknown> {
  const a = auth(key, `${BASE}${path}`);
  const res = await fetch(a.url, { headers: a.headers });
  if (!res.ok) throw new Error(`TMDB 응답 ${res.status}`);
  return res.json();
}

/** 검색 결과에서 연도(±1)가 맞는 첫 영화의 id (연도를 모르면 첫 결과) */
export function pickMovie(j: unknown, year?: number): number | undefined {
  const list = (j as { results?: { id?: unknown; release_date?: unknown }[] })?.results;
  if (!Array.isArray(list)) return undefined;
  const ok = list.filter((m) => typeof m?.id === 'number');
  const hit = year ? ok.find((m) => typeof m.release_date === 'string' && Math.abs(Number(m.release_date.slice(0, 4)) - year) <= 1) : ok[0];
  return hit?.id as number | undefined;
}

/** 시청 가능한 곳 응답 → 한국에서 정액제(구독)로 볼 수 있는 서비스 이름들 */
export function pickProviders(j: unknown): string[] {
  const kr = (j as { results?: { KR?: { flatrate?: { provider_name?: unknown }[] } } })?.results?.KR;
  return (kr?.flatrate ?? []).map((p) => p.provider_name).filter((n): n is string => typeof n === 'string');
}

export async function fetchProviders(key: string, title: string, year?: number): Promise<string[]> {
  const q = `/search/movie?query=${encodeURIComponent(title)}&language=ko-KR${year ? `&year=${year}` : ''}`;
  let id = pickMovie(await get(key, q), year);
  // 연도가 어긋났을 수 있어 연도 없이 한 번 더
  if (!id && year) id = pickMovie(await get(key, `/search/movie?query=${encodeURIComponent(title)}&language=ko-KR`), year);
  if (!id) return [];
  return pickProviders(await get(key, `/movie/${id}/watch/providers`));
}
