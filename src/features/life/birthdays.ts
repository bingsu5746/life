// 생일 · 선물 계획: 다가오는 생일 날짜 (2월 29일은 평년엔 28일)
import { diffDays } from '../study/dates';
import type { DateStr } from '../study/model';

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const birthdayIn = (md: string, year: number): DateStr => (md === '02-29' && !leap(year) ? `${year}-02-28` : `${year}-${md}`);

/** 오늘 또는 그 뒤 가장 가까운 생일 */
export function nextBirthday(md: string, today: DateStr): DateStr {
  const y = Number(today.slice(0, 4));
  const d = birthdayIn(md, y);
  return d >= today ? d : birthdayIn(md, y + 1);
}

export const daysToBirthday = (md: string, today: DateStr) => diffDays(today, nextBirthday(md, today));
