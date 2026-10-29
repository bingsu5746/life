// 이름으로 찾기: 게임(RAWG) · 책(카카오 책 검색, 없으면 알라딘) · 음반(Discogs) · 비슷한 아티스트(Last.fm).
// 키는 모두 Cloudflare 비밀값 (RAWG_KEY · KAKAO_KEY · ALADIN_KEY · DISCOGS_TOKEN · LASTFM_KEY).
export interface Found {
  title: string;
  /** 지은이 · 아티스트 · 기기 */
  by?: string;
  year?: number;
  image?: string;
  extra?: string;
}

const yearOf = (v: unknown) => {
  const y = typeof v === 'string' ? Number(v.slice(0, 4)) : typeof v === 'number' ? v : NaN;
  return y > 1800 && y < 2200 ? y : undefined;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function parseRawg(j: unknown): Found[] {
  const list = (j as { results?: Record<string, unknown>[] })?.results ?? [];
  return list.slice(0, 8).map((g) => ({
    title: str(g.name),
    year: yearOf(g.released),
    by: ((g.platforms as { platform?: { name?: string } }[] | undefined) ?? [])
      .map((p) => p.platform?.name)
      .filter(Boolean)
      .slice(0, 4)
      .join(', '),
    image: str(g.background_image) || undefined,
  })).filter((x) => x.title);
}

export function parseKakaoBooks(j: unknown): Found[] {
  const list = (j as { documents?: Record<string, unknown>[] })?.documents ?? [];
  return list.slice(0, 8).map((b) => ({
    title: str(b.title),
    by: Array.isArray(b.authors) ? (b.authors as string[]).join(', ') : undefined,
    year: yearOf(b.datetime),
    image: str(b.thumbnail) || undefined,
    extra: str(b.publisher) || undefined,
  })).filter((x) => x.title);
}

export function parseAladin(j: unknown): Found[] {
  const list = (j as { item?: Record<string, unknown>[] })?.item ?? [];
  return list.slice(0, 8).map((b) => ({ title: str(b.title), by: str(b.author) || undefined, year: yearOf(b.pubDate), image: str(b.cover) || undefined, extra: str(b.publisher) || undefined })).filter((x) => x.title);
}

/** Discogs 제목은 「아티스트 - 앨범」 */
export function parseDiscogs(j: unknown): Found[] {
  const list = (j as { results?: Record<string, unknown>[] })?.results ?? [];
  return list.slice(0, 8).map((r) => {
    const t = str(r.title);
    const i = t.indexOf(' - ');
    return { title: i > 0 ? t.slice(i + 3) : t, by: i > 0 ? t.slice(0, i).replace(/\s*\(\d+\)$/, '') : undefined, year: yearOf(r.year), image: str(r.thumb) || undefined, extra: Array.isArray(r.format) ? (r.format as string[]).slice(0, 2).join(' · ') : undefined };
  }).filter((x) => x.title);
}

export function parseSimilar(j: unknown): string[] {
  const list = (j as { similarartists?: { artist?: { name?: string }[] } })?.similarartists?.artist ?? [];
  return list.map((a) => str(a.name)).filter(Boolean);
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'LifeApp/1.0 (personal study app)', ...headers } });
  if (!res.ok) throw new Error(`응답 ${res.status}`);
  return res.json();
}

export async function findGames(key: string, q: string) {
  return parseRawg(await getJson(`https://api.rawg.io/api/games?${new URLSearchParams({ key, search: q, page_size: '8' })}`));
}
export async function findBooksKakao(key: string, q: string) {
  return parseKakaoBooks(await getJson(`https://dapi.kakao.com/v3/search/book?${new URLSearchParams({ query: q, size: '8' })}`, { authorization: `KakaoAK ${key}` }));
}
export async function findBooksAladin(key: string, q: string) {
  return parseAladin(await getJson(`https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?${new URLSearchParams({ ttbkey: key, Query: q, QueryType: 'Keyword', MaxResults: '8', start: '1', SearchTarget: 'Book', output: 'js', Version: '20131101' })}`));
}
export async function findRecords(token: string, q: string) {
  return parseDiscogs(await getJson(`https://api.discogs.com/database/search?${new URLSearchParams({ q, type: 'release', per_page: '8' })}`, { authorization: `Discogs token=${token}` }));
}
export async function similarArtists(key: string, artist: string) {
  return parseSimilar(await getJson(`https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ method: 'artist.getsimilar', artist, api_key: key, format: 'json', limit: '12', autocorrect: '1' })}`));
}
