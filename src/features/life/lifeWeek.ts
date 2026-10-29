// 한 주(월~일) 돌아보기: 공부·운동·돈·영화·독서·일기·습관·할 일·취미를 한 곳에, 지난주와 비교
import { addDays, weekStart, weekday } from '../study/dates';
import { habitOn } from '../study/habits';
import { alive, type DateStr, type Movie, type StudyData } from '../study/model';
import { shiftMonth } from './calc';
import { shotsBetween, type ShotSum } from './bb';
import { pagesBetween } from './readingCalc';

export interface LifeWeek {
  from: DateStr;
  to: DateStr;
  study: { now: number; prev: number };
  workout: { days: number; minutes: number; prevDays: number };
  spent: { now: number; prev: number };
  movies: Movie[];
  pages: number;
  booksDone: string[];
  diary: { count: number; mood: number | null };
  habits: { done: number; due: number };
  todos: number;
  hobby: number;
  shots: ShotSum;
}

const kst = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

export function lifeWeek(d: StudyData, anyDay: DateStr, today: DateStr): LifeWeek {
  const from = weekStart(anyDay);
  return lifeRange(d, from, addDays(from, 6), addDays(from, -7), addDays(from, -1), today);
}

/** 한 달 (YYYY-MM) 과 지난달 */
export function lifeMonth(d: StudyData, month: string, today: DateStr): LifeWeek {
  const from = `${month}-01`;
  const to = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const pm = shiftMonth(month, -1);
  return lifeRange(d, from, to, `${pm}-01`, addDays(from, -1), today);
}

/** from~to 와 그 앞 기간(pf~pt) */
export function lifeRange(d: StudyData, from: DateStr, to: DateStr, pf: DateStr, pt: DateStr, today: DateStr): LifeWeek {
  const inR = (x: string | undefined, a: string, b: string) => !!x && x >= a && x <= b;
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
  const sessions = alive(d.sessions);
  const workouts = alive(d.workouts);
  const outs = alive(d.moneyTx).filter((t) => t.type === 'out');
  const end = to < today ? to : today;
  let due = 0;
  let done = 0;
  for (const h of alive(d.habits).filter((x) => !x.archived)) {
    for (let x = from; x <= end; x = addDays(x, 1)) {
      if (x < h.created || !habitOn(h, x)) continue;
      due++;
      if (h.checks.includes(x)) done++;
    }
  }
  const diary = alive(d.diary).filter((e) => inR(e.id, from, to));
  const moods = diary.map((e) => e.mood).filter((m): m is number => !!m);
  return {
    from,
    to,
    study: {
      now: sum(
        sessions.filter((s) => inR(s.date, from, to)),
        (s) => s.minutes,
      ),
      prev: sum(
        sessions.filter((s) => inR(s.date, pf, pt)),
        (s) => s.minutes,
      ),
    },
    workout: {
      days: new Set(workouts.filter((w) => inR(w.date, from, to)).map((w) => w.date)).size,
      minutes: sum(
        workouts.filter((w) => inR(w.date, from, to)),
        (w) => w.minutes ?? 0,
      ),
      prevDays: new Set(workouts.filter((w) => inR(w.date, pf, pt)).map((w) => w.date)).size,
    },
    spent: {
      now: sum(
        outs.filter((t) => inR(t.date, from, to)),
        (t) => t.amount,
      ),
      prev: sum(
        outs.filter((t) => inR(t.date, pf, pt)),
        (t) => t.amount,
      ),
    },
    movies: alive(d.movies).filter((m) => m.status === 'watched' && inR(m.watched, from, to)),
    pages: pagesBetween(alive(d.reads), from, to),
    booksDone: alive(d.reads)
      .filter((b) => b.status === 'done' && inR(b.finished, from, to))
      .map((b) => b.title),
    diary: { count: diary.length, mood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null },
    habits: { done, due },
    todos: alive(d.todos).filter((t) => t.done && t.doneAt && inR(kst(t.doneAt), from, to)).length,
    hobby: sum(
      alive(d.hobbyLogs).filter((l) => inR(l.date, from, to)),
      (l) => l.minutes ?? 0,
    ),
    shots: shotsBetween(d, from, to),
  };
}

/** 일요일인지 (주간 돌아보기 알림) */
export const isSunday = (date: DateStr) => weekday(date) === 0;

/** 최근 n 달의 공부 시간 · 운동한 날 · 쓴 돈 (오래된 달부터) */
export function monthTrend(d: StudyData, month: string, n = 6): { month: string; study: number; workoutDays: number; spent: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const m = shiftMonth(month, i - (n - 1));
    const inM = (x: string | undefined) => !!x && x.startsWith(m);
    return {
      month: m,
      study: alive(d.sessions)
        .filter((s) => inM(s.date))
        .reduce((a, s) => a + s.minutes, 0),
      workoutDays: new Set(
        alive(d.workouts)
          .filter((w) => inM(w.date))
          .map((w) => w.date),
      ).size,
      spent: alive(d.moneyTx)
        .filter((t) => t.type === 'out' && inM(t.date))
        .reduce((a, t) => a + t.amount, 0),
    };
  });
}
