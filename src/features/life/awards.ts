// 내가 본 영화로 시상식 요약: 올해의 영화 · 후보 · 많이 본 장르·감독·장소·달 · 아쉬웠던 영화
import { alive, type Movie, type StudyData } from '../study/model';

export interface Tally {
  name: string;
  count: number;
}

export interface Awards {
  /** 요약 대상 연도 (null 이면 전체) */
  year: number | null;
  count: number;
  rewatch: number;
  avg: number | null;
  best?: Movie;
  nominees: Movie[];
  worst?: Movie;
  genre?: Tally;
  director?: Tally;
  place?: Tally;
  month?: Tally;
  /** 별점 5점 영화 수 */
  fives: number;
}

const top = (m: Map<string, number>): Tally | undefined => {
  const best = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? { name: best[0], count: best[1] } : undefined;
};
const add = (m: Map<string, number>, k: string | undefined, n = 1) => k && m.set(k, (m.get(k) ?? 0) + n);

/** 별점 → 리뷰·감상평이 있는 것 → 나중에 본 것 순으로 더 위 */
const rank = (a: Movie, b: Movie) => (b.rating ?? 0) - (a.rating ?? 0) || Number(!!(b.review || b.comment)) - Number(!!(a.review || a.comment)) || (b.watched ?? '').localeCompare(a.watched ?? '');

/** 본 영화 목록에서 한 해(또는 전체)의 시상식 */
export function awards(d: Pick<StudyData, 'movies'>, year: number | null): Awards {
  const list = alive(d.movies).filter((m) => m.status === 'watched' && (year === null || m.watched?.startsWith(String(year))));
  const rated = list.filter((m) => m.rating).sort(rank);
  const genre = new Map<string, number>();
  const director = new Map<string, number>();
  const place = new Map<string, number>();
  const month = new Map<string, number>();
  for (const m of list) {
    for (const g of (m.genre ?? '').split(',')) add(genre, g.trim());
    add(director, m.director);
    add(place, m.where);
    for (const a of m.again ?? []) add(place, a.where);
    if (m.watched) add(month, `${Number(m.watched.slice(5, 7))}월`);
  }
  const avg = rated.length ? Math.round((rated.reduce((a, m) => a + m.rating!, 0) / rated.length) * 10) / 10 : null;
  const worst = [...rated].reverse().find((m) => m.rating! <= 2.5);
  return {
    year,
    count: list.length,
    rewatch: list.reduce((n, m) => n + (m.again?.length ?? 0), 0),
    avg,
    best: rated[0],
    nominees: rated.slice(1, 5),
    worst: worst && worst !== rated[0] ? worst : undefined,
    genre: top(genre),
    director: top(director),
    place: top(place),
    month: top(month),
    fives: rated.filter((m) => m.rating === 5).length,
  };
}

/** 본 영화가 있는 연도 (최근 순) */
export function watchedYears(d: Pick<StudyData, 'movies'>): number[] {
  return [
    ...new Set(
      alive(d.movies)
        .filter((m) => m.status === 'watched' && m.watched)
        .map((m) => Number(m.watched!.slice(0, 4))),
    ),
  ].sort((a, b) => b - a);
}
