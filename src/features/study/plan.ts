// 계획: 오늘 분량 · 남은 날에 다시 나누기 · 경고 (설계 §5.2~5.5)
// 계획은 날짜표로 저장하지 않고, 언제나 「지금 남은 것 ÷ 지금부터 남은 날」로 새로 계산한다.
// 오늘 분량만 오늘 처음 볼 때 정해서(todayLock) 오늘 동안 바뀌지 않게 한다.
import { apportion, slice, snapToUnits } from './allocate';
import { addDays, daysBetween, weekday } from './dates';
import type { DateStr, Exam, Id, Plan, StudySettings, Tutor, Unit } from './model';
import { subjectExamDate } from './exams';
import { expand } from './pages';
import { hasClass } from './tutor';

export interface PlanCtx {
  today: DateStr;
  settings: StudySettings;
  tutors: Tutor[];
  exams: Record<Id, Exam>;
}

/** 계획 대상의 지금 상태 */
export interface Target {
  units: Unit[];
  done: Set<number>;
  /** 과외 숙제로 잡힌 페이지 (계획에서 뺌) */
  reserved: Set<number>;
  /** 문제집·단어장의 과목 (시험에 그 과목 시험 날이 따로 있으면 그날까지) */
  subjectId?: Id;
}

export interface DayPlan {
  date: DateStr;
  weight: number;
  items: number[];
}

export type Warning =
  | { kind: 'over'; perDay: number; baseline: number }
  | { kind: 'max'; perDay: number; max: number }
  | { kind: 'nodays' }
  | { kind: 'overdue'; due: DateStr }
  /** 맞춘 시험이 끝났다 (오늘 분량은 없음, 끝내거나 고치기) */
  | { kind: 'ended'; due: DateStr };

export interface Schedule {
  /** 마지막 공부하는 날 (마감 전날 또는 마감 날) */
  end: DateStr | null;
  today: number[];
  /** 오늘 분량이 고정된 것인지 */
  locked: boolean;
  /** 내일부터의 날짜별 분량 */
  days: DayPlan[];
  /** 아직 안 한 것 (오늘 분량 포함) */
  remaining: number[];
  total: number;
  doneCount: number;
  warning: Warning | null;
}

/** 마감 날짜 (시험이면 그 과목 시험 날, 따로 없으면 시험 첫날) */
export function planDue(plan: Plan, exams: Record<Id, Exam>, subjectId?: Id): DateStr | null {
  if (plan.examId) {
    const e = exams[plan.examId];
    if (e && !e.deleted) return subjectExamDate(e, subjectId);
    // 시험을 지웠으면: 지울 때 옮겨 둔 날짜, 없으면 지운 표시에 남은 시험 날짜
    if (plan.due) return plan.due;
    if (e?.date) return e.date;
    return null;
  }
  return plan.due ?? null;
}

/** 마지막 공부하는 날 */
export function planEnd(plan: Plan, exams: Record<Id, Exam>, subjectId?: Id): DateStr | null {
  const due = planDue(plan, exams, subjectId);
  if (!due) return null;
  return plan.includeDue ? due : addDays(due, -1);
}

/** 그날의 무게: 쉬는 날 0, 과외 날은 비율만큼, 그 밖 1 */
export function dayWeight(date: DateStr, plan: Plan, ctx: PlanCtx): number {
  const s = ctx.settings;
  const rest = plan.restDays ?? s.restDays;
  if (s.offDates.includes(date)) return 0;
  if (rest.includes(weekday(date))) return 0;
  const useTutor = plan.target === 'book' || s.wordsUseTutorRatio;
  if (useTutor && ctx.tutors.some((t) => !t.deleted && hasClass(t, date))) return s.tutorRatio;
  return 1;
}

/** 계획 범위에서 아직 안 한 것 (숙제로 잡힌 것 제외), 순서대로 */
export function remainingItems(plan: Plan, target: Target): number[] {
  return expand(plan.range).filter((p) => !target.done.has(p) && !target.reserved.has(p));
}

function allocateDays(items: number[], dates: DateStr[], plan: Plan, ctx: PlanCtx, target: Target): DayPlan[] {
  const weights = dates.map((d) => dayWeight(d, plan, ctx));
  let counts = apportion(items.length, weights);
  if (plan.target === 'book') {
    const ends = new Set(target.units.map((u) => u.to));
    counts = snapToUnits(counts, (k) => ends.has(items[k]), items.length);
  }
  const parts = slice(items, counts);
  return dates.map((date, i) => ({ date, weight: weights[i], items: parts[i] }));
}

