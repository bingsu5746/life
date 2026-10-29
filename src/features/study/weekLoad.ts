// 이번 주 할 양: 문제집 계획들을 합쳐 앞으로 7일 날마다 몇 쪽인지, 몰린 날 찾기
import { addDays } from './dates';
import type { DateStr } from './model';

export interface LoadPlan {
  name: string;
  today: number[];
  days: { date: DateStr; items: number[] }[];
}
export interface LoadDay {
  date: DateStr;
  total: number;
  parts: { name: string; n: number }[];
  /** 다른 날보다 많이 몰린 날 */
  heavy: boolean;
}

export function weekLoad(plans: LoadPlan[], today: DateStr): LoadDay[] {
  const out: LoadDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const parts = plans.map((p) => ({ name: p.name, n: i === 0 ? p.today.length : (p.days.find((x) => x.date === date)?.items.length ?? 0) })).filter((x) => x.n > 0);
    out.push({ date, total: parts.reduce((a, x) => a + x.n, 0), parts, heavy: false });
  }
  const busy = out.filter((x) => x.total > 0);
  if (busy.length >= 2) {
    const avg = busy.reduce((a, x) => a + x.total, 0) / busy.length;
    for (const x of out) x.heavy = x.total >= avg * 1.4 && x.total - avg >= 5;
  }
  return out;
}
