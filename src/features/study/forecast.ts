// 문제집 끝내기 예측: 최근에 푼 속도로 보면 마감 전에 끝낼 수 있는지
import { addDays, daysBetween } from './dates';
import type { DateStr, Mark } from './model';
import { dayWeight, planEnd, type PlanCtx, type Target } from './plan';
import { expand } from './pages';
import type { Plan, StudyData } from './model';
import { planCtx, type PlanView } from './select';

export interface Forecast {
  /** 최근 window 일 동안 하루 평균 (쪽 · Day) */
  perDay: number;
  /** 남은 양 */
  left: number;
  /** 이 속도로 끝나는 날 (속도가 0 이면 null) */
  finish: DateStr | null;
  /** 마지막 공부하는 날 (마감 없으면 null) */
  end: DateStr | null;
  /** 오늘부터 마감까지 공부하는 날 수 (쉬는 날 빼고) */
  daysLeft: number;
  /** 마감까지 끝내려면 하루에 (공부하는 날 기준) */
  need: number | null;
  /** ok: 마감 전에 끝남, short: 모자람, none: 최근 기록 없음, done: 다 함 */
  state: 'ok' | 'short' | 'none' | 'done';
  /** 모자라면 며칠 */
  shortDays: number;
}

/**
 * 최근 window 일 동안 체크한 양: 체크 기록(시각 포함) 중 그 기간에 체크했고 지금도 체크된 것만 센다.
 * (체크했다가 지운 것은 빠진다)
 */
export function recentDone(done: Mark[], current: Set<number>, since: number): number {
  const items = new Set<number>();
  for (const [a, b, at] of done) if (at >= since) for (const p of expand([[a, b]])) if (current.has(p)) items.add(p);
  return items.size;
}

export function forecast(plan: Plan, target: Target, ctx: PlanCtx, marks: Mark[], now = Date.now(), window = 14): Forecast {
  const all = expand(plan.range);
  const left = all.filter((p) => !target.done.has(p)).length;
  const end = planEnd(plan, ctx.exams, target.subjectId);
  const today = ctx.today;
  // 계획을 시작한 지 window 일이 안 됐으면 시작한 날부터
  const span = Math.max(1, Math.min(window, daysBetween(plan.start < today ? plan.start : today, today).length));
  const since = now - span * 86_400_000;
  const inPlan = new Set(all.filter((p) => target.done.has(p)));
  const perDay = Math.round((recentDone(marks, inPlan, since) / span) * 10) / 10;
  const days = end && end >= today ? daysBetween(today, end).filter((d) => dayWeight(d, plan, ctx) > 0).length : 0;
  const base = { perDay, left, end, daysLeft: days, need: days ? Math.ceil(left / days) : null };
  if (!left) return { ...base, finish: null, state: 'done', shortDays: 0 };
  if (perDay <= 0) return { ...base, finish: null, state: 'none', shortDays: 0 };
  const needDays = Math.ceil(left / perDay);
  const finish = addDays(today, needDays - 1);
  if (!end) return { ...base, finish, state: 'ok', shortDays: 0 };
  const short = Math.max(0, needDays - days);
  return { ...base, finish, state: short > 0 ? 'short' : 'ok', shortDays: short };
}

/** 예측을 한 줄로 */
export function forecastText(f: Forecast, unit: string, fmt: (d: DateStr) => string): string {
  if (f.state === 'done') return '다 끝냈어요';
  if (f.state === 'none') return f.need ? `최근 기록이 없어요. 마감까지 하루 ${f.need}${unit}씩 하면 끝나요` : '최근 기록이 없어 예측할 수 없어요';
  const pace = `요즘 하루 평균 ${f.perDay}${unit}`;
  if (!f.end) return `${pace} → ${fmt(f.finish!)}쯤 끝나요`;
  if (f.state === 'ok') return `${pace} → ${fmt(f.finish!)}쯤 끝나요 (마감 전에 끝나요)`;
  return `${pace}로는 ${f.shortDays}일 모자라요. 하루 ${f.need}${unit}씩 해야 해요`;
}

/** 계획 보기(PlanView) 하나의 예측 */
export function forecastFor(d: StudyData, p: PlanView, today: DateStr): Forecast {
  const owner = p.plan.target === 'book' ? d.books[p.plan.targetId] : d.wordLists[p.plan.targetId];
  return forecast(p.plan, p.target, planCtx(d, today), owner?.done ?? []);
}
