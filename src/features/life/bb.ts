// 넣은 슛 합 (경기·연습 기록에서)
import { alive, type DateStr, type StudyData } from '../study/model';

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
    out.fg.m += w.bb.fgm ?? 0;
    out.fg.a += w.bb.fga ?? 0;
    out.tp.m += w.bb.tpm ?? 0;
    out.tp.a += w.bb.tpa ?? 0;
    out.ft.m += w.bb.ftm ?? 0;
    out.ft.a += w.bb.fta ?? 0;
  }
  return out;
}
