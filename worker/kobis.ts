// 영화진흥위원회 KOBIS 오픈 API: 어제 박스오피스 · 개봉 예정 영화.
// 키는 Cloudflare 의 비밀값 KOBIS_KEY 로만 받는다 (저장소가 공개라 코드에 넣지 않는다).
// 응답 모양은 KOBIS 문서 기준으로 읽고, 모양이 다르면 KOBIS 가 준 오류 글을 그대로 알린다.

const BASE = 'https://www.kobis.or.kr/kobisopenapi/webservice/rest';

export interface BoxOfficeItem {
  rank: number;
  title: string;
  open?: string;
  /** 누적 관객 수 */
  audience?: number;
  code?: string;
}

export interface UpcomingItem {
  code: string;
  title: string;
  titleEn?: string;
  open: string;
  genre?: string;
  nation?: string;
  director?: string;
}

/** YYYYMMDD 또는 YYYY-MM-DD → YYYY-MM-DD (아니면 undefined) */
export function kDate(s: unknown): string | undefined {
  const t = typeof s === 'string' ? s.replace(/-/g, '').trim() : '';
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : undefined;
}

/** KOBIS 오류 응답 { faultInfo: { message } } 이면 그 글 */
export function kobisFault(j: unknown): string | null {
  const f = (j as { faultInfo?: { message?: unknown; errorCode?: unknown } })?.faultInfo;
  return f ? `${typeof f.message === 'string' ? f.message : 'KOBIS 오류'}${f.errorCode ? ` (${String(f.errorCode)})` : ''}` : null;
}

export function parseBoxOffice(j: unknown): BoxOfficeItem[] | null {
  const list = (j as { boxOfficeResult?: { dailyBoxOfficeList?: unknown } })?.boxOfficeResult?.dailyBoxOfficeList;
  if (!Array.isArray(list)) return null;
  return list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { movieNm?: unknown }).movieNm === 'string')
    .map((x) => ({ rank: Number(x.rank) || 0, title: String(x.movieNm), open: kDate(x.openDt), audience: Number(x.audiAcc) || undefined, code: typeof x.movieCd === 'string' ? x.movieCd : undefined }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10);
}

/** 영화 목록 응답 → 개봉 예정 (from 이후 개봉, 성인물 빼고) */
export function parseUpcoming(j: unknown, from: string, to: string): UpcomingItem[] | null {
  const list = (j as { movieListResult?: { movieList?: unknown } })?.movieListResult?.movieList;
  if (!Array.isArray(list)) return null;
  const out: UpcomingItem[] = [];
  for (const x of list as Record<string, unknown>[]) {
    if (!x || typeof x.movieNm !== 'string' || typeof x.movieCd !== 'string') continue;
    const open = kDate(x.openDt);
    if (!open || open < from || open > to) continue;
    const genre = typeof x.genreAlt === 'string' ? x.genreAlt : '';
    if (/성인/.test(genre)) continue;
    if (typeof x.typeNm === 'string' && x.typeNm && x.typeNm !== '장편') continue;
    const dirs = Array.isArray(x.directors) ? (x.directors as { peopleNm?: unknown }[]) : [];
    out.push({
      code: x.movieCd,
      title: x.movieNm,
      titleEn: typeof x.movieNmEn === 'string' && x.movieNmEn ? x.movieNmEn : undefined,
      open,
      genre: genre || undefined,
      nation: typeof x.nationAlt === 'string' && x.nationAlt ? x.nationAlt : undefined,
      director: typeof dirs[0]?.peopleNm === 'string' ? (dirs[0].peopleNm as string) : undefined,
    });
  }
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`KOBIS 응답 ${res.status}`);
  return res.json();
}

/** 어제 박스오피스 (한국 날짜 기준) */
export async function fetchBoxOffice(key: string, yesterday: string): Promise<BoxOfficeItem[]> {
  const j = await getJson(`${BASE}/boxoffice/searchDailyBoxOfficeList.json?key=${encodeURIComponent(key)}&targetDt=${yesterday.replace(/-/g, '')}`);
  const fault = kobisFault(j);
  if (fault) throw new Error(fault);
  const list = parseBoxOffice(j);
  if (!list) throw new Error('KOBIS 박스오피스 응답 모양이 예상과 달라요');
  return list;
}

/** 개봉 예정: 올해·내년 개봉 영화 목록을 몇 쪽 받아 오늘부터 days 일 안의 것 */
export async function fetchUpcoming(key: string, today: string, to: string, pages = 30): Promise<UpcomingItem[]> {
  const y = Number(today.slice(0, 4));
  const seen = new Map<string, UpcomingItem>();
  for (let p = 1; p <= pages; p++) {
    const j = await getJson(`${BASE}/movie/searchMovieList.json?key=${encodeURIComponent(key)}&openStartDt=${y}&openEndDt=${y + 1}&itemPerPage=100&curPage=${p}`);
    const fault = kobisFault(j);
    if (fault) throw new Error(fault);
    const list = parseUpcoming(j, today, to);
    if (!list) throw new Error('KOBIS 영화 목록 응답 모양이 예상과 달라요');
    for (const m of list) seen.set(m.code, m);
    const total = Number((j as { movieListResult?: { totCnt?: unknown } }).movieListResult?.totCnt);
    if (!Number.isFinite(total) || p * 100 >= total) break;
  }
  return [...seen.values()].sort((a, b) => a.open.localeCompare(b.open) || a.title.localeCompare(b.title));
}
