// 하루 마감에서 적은 휴대폰 사용 시간 · 계획을 못 지킨 이유 → 통계
import { addDays, daysBetween } from './dates';
import { alive, type DateStr, type StudyData } from './model';

export const MISSED_REASONS = ['피곤해서', '일정 · 약속', '숙제 · 수행평가', '폰 · 게임', '하기 싫어서', '계획이 너무 많아서', '아파서', '기타'];

export function screenStats(d: Pick<StudyData, 'conditions' | 'sessions'>, today: DateStr, n = 28) {
  const study = new Map<DateStr, number>();
  for (const s of alive(d.sessions)) study.set(s.date, (study.get(s.date) ?? 0) + s.minutes);
  const rows = daysBetween(addDays(today, -(n - 1)), today)
    .map((date) => ({ date, screen: d.conditions[date] && !d.conditions[date].deleted ? d.conditions[date].screen : undefined, study: study.get(date) ?? 0 }))
    .filter((x): x is { date: DateStr; screen: number; study: number } => typeof x.screen === 'number');
  if (!rows.length) return null;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const sorted = [...rows].sort((a, b) => a.screen - b.screen);
  const half = Math.floor(sorted.length / 2);
  return {
    rows,
    avgScreen: avg(rows.map((r) => r.screen)),
    // 폰을 적게 쓴 날 절반 · 많이 쓴 날 절반의 공부 평균 (4일 이상 적었을 때)
    lowStudy: sorted.length >= 4 ? avg(sorted.slice(0, half).map((r) => r.study)) : null,
    highStudy: sorted.length >= 4 ? avg(sorted.slice(sorted.length - half).map((r) => r.study)) : null,
  };
}

export function missedStats(d: Pick<StudyData, 'conditions'>, today: DateStr, n = 60): { reason: string; n: number }[] {
  const from = addDays(today, -(n - 1));
  const c = new Map<string, number>();
  for (const x of alive(d.conditions)) if (x.id >= from && x.id <= today) for (const r of x.missed ?? []) c.set(r, (c.get(r) ?? 0) + 1);
  return [...c].map(([reason, k]) => ({ reason, n: k })).sort((a, b) => b.n - a.n);
}
