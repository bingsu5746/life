// 하루 마감에서 고른 계획을 못 지킨 이유 → 통계
import { addDays } from './dates';
import { alive, type DateStr, type StudyData } from './model';

export const MISSED_REASONS = ['피곤해서', '일정 · 약속', '숙제 · 수행평가', '폰 · 게임', '하기 싫어서', '계획이 너무 많아서', '아파서', '기타'];

export function missedStats(d: Pick<StudyData, 'conditions'>, today: DateStr, n = 60): { reason: string; n: number }[] {
  const from = addDays(today, -(n - 1));
  const c = new Map<string, number>();
  for (const x of alive(d.conditions)) if (x.id >= from && x.id <= today) for (const r of x.missed ?? []) c.set(r, (c.get(r) ?? 0) + 1);
  return [...c].map(([reason, k]) => ({ reason, n: k })).sort((a, b) => b.n - a.n);
}
