// 숙제 자동 나누기: 총 분량을 오늘부터 마감 전날(또는 마감 날)까지 쉬는 날을 빼고 고르게 나눈다
import { apportion } from './allocate';
import { addDays, daysBetween } from './dates';
import type { DateStr } from './model';

export interface HwPart {
  date: DateStr;
  /** 그 날 하는 번호 (처음 ~ 끝, 포함) */
  from: number;
  to: number;
}

/**
 * @param total 총 분량 (쪽·문제 수 …)
 * @param start 첫 번호 (보통 1)
 * @param includeDue 마감 날에도 나눠 넣을지 (아니면 전날까지)
 * @param off 쉬는 날 (오늘은 쉬는 날이어도 포함)
 */
export function splitHomework(total: number, start: number, today: DateStr, due: DateStr, includeDue: boolean, off: DateStr[]): HwPart[] {
  if (!(total >= 1)) return [];
  const end = includeDue ? due : addDays(due, -1);
  let dates = end >= today ? daysBetween(today, end).filter((d) => d === today || !off.includes(d)) : [today];
  // 날수보다 분량이 적으면 분량만큼의 날만 (하루 1개 미만으로 쪼개지 않는다)
  if (dates.length > total) dates = dates.slice(0, total);
  const counts = apportion(
    total,
    dates.map(() => 1),
  );
  const out: HwPart[] = [];
  let at = start;
  dates.forEach((date, i) => {
    if (counts[i] > 0) {
      out.push({ date, from: at, to: at + counts[i] - 1 });
      at += counts[i];
    }
  });
  return out;
}

/** 남은 번호들을 오늘부터 마감까지 다시 나눈다 (한 몫의 from~to 는 남은 번호의 처음~끝) */
export function resplit(remaining: number[], today: DateStr, due: DateStr, includeDue: boolean, off: DateStr[]): HwPart[] {
  const nums = [...new Set(remaining)].sort((a, b) => a - b);
  if (!nums.length) return [];
  return splitHomework(nums.length, 0, today, due, includeDue, off).map((p) => ({ date: p.date, from: nums[p.from], to: nums[p.to] }));
}