export function schedule(plan: Plan, target: Target, ctx: PlanCtx): Schedule {
  const all = expand(plan.range);
  const remaining = remainingItems(plan, target);
  const doneCount = all.filter((p) => target.done.has(p)).length;
  const end = planEnd(plan, ctx.exams, target.subjectId);
  const first = plan.start > ctx.today ? plan.start : ctx.today;
  const base: Omit<Schedule, 'today' | 'locked' | 'days' | 'warning'> = { end, remaining, total: all.length, doneCount };
  if (!remaining.length) return { ...base, today: [], locked: false, days: [], warning: null };

  const lock = plan.todayLock?.date === ctx.today ? plan.todayLock : undefined;
  const due = planDue(plan, ctx.exams, target.subjectId);
  if (plan.examId && due && due < ctx.today) {
    // 시험이 끝났다: 남은 것을 매일 다 보여 주지 않고, 끝내거나 고치라고 알린다
    return { ...base, today: [], locked: false, days: [], warning: { kind: 'ended', due } };
  }
  if (!end || end < first) {
    // 마감이 지났다: 남은 것을 오늘 다 보여 주고 알린다
    const due = end ? addDays(end, plan.includeDue ? 0 : 1) : ctx.today;
    return { ...base, today: lock ? lock.items : remaining, locked: !!lock, days: [], warning: { kind: 'overdue', due } };
  }

  let todayItems: number[];
  let days: DayPlan[];
  if (lock) {
    todayItems = lock.items;
    const locked = new Set(lock.items);
    const rest = remaining.filter((p) => !locked.has(p));
    // 내일부터 (시작일이 더 뒤면 시작일부터) 나눈다
    const from = first > ctx.today ? first : addDays(ctx.today, 1);
    days = end >= from ? allocateDays(rest, daysBetween(from, end), plan, ctx, target) : [];
    // 마감 날인데 오늘 분량 밖에 남은 게 있으면 (다른 기기에서 해제 등) 오늘에 붙인다
    if (!days.length && rest.length) todayItems = [...todayItems, ...rest];
  } else {
    const all = allocateDays(remaining, daysBetween(first, end), plan, ctx, target);
    todayItems = first === ctx.today ? all[0].items : [];
    days = first === ctx.today ? all.slice(1) : all;
  }

  const studyDays = (first === ctx.today ? 1 : 0) + days.filter((d) => d.weight > 0).length;
  let warning: Warning | null = null;
  // 실제로 하루에 풀 쪽 수 (과외 날처럼 무게가 작은 날을 늘려 세지 않는다)
  const perDay = Math.max(todayItems.length, ...days.map((d) => d.items.length));
  const max = plan.dailyMax ?? ctx.settings.dailyMax;
  if (studyDays === 0 || (todayItems.length === 0 && days.every((d) => d.weight === 0) && remaining.length > 0)) warning = { kind: 'nodays' };
  else if (max && perDay > max) warning = { kind: 'max', perDay, max };
  else if (plan.baseline > 0 && perDay > Math.ceil(plan.baseline * 1.5)) warning = { kind: 'over', perDay, baseline: plan.baseline };
  return { ...base, today: todayItems, locked: !!lock, days, warning };
}

/**
 * 오늘 분량을 고정한다 (오늘 처음 볼 때). 지난번 분량 중 못 한 것이 있으면 carried 로 남긴다.
 * 이미 오늘 고정돼 있으면 null.
 */
export function lockToday(plan: Plan, target: Target, ctx: PlanCtx): Plan | null {
  if (plan.finished || plan.deleted || plan.todayLock?.date === ctx.today) return null;
  // 아직 시작하지 않은 계획은 고정할 것이 없다 (빈 분량을 고정하면 시작일 전부터 나눠 버린다)
  if (plan.start > ctx.today) return null;
  const s = schedule({ ...plan, todayLock: undefined }, target, ctx);
  if (s.warning?.kind === 'ended') return null;
  const prev = plan.todayLock;
  const missed = prev && prev.date < ctx.today ? prev.items.filter((p) => !target.done.has(p)).length : 0;
  return {
    ...plan,
    todayLock: { date: ctx.today, items: s.today },
    carried: missed > 0 ? { date: ctx.today, count: missed } : plan.carried?.date === ctx.today ? plan.carried : undefined,
  };
}

/** 계획을 처음 만들 때의 하루 평균 (경고 기준) */
export function baselineOf(plan: Omit<Plan, 'baseline'>, target: Target, ctx: PlanCtx): number {
  const items = remainingItems({ ...plan, baseline: 0 } as Plan, target);
  const end = planEnd({ ...plan, baseline: 0 } as Plan, ctx.exams, target.subjectId);
  if (!end || !items.length) return 0;
  const first = plan.start > ctx.today ? plan.start : ctx.today;
  if (end < first) return items.length;
  const w = daysBetween(first, end).reduce((s, d) => s + dayWeight(d, { ...plan, baseline: 0 } as Plan, ctx), 0);
  return w > 0 ? Math.ceil(items.length / w) : items.length;
}

/** 지금까지 계획대로였다면 한 양 vs 실제 (앞섬·밀림) */
export function paceOf(plan: Plan, target: Target, ctx: PlanCtx): number {
  const end = planEnd(plan, ctx.exams, target.subjectId);
  const total = expand(plan.range).length;
  if (!end || plan.start > ctx.today) return 0;
  const dates = daysBetween(plan.start, end);
  const weights = dates.map((d) => dayWeight(d, plan, ctx));
  const W = weights.reduce((a, b) => a + b, 0);
  if (W <= 0) return 0;
  // 어제까지 했어야 할 양
  const past = dates.reduce((s, d, i) => (d < ctx.today ? s + weights[i] : s), 0);
  const expected = Math.round((total * past) / W);
  const done = expand(plan.range).filter((p) => target.done.has(p)).length;
  return done - expected;
}

/** 하루 몫으로 정할 때: 시작일부터 공부하는 날(쉬는 날 빼고)을 days 일 세었을 때의 마지막 날 */
export function paceEnd(start: DateStr, days: number, plan: Plan, ctx: PlanCtx): DateStr {
  let d = start;
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    if (dayWeight(d, plan, ctx) > 0) n++;
    if (n >= Math.max(1, days)) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** 시작일부터 끝날까지 공부하는 날 수 */
export function studyDays(start: DateStr, end: DateStr, plan: Plan, ctx: PlanCtx): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (dayWeight(d, plan, ctx) > 0) n++;
  return n;
}
