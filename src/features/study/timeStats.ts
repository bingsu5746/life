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

export const STUDY_PLACES = ['집', '독서실', '학교', '학원', '도서관', '카페'];
export const TIME_SLOTS: { key: string; label: string; from: number; to: number }[] = [
  { key: 'dawn', label: '새벽 (0~6시)', from: 0, to: 6 },
  { key: 'morning', label: '오전 (6~12시)', from: 6, to: 12 },
  { key: 'afternoon', label: '오후 (12~18시)', from: 12, to: 18 },
  { key: 'evening', label: '저녁 (18~22시)', from: 18, to: 22 },
  { key: 'night', label: '밤 (22~24시)', from: 22, to: 24 },
];

export interface Bucket {
  name: string;
  minutes: number;
  count: number;
  /** 한 번에 평균 몇 분 (뽀모도로는 길이가 정해져 있어 빼고 셈, 없으면 null) */
  avg: number | null;
}

/** 한국 시각 몇 시 */
const kstHour = (ms: number) => new Date(ms + 9 * 3600_000).getUTCHours();

/** from~to 의 공부를 장소별 · 시간대별로 (직접 넣은 기록은 시각을 몰라 시간대에서 뺀다) */
export function placeTimeStats(sessions: StudySession[], from: DateStr, to: DateStr): { places: Bucket[]; slots: Bucket[]; bestPlace: Bucket | null; bestSlot: Bucket | null } {
  const list = sessions.filter((s) => s.date >= from && s.date <= to && s.minutes > 0);
  const make = (keyOf: (s: StudySession) => string | null) => {
    const m = new Map<string, { minutes: number; count: number; free: number; freeN: number }>();
    for (const s of list) {
      const k = keyOf(s);
      if (!k) continue;
      const b = m.get(k) ?? { minutes: 0, count: 0, free: 0, freeN: 0 };
      b.minutes += s.minutes;
      b.count++;
      if (s.kind !== 'pomo') {
        b.free += s.minutes;
        b.freeN++;
      }
      m.set(k, b);
    }
    return [...m].map(([name, b]) => ({ name, minutes: b.minutes, count: b.count, avg: b.freeN ? Math.round(b.free / b.freeN) : null })).sort((a, b) => b.minutes - a.minutes);
  };
  const places = make((s) => s.place ?? null);
  const slots = make((s) => (s.kind === 'manual' ? null : (TIME_SLOTS.find((t) => kstHour(s.start) >= t.from && kstHour(s.start) < t.to)?.label ?? null)));
  const best = (bs: Bucket[]) => bs.filter((b) => b.avg !== null && b.count >= 3).sort((a, b) => b.avg! - a.avg!)[0] ?? null;
  return { places, slots, bestPlace: places.length > 1 ? best(places) : null, bestSlot: slots.length > 1 ? best(slots) : null };
}
