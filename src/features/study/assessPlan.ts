// 수행평가 준비 나누기: 남은 준비를 오늘부터 내는 날 전날까지 고르게 나눈다.
// 날마다 새로 계산하므로 하루 밀리면 남은 날에 다시 나뉜다.
import { addDays, diffDays } from './dates';
import type { Assessment, DateStr, Id } from './model';

export function stepDates(a: Pick<Assessment, 'due' | 'steps'>, today: DateStr): Map<Id, DateStr> {
  const left = a.steps.filter((s) => !s.done);
  const days = Math.max(1, diffDays(today, a.due));
  const out = new Map<Id, DateStr>();
  left.forEach((s, i) => out.set(s.id, a.due <= today ? today : addDays(today, Math.floor((i * days) / left.length))));
  return out;
}
