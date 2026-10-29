// 운동 · 돈 · 취미 계산
import { addDays, daysBetween, weekStart } from '../study/dates';
import { alive, type DateStr, type HobbyLog, type MoneyRule, type MoneyTx, type SavingGoal, type StudyData, type Workout } from '../study/model';

export const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 「12,000」 같은 글 → 숫자 (원). 비었거나 이상하면 null */
export function readWon(s: string): number | null {
  const t = s.replace(/[,\s원]/g, '');
  if (!/^\d{1,10}$/.test(t)) return null;
  return Number(t);
}

/** 그 주(월~일)의 운동 */
export function weekWorkouts(d: StudyData, from: DateStr): Workout[] {
  const to = addDays(from, 6);
  return alive(d.workouts).filter((w) => w.date >= from && w.date <= to);
}

/** 오늘(오늘 안 했으면 어제)까지 연속으로 운동한 날 */
export function workoutStreak(list: Workout[], today: DateStr): number {
  const days = new Set(list.map((w) => w.date));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d) && n < 3650) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** 최근 weeks 주의 주별 운동 시간 (분) */
export function weeklyMinutes(list: { date: DateStr; minutes?: number }[], today: DateStr, weeks: number): { start: DateStr; min: number; count: number }[] {
  const ws = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(ws, -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    const inW = list.filter((w) => w.date >= start && w.date <= end);
    return { start, min: inW.reduce((a, w) => a + (w.minutes ?? 0), 0), count: new Set(inW.map((w) => w.date)).size };
  });
}

