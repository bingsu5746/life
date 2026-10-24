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
