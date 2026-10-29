// 습관: 하는 날 · 연속 일수 (4단계)
import { addDays, weekday } from './dates';
import type { DateStr, Habit } from './model';

export const habitOn = (h: Pick<Habit, 'weekdays'>, date: DateStr) => !h.weekdays.length || h.weekdays.includes(weekday(date));

/**
 * 연속 일수: 하는 날만 세고, 하지 않는 요일은 건너뛴다.
 * 오늘은 아직 안 했어도 끊긴 것으로 보지 않는다 (어제까지 이어졌으면 그 수).
 */
export function streak(h: Pick<Habit, 'weekdays' | 'checks' | 'created'>, today: DateStr): number {
  const checks = new Set(h.checks);
  let n = 0;
  let d = today;
  if (habitOn(h, d) && !checks.has(d)) d = addDays(d, -1);
  for (let i = 0; i < 1000 && d >= h.created; i++, d = addDays(d, -1)) {
    if (!habitOn(h, d)) continue;
    if (!checks.has(d)) break;
    n++;
  }
  return n;
}

/** 가장 길었던 연속 */
export function bestStreak(h: Pick<Habit, 'weekdays' | 'checks' | 'created'>, today: DateStr): number {
  const checks = new Set(h.checks);
  let best = 0;
  let cur = 0;
  for (let d = h.created; d <= today; d = addDays(d, 1)) {
    if (!habitOn(h, d)) continue;
    if (checks.has(d)) best = Math.max(best, ++cur);
    else if (d !== today) cur = 0;
  }
  return best;
}

/** 체크 기록은 최근 400일치만 */
const KEEP = 400;

/** 그날 체크·해제 (log 에 시각을 남겨 다른 기기와 합칠 수 있게) */
export function toggleHabit(h: Habit, date: DateStr, now = Date.now()): Habit {
  const on = h.checks.includes(date);
  const checks = on ? h.checks.filter((x) => x !== date) : [...h.checks, date].sort().slice(-KEEP);
  const log = Object.fromEntries(
    Object.entries({ ...(h.log ?? {}), [date]: on ? -now : now })
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-KEEP),
  );
  return { ...h, checks, log };
}

/** 두 기기의 체크 합치기: 날짜마다 늦게 한 것(체크·해제). 기록(log)이 없는 옛 체크는 「아주 예전에 체크함」으로 본다 */
export function mergeHabitChecks(a: Pick<Habit, 'checks' | 'log'>, b: Pick<Habit, 'checks' | 'log'>): Pick<Habit, 'checks' | 'log'> {
  const state = new Map<DateStr, number>();
  const log: Record<DateStr, number> = {};
  for (const h of [a, b]) {
    for (const d of h.checks ?? []) if (!state.has(d)) state.set(d, 0);
    for (const [d, t] of Object.entries(h.log ?? {})) {
      if (Math.abs(t) >= Math.abs(state.get(d) ?? 0)) state.set(d, t);
      if (Math.abs(t) > Math.abs(log[d] ?? 0)) log[d] = t;
    }
  }
  // 체크 목록: 마지막이 체크(+) 이거나 기록 없이 체크돼 있던(0) 날
  const checks = [...state].filter(([, t]) => t >= 0).map(([d]) => d).sort().slice(-KEEP);
  const keep = Object.keys(log).sort().slice(-KEEP);
  return { checks, log: Object.fromEntries(keep.map((d) => [d, log[d]])) };
}

export interface WeekdayRate {
  /** 0 일 ~ 6 토 */
  weekday: number;
  /** 하기로 한 날 수 · 한 날 수 */
  due: number;
  done: number;
  /** 0~100, 하기로 한 날이 없으면 null */
  pct: number | null;
}

/** 최근 weeks 주 동안 요일별 달성률. 오늘은 안 했으면 아직 안 센다 */
export function weekdayRates(habits: Pick<Habit, 'weekdays' | 'checks' | 'created'>[], today: DateStr, weeks = 12): WeekdayRate[] {
  const out: WeekdayRate[] = Array.from({ length: 7 }, (_, weekdayIdx) => ({ weekday: weekdayIdx, due: 0, done: 0, pct: null }));
  for (const h of habits) {
    const checks = new Set(h.checks);
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(today, -i);
      if (d < h.created || !habitOn(h, d)) continue;
      const on = checks.has(d);
      if (d === today && !on) continue;
      const r = out[weekday(d)];
      r.due++;
      if (on) r.done++;
    }
  }
  for (const r of out) r.pct = r.due ? Math.round((r.done / r.due) * 100) : null;
  return out;
}
