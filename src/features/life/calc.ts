// 운동 · 돈 · 취미 계산
import { addDays, daysBetween, weekStart } from '../study/dates';
import { alive, type DateStr, type HobbyLog, type MoneyTx, type SavingGoal, type StudyData, type Workout } from '../study/model';

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
