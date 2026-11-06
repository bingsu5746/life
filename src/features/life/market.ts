// 시장: 공부 · 습관 · 할 일 · 오답 해결로 모은 포인트 (기록에서 계산) − 산 보상 = 남은 포인트
import { addDays } from '../study/dates';
import { alive, type DateStr, type MarketSettings, type StudyData } from '../study/model';

export const DEFAULT_RATE: MarketSettings['rate'] = { study10: 1, habit: 2, todo: 1, note: 3 };
export const newMarket = (today: DateStr): MarketSettings => ({ rate: DEFAULT_RATE, since: today, items: [], buys: [] });
const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

export interface DayPoints {
  date: DateStr;
  study: number;
  habit: number;
  todo: number;
  note: number;
  total: number;
}

/** 날마다 번 포인트 (since 부터 today 까지, 번 날만) */
export function earnedByDay(d: Pick<StudyData, 'sessions' | 'habits' | 'todos' | 'notes'>, m: MarketSettings, today: DateStr): DayPoints[] {
  const map = new Map<DateStr, DayPoints>();
  const at = (date: DateStr) => {
    let x = map.get(date);
    if (!x) map.set(date, (x = { date, study: 0, habit: 0, todo: 0, note: 0, total: 0 }));
    return x;
  };
  const ok = (date: DateStr) => date >= m.since && date <= today;
  // 공부: 그날 공부한 분을 10분 단위로
  const mins = new Map<DateStr, number>();
  for (const s of alive(d.sessions)) if (ok(s.date) && s.minutes > 0) mins.set(s.date, (mins.get(s.date) ?? 0) + s.minutes);
  for (const [date, v] of mins) at(date).study = Math.floor(v / 10) * m.rate.study10;
  for (const h of alive(d.habits)) for (const c of h.checks) if (ok(c)) at(c).habit += m.rate.habit;
  for (const t of alive(d.todos)) if (t.done && t.doneAt && ok(kst(t.doneAt))) at(kst(t.doneAt)).todo += m.rate.todo;
  for (const n of alive(d.notes)) if (n.learned && ok(kst(n.updatedAt))) at(kst(n.updatedAt)).note += m.rate.note;
  for (const x of map.values()) x.total = x.study + x.habit + x.todo + x.note;
  return [...map.values()].filter((x) => x.total > 0).sort((a, b) => b.date.localeCompare(a.date));
}

export function wallet(d: Pick<StudyData, 'sessions' | 'habits' | 'todos' | 'notes'>, m: MarketSettings, today: DateStr) {
  const days = earnedByDay(d, m, today);
  const earned = days.reduce((a, x) => a + x.total, 0);
  const spent = m.buys.reduce((a, b) => a + b.price, 0);
  const todayPts = days.find((x) => x.date === today)?.total ?? 0;
  const week = days.filter((x) => x.date > addDays(today, -7)).reduce((a, x) => a + x.total, 0);
  return { earned, spent, balance: earned - spent, today: todayPts, week, days };
}

export const ITEM_IDEAS: { name: string; icon: string; price: number }[] = [
  { name: '게임 30분', icon: '🎮', price: 30 },
  { name: '유튜브 30분', icon: '📺', price: 30 },
  { name: '좋아하는 간식', icon: '🍩', price: 50 },
  { name: '늦잠 1시간', icon: '😴', price: 80 },
  { name: '영화 한 편', icon: '🎬', price: 120 },
];
