// 잠·컨디션: 잔 시간 계산, 공부 시간과 비교
import type { DateStr, DayCondition } from './model';

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 잔 시간 (분). 잠든 시각이 일어난 시각보다 늦으면 전날 밤에 잔 것으로. 16시간 넘으면 잘못 넣은 것으로 보고 null */
export function sleepMinutes(c: Pick<DayCondition, 'sleep' | 'wake'> | undefined): number | null {
  if (!c?.sleep || !c.wake) return null;
  let m = mins(c.wake) - mins(c.sleep);
  if (m <= 0) m += 24 * 60;
  return m > 16 * 60 ? null : m;
}

export interface Split {
  /** 기준 이상인 날 평균 공부 (분) */
  high: number;
  /** 기준 미만인 날 평균 공부 (분) */
  low: number;
  highDays: number;
  lowDays: number;
}

/**
 * 두 무리로 나눠 평균 공부 시간 비교 (예: 7시간 이상 잔 날 vs 덜 잔 날).
 * 어느 쪽이든 minDays 일보다 적으면 null (비교하기엔 기록이 적음)
 */
export function splitStudy(days: { date: DateStr; value: number | null }[], study: Map<DateStr, number>, threshold: number, minDays = 3): Split | null {
  const hi: number[] = [];
  const lo: number[] = [];
  for (const d of days) {
    if (d.value === null) continue;
    (d.value >= threshold ? hi : lo).push(study.get(d.date) ?? 0);
  }
  if (hi.length < minDays || lo.length < minDays) return null;
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return { high: avg(hi), low: avg(lo), highDays: hi.length, lowDays: lo.length };
}

export interface SleepBucket {
  label: string;
  days: number;
  /** 그날 평균 공부 시간 (분) · 평균 기분 (컨디션과 일기 기분, 1~5) */
  study: number;
  mood: number | null;
}

const BUCKETS: [string, number, number][] = [
  ['5시간 아래', 0, 300],
  ['5~6시간', 300, 360],
  ['6~7시간', 360, 420],
  ['7~8시간', 420, 480],
  ['8시간 넘게', 480, 2000],
];

/**
 * 잔 시간대별로 그날 공부 시간·기분 평균 (기록한 날끼리). best: 사흘 넘게 기록한 구간 중 공부가 가장 많은 곳.
 * moodOf: 날짜 → 기분 (컨디션 기분이 없으면 일기 기분)
 */
export function sleepBuckets(days: { date: DateStr; sleep: number | null; mood: number | null }[], study: Map<DateStr, number>): { buckets: SleepBucket[]; best: SleepBucket | null } {
  const buckets = BUCKETS.map(([label, a, b]) => {
    const ds = days.filter((x) => x.sleep !== null && x.sleep >= a && x.sleep < b);
    const moods = ds.map((x) => x.mood).filter((m): m is number => m !== null);
    return {
      label,
      days: ds.length,
      study: ds.length ? Math.round(ds.reduce((n, x) => n + (study.get(x.date) ?? 0), 0) / ds.length) : 0,
      mood: moods.length ? Math.round((moods.reduce((n, m) => n + m, 0) / moods.length) * 10) / 10 : null,
    };
  });
  const ok = buckets.filter((b) => b.days >= 3);
  return { buckets, best: ok.length > 1 ? [...ok].sort((a, b) => b.study - a.study)[0] : null };
}
