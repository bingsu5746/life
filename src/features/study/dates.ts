// 날짜 계산 (설계 §3). 날짜는 그 기기 시간대 기준 YYYY-MM-DD 글자로 다룬다.
import type { DateStr } from './model';

const pad = (n: number) => String(n).padStart(2, '0');

/** 이 시각의 「공부 날짜」: 하루 시작 시각(dayStart 시) 전이면 전날 */
export function studyDate(now: number | Date, dayStart = 4): DateStr {
  const d = new Date(typeof now === 'number' ? now : now.getTime());
  d.setHours(d.getHours() - dayStart);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 날짜 더하기·빼기는 UTC 로 계산해 서머타임 등의 영향을 받지 않게 한다
const toUtc = (s: DateStr) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (t: number): DateStr => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const addDays = (s: DateStr, n: number): DateStr => fromUtc(toUtc(s) + n * 86_400_000);
/** b - a (일) */
export const diffDays = (a: DateStr, b: DateStr): number => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
/** 0=일 … 6=토 */
export const weekday = (s: DateStr): number => new Date(toUtc(s)).getUTCDay();
export const isDate = (s: unknown): s is DateStr => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;

/** a 부터 b 까지 (양 끝 포함) */
export function daysBetween(a: DateStr, b: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 10/23(목) */
export function shortDate(s: DateStr): string {
  const [, m, d] = s.split('-').map(Number);
  return `${m}/${d}(${WEEKDAYS[weekday(s)]})`;
}
/** 10월 23일 (목) */
export function longDate(s: DateStr): string {
  const [, m, d] = s.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[weekday(s)]})`;
}

/** D-3, D-day, D+2 */
export function dday(today: DateStr, target: DateStr): string {
  const n = diffDays(today, target);
  return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
}

/** 그 주의 월요일 */
export function weekStart(s: DateStr): DateStr {
  return addDays(s, -((weekday(s) + 6) % 7));
}
