// 독서 계산: 읽은 곳 기록 · 기간 동안 읽은 쪽 · 올해 목표 속도
import type { Reading } from '../study/model';

/** 오늘 읽은 곳을 기록에 넣는다 (같은 날은 마지막 것만) */
export function withProgress(b: Reading, read: number, today: string): Reading {
  const log = [...(b.log ?? []).filter((l) => l.date !== today), { date: today, read }].sort((a, c) => a.date.localeCompare(c.date));
  return { ...b, read, log };
}

/** 기간(from~to, 포함) 동안 읽은 쪽 수: 날마다 늘어난 만큼 */
export function pagesBetween(list: Reading[], from: string, to: string): number {
  let n = 0;
  for (const b of list) {
    let prev = 0;
    for (const l of b.log ?? []) {
      if (l.date >= from && l.date <= to && l.read > prev) n += l.read - prev;
      prev = l.read;
    }
  }
  return n;
}

/** 올해 목표: 몇 권 · 남은 달에 한 달 몇 권 */
export function goalPace(goal: number, done: number, today: string): { left: number; perMonth: number; onTrack: boolean } {
  const month = Number(today.slice(5, 7));
  const left = Math.max(0, goal - done);
  const monthsLeft = 12 - month + 1;
  // 지금까지 지나간 몫 (이번 달은 날짜 비율만큼)
  const day = Number(today.slice(8, 10));
  const expected = (goal * (month - 1 + day / 31)) / 12;
  return { left, perMonth: Math.round((left / monthsLeft) * 10) / 10, onTrack: done >= Math.floor(expected) };
}