/** 'YYYY-MM' */
export const monthOf = (date: DateStr) => date.slice(0, 7);
export function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const monthLabel = (m: string) => `${Number(m.slice(0, 4))}년 ${Number(m.slice(5, 7))}월`;
export function daysInMonth(m: string): number {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export interface MonthSummary {
  out: number;
  in: number;
  byCategory: { category: string; amount: number }[];
  tx: MoneyTx[];
}

export function monthSummary(d: StudyData, month: string): MonthSummary {
  const tx = alive(d.moneyTx)
    .filter((t) => monthOf(t.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const cat = new Map<string, number>();
  let out = 0;
  let inn = 0;
  for (const t of tx) {
    if (t.type === 'out') {
      out += t.amount;
      cat.set(t.category, (cat.get(t.category) ?? 0) + t.amount);
    } else inn += t.amount;
  }
  return { out, in: inn, tx, byCategory: [...cat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount) };
}

/**
 * 예산: 이번 달 남은 돈과, 남은 날 하루에 쓸 수 있는 돈.
 * 지난 달·다음 달을 볼 때는 하루 몫을 계산하지 않는다
 */
export function budgetView(budget: number, spent: number, month: string, today: DateStr): { left: number; perDay: number | null; daysLeft: number } {
  const left = budget - spent;
  if (monthOf(today) !== month) return { left, perDay: null, daysLeft: 0 };
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  return { left, perDay: daysLeft > 0 ? Math.floor(Math.max(0, left) / daysLeft) : null, daysLeft };
}

export const saved = (g: SavingGoal) => g.deposits.reduce((a, x) => a + x.amount, 0);

/** 그 주의 취미별 시간 */
export function hobbyWeek(logs: HobbyLog[], from: DateStr): Map<string, number> {
  const to = addDays(from, 6);
  const m = new Map<string, number>();
  for (const l of logs) if (l.date >= from && l.date <= to) m.set(l.hobbyId, (m.get(l.hobbyId) ?? 0) + (l.minutes ?? 0));
  return m;
}

/** 최근 months 달의 달별 지출 */
export function monthlyOut(d: StudyData, today: DateStr, months: number): { month: string; amount: number }[] {
  const cur = monthOf(today);
  return Array.from({ length: months }, (_, i) => {
    const month = shiftMonth(cur, i - months + 1);
    return { month, amount: monthSummary(d, month).out };
  });
}

export const datesOfWeek = (from: DateStr) => daysBetween(from, addDays(from, 6));

// ===== 고정 지출·수입 =====

/** 규칙이 from~to 사이에 생기는 날들 */
export function ruleDates(r: MoneyRule, from: DateStr, to: DateStr): DateStr[] {
  const a = from > r.start ? from : r.start;
  const b = r.end && r.end < to ? r.end : to;
  if (a > b) return [];
  const out: DateStr[] = [];
  for (const d of daysBetween(a, b)) {
    if (r.freq === 'daily') out.push(d);
    else if (r.freq === 'weekly') {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() === (r.day ?? new Date(`${r.start}T00:00:00Z`).getUTCDay())) out.push(d);
    } else if (r.freq === 'monthly') {
      const want = Math.min(r.day ?? Number(r.start.slice(8, 10)), daysInMonth(d.slice(0, 7)));
      if (Number(d.slice(8, 10)) === want) out.push(d);
    } else {
      // 매년: 시작 날짜의 월·일 (2월 29일은 없는 해에 2월 28일)
      const md = r.start.slice(5);
      const y = d.slice(0, 4);
      const target = md === '02-29' && daysInMonth(`${y}-02`) === 28 ? '02-28' : md;
      if (d.slice(5) === target) out.push(d);
    }
  }
  return out;
}

export const ruleTxId = (ruleId: string, date: DateStr) => `r-${ruleId}-${date}`;

/** 자동으로 넣을 기록: 최근 90일 안에서 아직 없는 것 (지운 것도 다시 만들지 않는다: 같은 id) */
export function dueRuleTx(d: StudyData, today: DateStr, now = Date.now()): MoneyTx[] {
  const out: MoneyTx[] = [];
  const from = addDays(today, -90);
  for (const r of alive(d.moneyRules)) {
    if (r.paused) continue;
    for (const date of ruleDates(r, from, today)) {
      const id = ruleTxId(r.id, date);
      if (d.moneyTx[id]) continue;
      out.push({ id, updatedAt: 0, date, type: r.type, amount: r.amount, category: r.category, memo: r.name, ruleId: r.id, created: now });
    }
  }
  return out;
}

/** 앞으로 days 일 안의 고정 지출·수입 */
export function upcomingRules(d: StudyData, today: DateStr, days = 30): { date: DateStr; rule: MoneyRule }[] {
  const out: { date: DateStr; rule: MoneyRule }[] = [];
  for (const r of alive(d.moneyRules)) if (!r.paused) for (const date of ruleDates(r, addDays(today, 1), addDays(today, days))) out.push({ date, rule: r });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 한 달로 치면 얼마 (매일 ×30, 매주 ×52/12, 매년 ÷12 — 어림값) */
export function monthlyAmount(r: MoneyRule): number {
  return r.freq === 'daily' ? r.amount * 30 : r.freq === 'weekly' ? Math.round((r.amount * 52) / 12) : r.freq === 'yearly' ? Math.round(r.amount / 12) : r.amount;
}

export interface MonthCompare {
  /** 비교 대상 (지난달) 쓴 돈. 이번 달이 진행 중이면 지난달 같은 날까지 */
  prevOut: number;
  diff: number;
  /** 분류별 차이 (양수면 더 씀), 차이가 큰 순 */
  byCategory: { category: string; diff: number }[];
  partial: boolean;
}

/** 지난달과 비교. month 가 오늘이 든 달이면 지난달 같은 날(일)까지만 견준다 */
export function compareMonths(d: StudyData, month: string, today: DateStr): MonthCompare | null {
  const prevMonth = shiftMonth(month, -1);
  const partial = month === monthOf(today);
  const upto = partial ? Number(today.slice(8)) : 31;
  const prev = alive(d.moneyTx).filter((t) => t.type === 'out' && monthOf(t.date) === prevMonth && Number(t.date.slice(8)) <= upto);
  if (!prev.length) return null;
  const cur = monthSummary(d, month);
  const p = new Map<string, number>();
  for (const t of prev) p.set(t.category, (p.get(t.category) ?? 0) + t.amount);
  const prevOut = prev.reduce((a, t) => a + t.amount, 0);
  const cats = new Set([...p.keys(), ...cur.byCategory.map((c) => c.category)]);
  const byCategory = [...cats].map((category) => ({ category, diff: (cur.byCategory.find((c) => c.category === category)?.amount ?? 0) - (p.get(category) ?? 0) })).filter((c) => c.diff !== 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return { prevOut, diff: cur.out - prevOut, byCategory, partial };
}

/** date 가 든 주(월~일)에 date 까지 쓴 돈 */
export function weekSpent(d: Pick<StudyData, 'moneyTx'>, date: DateStr): number {
  const from = weekStart(date);
  return alive(d.moneyTx)
    .filter((t) => t.type === 'out' && t.date >= from && t.date <= date)
    .reduce((a, t) => a + t.amount, 0);
}

export interface SavingPace {
  left: number;
  /** 최근 8주 동안 한 주에 평균 모은 돈 */
  perWeek: number;
  /** 지금 속도로 다 모으는 날 (속도가 0 이면 null) */
  eta: DateStr | null;
  /** 마감까지 맞추려면 한 주에 필요한 돈 (마감이 없거나 지났으면 null) */
  needPerWeek: number | null;
  /** 한 주에 extra 원 더 모으면 며칠 당겨지는지 */
  faster: { extra: number; days: number }[];
}

/** 모으기 목표: 지금 속도 · 끝나는 날 · 더 모으면 얼마나 당겨지는지 */
export function savingPace(g: { target: number; deposits: { date: DateStr; amount: number }[]; due?: DateStr }, today: DateStr): SavingPace {
  const have = g.deposits.reduce((a, x) => a + x.amount, 0);
  const left = Math.max(0, g.target - have);
  const from = addDays(today, -55);
  const recent = g.deposits.filter((x) => x.date >= from && x.date <= today).reduce((a, x) => a + x.amount, 0);
  const first = g.deposits.map((x) => x.date).sort()[0];
  // 시작한 지 8주가 안 됐으면 시작한 날부터의 주 수로
  const weeks = first && first > from ? Math.max(1, (Date.parse(today) - Date.parse(first)) / (7 * 86_400_000)) : 8;
  const perWeek = Math.max(0, Math.round(recent / weeks));
  const etaIn = (pw: number) => (pw > 0 ? Math.ceil((left / pw) * 7) : null);
  const days = etaIn(perWeek);
  const eta = left === 0 ? today : days === null ? null : addDays(today, days);
  const weeksToDue = g.due && g.due > today ? (Date.parse(g.due) - Date.parse(today)) / (7 * 86_400_000) : null;
  const faster = days === null || left === 0 ? [] : [5000, 10000].map((extra) => ({ extra, days: days - (etaIn(perWeek + extra) ?? days) })).filter((x) => x.days > 0);
  return { left, perWeek, eta, needPerWeek: weeksToDue ? Math.ceil(left / weeksToDue / 100) * 100 : null, faster };
}
