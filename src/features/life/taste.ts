// 영화 취향 지도: 별점 준 영화의 장르·나라·감독별 편수와 평균 별점
import { alive, type StudyData } from '../study/model';

export interface TasteRow {
  name: string;
  count: number;
  avg: number;
}

const tally = (rows: { keys: string[]; rating: number }[]): TasteRow[] => {
  const m = new Map<string, { n: number; sum: number }>();
  for (const r of rows) for (const k of r.keys) {
    const t = m.get(k) ?? { n: 0, sum: 0 };
    m.set(k, { n: t.n + 1, sum: t.sum + r.rating });
  }
  return [...m].map(([name, t]) => ({ name, count: t.n, avg: Math.round((t.sum / t.n) * 10) / 10 })).sort((a, b) => b.count - a.count || b.avg - a.avg);
};

/** 별점 준 본 영화 기준. 장르·나라·감독은 영화 목록에서 골라 담은 영화만 정보가 있다 */
export function tasteMap(d: Pick<StudyData, 'movies'>): { rated: number; withInfo: number; genres: TasteRow[]; nations: TasteRow[]; directors: TasteRow[] } {
  const list = alive(d.movies).filter((m) => m.status === 'watched' && m.rating);
  const split = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    rated: list.length,
    withInfo: list.filter((m) => m.genre || m.nation || m.director).length,
    genres: tally(list.map((m) => ({ keys: split(m.genre), rating: m.rating! }))),
    nations: tally(list.map((m) => ({ keys: split(m.nation), rating: m.rating! }))),
    directors: tally(list.map((m) => ({ keys: m.director ? [m.director] : [], rating: m.rating! }))),
  };
}

/** 아직 별점 준 영화가 없는 장르 (목록에 있는 장르 중, 성인물 빼고) */
export function unexplored(all: string[], seen: TasteRow[]): string[] {
  const s = new Set(seen.map((x) => x.name));
  return all.filter((g) => !s.has(g) && !/성인/.test(g));
}
