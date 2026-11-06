import { describe, expect, it } from 'vitest';
import { grade, parseAnswers, parsePoints } from './gradeCheck';
import { emptyStudy, type GradeRecord } from './model';
import { latestMock, schoolAverage, univGap } from './univ';
import { sanitizeSettings } from './sanitize';

describe('채점', () => {
  it('답 읽기', () => {
    expect(parseAnswers('13524')).toEqual(['1', '3', '5', '2', '4']);
    expect(parseAnswers('1 3, 12\n4')).toEqual(['1', '3', '12', '4']);
    expect(parseAnswers('1-3')).toEqual(['1', '', '3']);
    expect(parseAnswers('  ')).toEqual([]);
  });
  it('배점 읽기', () => {
    expect(parsePoints('2 3 4', 5)).toEqual([2, 3, 4, 4, 4]);
    expect(parsePoints('', 5)).toBeNull();
  });
  it('같은 배점', () => {
    const r = grade(['1', '2', '3', '4'], ['1', '3', '', '4'], null, 100);
    expect(r).toMatchObject({ n: 4, right: 2, wrong: [2, 3], blank: [3], score: 50, full: 100 });
  });
  it('배점 · 주관식 앞의 0', () => {
    const r = grade(['1', '2', '12'], ['1', '5', '012'], [2, 3, 4]);
    expect(r).toMatchObject({ right: 2, wrong: [2], score: 6, full: 9 });
  });
});

describe('목표 대학', () => {
  const rec = (id: string, kind: 'school' | 'mock', date: string, scores: GradeRecord['scores']): GradeRecord => ({ id, updatedAt: 1, kind, name: id, date, scores });
  const d = emptyStudy();
  d.grades = {
    a: rec('1학기 중간', 'school', '2026-04-20', [
      { id: 'x', subject: '국어', grade: 2 },
      { id: 'y', subject: '수학', grade: 3 },
    ]),
    b: rec('6월 모의고사', 'mock', '2026-06-04', [{ id: 'z', subject: '수학', grade: 3, percentile: 85 }]),
    c: rec('9월 모의고사', 'mock', '2026-09-03', [{ id: 'w', subject: '수학', grade: 2, percentile: 91 }]),
  };
  it('지금 내신 평균 (단순 평균)', () => {
    expect(schoolAverage(d)).toEqual({ avg: 2.5, count: 2, records: 1 });
    expect(schoolAverage(emptyStudy())).toBeNull();
  });
  it('모의고사는 가장 최근 것', () => {
    expect(latestMock(d, '수학')).toMatchObject({ grade: 2, percentile: 91, name: '9월 모의고사' });
    expect(latestMock(d, '영어')).toBeNull();
  });
  it('차이', () => {
    const g = univGap(d, { id: 'g', univ: '○○대', school: 2, mock: { 수학: { grade: 1, percentile: 90 }, 영어: { grade: 2 } } });
    expect(g.school).toEqual({ goal: 2, now: 2.5, gap: 0.5, ok: false });
    expect(g.mock[0]).toMatchObject({ subject: '수학', grade: { goal: 1, now: 2, gap: 1, ok: false }, percentile: { goal: 90, now: 91, gap: 1, ok: true } });
    expect(g.mock[1].grade).toEqual({ goal: 2, now: null, gap: null, ok: false });
  });
  it('설정에 저장 (이상한 값은 버림)', () => {
    const s = sanitizeSettings({ univGoals: [{ id: 'g', univ: ' ○○대 ', major: '컴퓨터', school: 2.3, mock: { 수학: { grade: 12, percentile: 90 } } }, { univ: '' }] });
    expect(s.univGoals).toEqual([{ id: 'g', univ: '○○대', major: '컴퓨터', school: 2.3, mock: { 수학: { grade: undefined, percentile: 90 } }, memo: undefined }]);
  });
});
