// 넣은 슛 합 (경기·연습 기록에서)
import { addDays, weekStart } from '../study/dates';
import { alive, type DateStr, type StudyData, type Workout } from '../study/model';

export interface ShotLine {
  m: number;
  a: number;
}
export interface ShotSum {
  fg: ShotLine;
  tp: ShotLine;
  ft: ShotLine;
}

/** from~to (포함) 동안 적은 슛 (경기·연습 모두) */
export function shotsBetween(d: Pick<StudyData, 'workouts'>, from: DateStr, to: DateStr): ShotSum {
  const out: ShotSum = { fg: { m: 0, a: 0 }, tp: { m: 0, a: 0 }, ft: { m: 0, a: 0 } };
  for (const w of alive(d.workouts)) {
    if (w.kind !== '농구' || !w.bb || w.date < from || w.date > to) continue;
    add(out, w.bb);
  }
  return out;
}

function add(out: ShotSum, b: NonNullable<Workout['bb']>) {
  out.fg.m += b.fgm ?? 0;
  out.fg.a += b.fga ?? 0;
  out.tp.m += b.tpm ?? 0;
  out.tp.a += b.tpa ?? 0;
  out.ft.m += b.ftm ?? 0;
  out.ft.a += b.fta ?? 0;
}

/** 코트별 슛 (from~to). 코트를 적은 기록만, 많이 간 순 */
export function shotsByCourt(d: Pick<StudyData, 'workouts'>, from: DateStr, to: DateStr): { court: string; times: number; s: ShotSum }[] {
  const m = new Map<string, { court: string; times: number; s: ShotSum }>();
  for (const w of alive(d.workouts)) {
    const c = w.bb?.court?.trim();
    if (w.kind !== '농구' || !w.bb || !c || w.date < from || w.date > to) continue;
    const e = m.get(c) ?? { court: c, times: 0, s: { fg: { m: 0, a: 0 }, tp: { m: 0, a: 0 }, ft: { m: 0, a: 0 } } };
    e.times++;
    add(e.s, w.bb);
    m.set(c, e);
  }
  return [...m.values()].sort((a, b) => b.times - a.times);
}

/** 적어 둔 코트 이름 (최근 순, 겹침 없이) */
export function courtNames(d: Pick<StudyData, 'workouts'>): string[] {
  const list = alive(d.workouts)
    .filter((w) => w.bb?.court)
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...new Set(list.map((w) => w.bb!.court!))].slice(0, 20);
}

/** 연습 항목(이름)별 주마다 넣은 수/던진 수 (최근 weeks 주, 오래된 주부터) */
export function itemTrend(d: Pick<StudyData, 'workouts'>, name: string, today: DateStr, weeks = 8): { start: DateStr; m: number; a: number }[] {
  const key = name.trim().toLowerCase();
  const ws = weekStart(today);
  const out = Array.from({ length: weeks }, (_, i) => ({ start: addDays(ws, -7 * (weeks - 1 - i)), m: 0, a: 0 }));
  for (const w of alive(d.workouts)) {
    if (w.kind !== '농구' || !w.bb?.items || w.date > today) continue;
    const row = out.find((x) => w.date >= x.start && w.date <= addDays(x.start, 6));
    if (!row) continue;
    for (const it of w.bb.items)
      if (it.name.trim().toLowerCase() === key && it.att) {
        row.m += it.made ?? 0;
        row.a += it.att;
      }
  }
  return out;
}

/** 던진 수를 적은 연습 항목 이름 (많이 한 순) */
export function trackedItems(d: Pick<StudyData, 'workouts'>): string[] {
  const n = new Map<string, number>();
  for (const w of alive(d.workouts)) for (const it of w.bb?.items ?? []) if (it.att) n.set(it.name.trim(), (n.get(it.name.trim()) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
