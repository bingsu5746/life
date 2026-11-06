// 목표 대학 · 학과: 직접 넣은 목표(내신 평균 등급 · 모의고사 과목별 등급 · 백분위)와 지금 성적의 차이
// 대학별 합격선 자료는 넣지 않는다 (확인된 자료가 없어서). 목표는 본인이 입시 자료를 보고 넣는다.
import { findScore, recordsOf } from './grades';
import type { StudyData, UnivGoal } from './model';

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 지금 내신 평균 등급: 내신 성적에 넣은 모든 과목 등급의 단순 평균 (단위 수는 반영하지 않음). 없으면 null */
export function schoolAverage(d: Pick<StudyData, 'grades'>): { avg: number; count: number; records: number } | null {
  const recs = recordsOf(d as StudyData, 'school');
  const gs = recs.flatMap((r) => r.scores.map((s) => s.grade).filter((g): g is number => typeof g === 'number'));
  if (!gs.length) return null;
  return { avg: r2(gs.reduce((a, b) => a + b, 0) / gs.length), count: gs.length, records: recs.filter((r) => r.scores.some((s) => typeof s.grade === 'number')).length };
}

/** 모의고사 한 과목의 가장 최근 값 (등급 · 백분위 중 있는 것, 그 성적 이름과 날짜) */
export function latestMock(d: Pick<StudyData, 'grades'>, subject: string): { grade?: number; percentile?: number; name: string; date: string } | null {
  const recs = recordsOf(d as StudyData, 'mock');
  for (let i = recs.length - 1; i >= 0; i--) {
    const s = findScore(recs[i], subject);
    if (s && (s.grade !== undefined || s.percentile !== undefined)) return { grade: s.grade, percentile: s.percentile, name: recs[i].name, date: recs[i].date };
  }
  return null;
}

export interface GapRow {
  subject: string;
  /** 목표 · 지금 · 차이 (등급은 지금 − 목표: 0 이하면 달성, 백분위는 지금 − 목표: 0 이상이면 달성) */
  grade?: { goal: number; now: number | null; gap: number | null; ok: boolean };
  percentile?: { goal: number; now: number | null; gap: number | null; ok: boolean };
  from?: string;
}

/** 목표 하나와 지금 성적 비교 */
export function univGap(d: Pick<StudyData, 'grades'>, g: UnivGoal): { school?: { goal: number; now: number | null; gap: number | null; ok: boolean }; mock: GapRow[] } {
  const sa = schoolAverage(d);
  const school =
    g.school !== undefined
      ? { goal: g.school, now: sa?.avg ?? null, gap: sa ? r2(sa.avg - g.school) : null, ok: !!sa && sa.avg <= g.school }
      : undefined;
  const mock = Object.entries(g.mock ?? {})
    .filter(([, v]) => v.grade !== undefined || v.percentile !== undefined)
    .map(([subject, v]): GapRow => {
      const now = latestMock(d, subject);
      const row: GapRow = { subject, from: now ? now.name : undefined };
      if (v.grade !== undefined) {
        const n = now?.grade ?? null;
        row.grade = { goal: v.grade, now: n, gap: n === null ? null : n - v.grade, ok: n !== null && n <= v.grade };
      }
      if (v.percentile !== undefined) {
        const n = now?.percentile ?? null;
        row.percentile = { goal: v.percentile, now: n, gap: n === null ? null : r2(n - v.percentile), ok: n !== null && n >= v.percentile };
      }
      return row;
    });
  return { school, mock };
}
