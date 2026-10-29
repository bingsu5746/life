// 넣은 슛 합 (경기·연습 기록에서)
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
