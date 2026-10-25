// 공부 시간 분석 (계산): 날짜별·주별·과목별·요일별, 지난 기간과 비교, 연속 공부한 날
import { addDays, daysBetween, weekStart, weekday } from './dates';
import type { DateStr, StudySession } from './model';

/** 날짜별 공부 시간 (분) */
export function minutesByDate(sessions: StudySession[]): Map<DateStr, number> {
  const m = new Map<DateStr, number>();
  for (const s of sessions) m.set(s.date, (m.get(s.date) ?? 0) + s.minutes);
  return m;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** today 까지 days 일 동안 날마다 */
export function daily(byDate: Map<DateStr, number>, today: DateStr, days: number): { date: DateStr; min: number }[] {
  return daysBetween(addDays(today, -(days - 1)), today).map((date) => ({ date, min: byDate.get(date) ?? 0 }));
}

/** 최근 weeks 주 동안 주마다 (월요일 시작) */
export function weekly(byDate: Map<DateStr, number>, today: DateStr, weeks: number): { start: DateStr; min: number }[] {
  const ws = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(ws, -7 * (weeks - 1 - i));
    return { start, min: sum(daysBetween(start, addDays(start, 6)).map((d) => byDate.get(d) ?? 0)) };
  });
}

/** 요일별 평균 (월~일), 오늘까지 days 일 동안 */
export function weekdayAverage(byDate: Map<DateStr, number>, today: DateStr, days: number): number[] {
  const tot = [0, 0, 0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const { date, min } of daily(byDate, today, days)) {
    const i = (weekday(date) + 6) % 7;
    tot[i] += min;
    cnt[i]++;
  }
  return tot.map((t, i) => (cnt[i] ? Math.round(t / cnt[i]) : 0));
}

/** 같은 길이의 앞 기간과 비교 (오늘까지 days 일 vs 그 앞 days 일) */
export function compare(byDate: Map<DateStr, number>, today: DateStr, days: number): { now: number; before: number; pct: number | null } {
  const now = sum(daily(byDate, today, days).map((x) => x.min));
  const before = sum(daily(byDate, addDays(today, -days), days).map((x) => x.min));
  return { now, before, pct: before ? Math.round(((now - before) / before) * 100) : null };
}

/** 오늘(오늘 안 했으면 어제)까지 연속으로 공부한 날 */
export function studyStreak(byDate: Map<DateStr, number>, today: DateStr): number {
  let d = (byDate.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  let n = 0;
  while ((byDate.get(d) ?? 0) > 0 && n < 3650) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** 과목별 합 (많은 순). subjectId 가 없는 기록은 '' */
export function bySubject(sessions: StudySession[], from: DateStr, to: DateStr): { subjectId: string; min: number }[] {
  const m = new Map<string, number>();
  for (const s of sessions) if (s.date >= from && s.date <= to) m.set(s.subjectId ?? '', (m.get(s.subjectId ?? '') ?? 0) + s.minutes);
  return [...m.entries()].map(([subjectId, min]) => ({ subjectId, min })).sort((a, b) => b.min - a.min);
}
