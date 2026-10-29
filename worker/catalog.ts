// 영화 목록 찾기: 서버 메모리에 한 번 올려 둔 목록에서 거른다 (찾을 때마다 표 전체를 읽지 않게)
export interface Film {
  code: string;
  title: string;
  norm: string;
  title_en: string | null;
  open: string;
  genre: string | null;
  nation: string | null;
  director: string | null;
  type: string | null;
}
export interface FilmQuery {
  norm: string;
  genre: string;
  nation: string;
  from: number;
  to: number;
  type: string;
  adult: boolean;
  offset: number;
}

const flat = (s: string | null) => (s ?? '').toLowerCase().replace(/\s+/g, '');

/** 거르고 순서 매기기: 이름이 같은 것 → 이름이 그 말로 시작하는 것 → 개봉 최근 순. limit+1 개까지 */
export function searchFilms(films: Film[], q: FilmQuery, limit = 60): Film[] {
  if (!q.norm && !q.genre && !q.nation && !q.from && !q.to && !q.type && q.adult) return [];
  const out = films.filter((f) => {
    if (q.norm && !f.norm.includes(q.norm) && !flat(f.director).includes(q.norm) && !flat(f.title_en).includes(q.norm)) return false;
    if (q.genre && !(f.genre ?? '').includes(q.genre)) return false;
    if (q.nation && !(f.nation ?? '').includes(q.nation)) return false;
    const y = Number(f.open.slice(0, 4));
    if (q.from && !(y >= q.from)) return false;
    if (q.to && !(y <= q.to)) return false;
    if (q.type === '장편' && f.type && f.type !== '장편') return false;
    if (q.type === '단편' && f.type !== '단편') return false;
    if (!q.adult && (f.genre ?? '').includes('성인')) return false;
    return true;
  });
  const rank = (f: Film) => (q.norm ? (f.norm === q.norm ? 0 : f.norm.startsWith(q.norm) ? 1 : 2) : 0);
  out.sort((a, b) => rank(a) - rank(b) || b.open.localeCompare(a.open));
  return out.slice(q.offset, q.offset + limit + 1);
}

/** 거르기 칸에 보일 장르·나라 (많은 순) */
export function filmFacets(films: Film[]): { genres: string[]; nations: string[] } {
  const tally = (get: (f: Film) => string | null) => {
    const m = new Map<string, number>();
    for (const f of films) for (const t of (get(f) ?? '').split(',')) if (t.trim()) m.set(t.trim(), (m.get(t.trim()) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  };
  return { genres: tally((f) => f.genre).slice(0, 40), nations: tally((f) => f.nation).slice(0, 30) };
}
