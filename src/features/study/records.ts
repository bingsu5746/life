// 개인 신기록: 오늘(또는 방금) 기록이 그전까지의 최고를 넘었는지. 기록이 조금 쌓인 뒤부터만 (처음 며칠은 모든 게 신기록이라)
import { addDays, diffDays } from './dates';
import { alive, type DateStr, type StudyData } from './model';

export interface NewRecord {
  /** 같은 신기록을 두 번 축하하지 않게: 종류:값 */
  key: string;
  label: string;
  value: string;
  prev: string;
}

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

/** 오늘 생긴 신기록들 */
export function newRecords(d: StudyData, today: DateStr): NewRecord[] {
  const out: NewRecord[] = [];
  const ses = alive(d.sessions);
  // 하루 공부 시간 (공부한 날이 5일 넘게 있어야)
  const byDay = new Map<DateStr, number>();
  for (const s of ses) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.minutes);
  const before = [...byDay].filter(([k]) => k < today);
  const t = byDay.get(today) ?? 0;
  if (before.length >= 5 && t >= 30) {
    const best = Math.max(...before.map(([, v]) => v));
    if (t > best) out.push({ key: `study-day:${today}`, label: '하루 공부 시간 최고', value: hm(t), prev: hm(best) });
  }
  // 한 번에 가장 길게 (기록이 10번 넘게 있어야)
  const todays = ses.filter((s) => s.date === today);
  const old = ses.filter((s) => s.date < today);
  if (old.length >= 10 && todays.length) {
    const best = Math.max(...old.map((s) => s.minutes));
    const top = Math.max(...todays.map((s) => s.minutes));
    if (top > best && top >= 30) out.push({ key: `study-one:${today}`, label: '한 번에 가장 길게 공부', value: hm(top), prev: hm(best) });
  }
  // 이어서 공부한 날 (지금 이어지는 날이 지난 최고를 넘으면)
  const days = [...byDay.keys()].sort();
  let run = 0;
  for (let i = 0; ; i++) {
    if (byDay.has(addDays(today, -i))) run++;
    else break;
  }
  if (run >= 3) {
    let best = 0;
    let cur = 0;
    for (let i = 0; i < days.length; i++) {
      if (days[i] > addDays(today, -run)) break;
      cur = i && diffDays(days[i - 1], days[i]) === 1 ? cur + 1 : 1;
      best = Math.max(best, cur);
    }
    if (run > best && best >= 2) out.push({ key: `streak:${run}`, label: '가장 길게 이어서 공부', value: `${run}일`, prev: `${best}일` });
  }
  // 운동: 가장 긴 운동 · 가장 먼 거리 · 농구 최고 득점 (그전 기록이 3번 넘게 있어야)
  const wk = alive(d.workouts);
  const wOld = wk.filter((w) => w.date < today);
  const wNow = wk.filter((w) => w.date === today);
  const check = (key: string, label: string, f: (w: (typeof wk)[number]) => number | undefined, fmt: (n: number) => string) => {
    const olds = wOld.map(f).filter((x): x is number => typeof x === 'number' && x > 0);
    const nows = wNow.map(f).filter((x): x is number => typeof x === 'number' && x > 0);
    if (olds.length < 3 || !nows.length) return;
    const best = Math.max(...olds);
    const top = Math.max(...nows);
    if (top > best) out.push({ key: `${key}:${today}`, label, value: fmt(top), prev: fmt(best) });
  };
  check('wk-min', '가장 긴 운동', (w) => w.minutes, hm);
  check('wk-dist', '가장 먼 거리', (w) => w.distance, (n) => `${Math.round(n * 10) / 10}km`);
  check('bb-pts', '농구 한 경기 최고 득점', (w) => (w.bb?.mode === 'game' ? w.bb.pts : undefined), (n) => `${n}점`);
  return out;
}
