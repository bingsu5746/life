import { describe, expect, it } from 'vitest';
import { examDates, examEnd, examSubjectIds, scopeDate, subjectExamDate, timetable } from './exams';
import { change, changeText, readNum, recordAverage, series, subjectNames } from './grades';
import { compare, daily, minutesByDate, studyStreak, weekdayAverage, weekly } from './timeStats';
import { splitWordLine } from './wordParse';
import { cleanWord, highlightRatio, isHighlight, pickHighlighted } from '../../lib/highlight';
import type { Exam, GradeRecord, StudySession } from './model';
import { mergeStudy } from './merge';
import { emptyStudy } from './model';
import { sanitizeCollections } from './sanitize';

const exam: Exam = {
  id: 'e',
  updatedAt: 1,
  name: '기말',
  date: '2026-12-01',
  end: '2026-12-04',
  days: [
    { date: '2026-12-01', subjectIds: ['kor', 'math'] },
    { date: '2026-12-03', subjectIds: ['eng'] },
  ],
  scopes: [{ id: 's', subjectId: 'eng', date: '2026-12-01', lines: [] }],
};

describe('여러 날 시험', () => {
  it('기간·시간표·과목 날짜', () => {
    expect(examDates(exam)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04']);
    expect(timetable(exam).map((d) => d.subjectIds.length)).toEqual([2, 0, 1, 0]);
    // 시간표가 범위에 따로 적은 날보다 앞선다
    expect(scopeDate(exam, exam.scopes![0])).toBe('2026-12-03');
    expect(subjectExamDate(exam, 'math')).toBe('2026-12-01');
    expect(subjectExamDate(exam, 'sci')).toBe('2026-12-01');
    expect(examEnd(exam)).toBe('2026-12-04');
    expect(examSubjectIds(exam)).toEqual(['kor', 'math', 'eng']);
    expect(examEnd({ ...exam, end: undefined, days: [] , scopes: []})).toBe('2026-12-01');
  });
  it('잘못된 긴 기간은 31일까지만', () => {
    expect(examDates({ ...exam, end: '2030-01-01' }).length).toBe(31);
  });
  it('두 기기에서 시간표의 다른 날을 고치면 둘 다 남는다', () => {
    const a = { ...emptyStudy(), exams: { e: { ...exam, updatedAt: 5, days: [{ date: '2026-12-01', subjectIds: ['kor'], at: 5 }, { date: '2026-12-03', subjectIds: ['eng'], at: 1 }] } } };
    const b = { ...emptyStudy(), exams: { e: { ...exam, updatedAt: 4, days: [{ date: '2026-12-01', subjectIds: ['kor', 'math'], at: 1 }, { date: '2026-12-03', subjectIds: ['eng', 'sci'], at: 4 }] } } };
    const m = mergeStudy(a, b, 10).exams.e;
    expect(m.days).toEqual([{ date: '2026-12-01', subjectIds: ['kor'], at: 5 }, { date: '2026-12-03', subjectIds: ['eng', 'sci'], at: 4 }]);
  });
  it('다듬기: 이상한 시간표·성적 칸은 버린다', () => {
    const c = sanitizeCollections({
      exams: { e: { ...exam, end: 'x', days: [{ date: 'bad' }, { date: '2026-12-01', subjectIds: ['a', 3] }] } } as never,
      grades: { g: { id: 'g', updatedAt: 1, kind: 'zzz', name: 'a', date: '2026-07-01', scopes: 1, scores: [{ id: 'x', subject: '수학', raw: 120.5, grade: 12, percentile: 101 }, { id: 'y' }] } } as never,
    });
    const e = c.exams.e as Exam;
    expect(e.end).toBeUndefined();
    expect(e.days).toEqual([{ date: '2026-12-01', subjectIds: ['a'], at: undefined }]);
    const g = c.grades.g as GradeRecord;
    expect(g.kind).toBe('school');
    expect(g.scores).toHaveLength(1);
    expect(g.scores[0]).toMatchObject({ raw: 120.5, grade: undefined, percentile: undefined });
  });
});

describe('성적', () => {
  const r = (id: string, date: string, scores: [string, number | undefined, number | undefined][]): GradeRecord => ({
    id,
    updatedAt: 1,
    kind: 'mock',
    name: id,
    date,
    scores: scores.map(([subject, raw, grade], i) => ({ id: id + i, subject, raw, grade })),
  });
  const recs = [r('3월', '2026-03-26', [['국어', 80, 3], ['수학', 70, 4]]), r('6월', '2026-06-04', [['국어', 88, 2], [' 수 학 ', 66, undefined]])];
  it('과목 이름 맞추기·흐름·평균', () => {
    expect(subjectNames(recs)).toEqual(['국어', '수학']);
    expect(series(recs, '수학', 'raw')).toEqual([70, 66]);
    expect(series(recs, '수학', 'grade')).toEqual([4, null]);
    expect(recordAverage(recs[0], 'grade')).toBe(3.5);
  });
  it('좋아졌는지 (등급은 작을수록)', () => {
    expect(change(3, 2, 'grade')).toEqual({ diff: -1, better: true });
    expect(change(80, 88, 'raw')).toEqual({ diff: 8, better: true });
    expect(changeText(change(3, 2, 'grade'), 'grade')).toBe('1등급 올랐어요');
    expect(changeText(change(80, 70, 'raw'), 'raw')).toBe('10점 내려갔어요');
    expect(change(null, 2, 'grade')).toBeNull();
  });
  it('숫자 칸', () => {
    expect(readNum(' 87,5', 0, 100)).toBe(87.5);
    expect(readNum('10', 1, 9)).toBeUndefined();
    expect(readNum('', 1, 9)).toBeUndefined();
  });
});

describe('공부 시간 분석', () => {
  const s = (date: string, minutes: number, subjectId?: string): StudySession => ({ id: date + minutes, updatedAt: 1, date, minutes, start: 0, end: 0, kind: 'manual', subjectId });
  const by = minutesByDate([s('2026-10-25', 60), s('2026-10-25', 30), s('2026-10-24', 120), s('2026-10-20', 10), s('2026-10-13', 40)]);
  it('날짜별·주별·요일별·비교·연속', () => {
    expect(daily(by, '2026-10-25', 3)).toEqual([{ date: '2026-10-23', min: 0 }, { date: '2026-10-24', min: 120 }, { date: '2026-10-25', min: 90 }]);
    // 2026-10-25 는 일요일 → 그 주 월요일 10-19
    expect(weekly(by, '2026-10-25', 2)).toEqual([{ start: '2026-10-12', min: 40 }, { start: '2026-10-19', min: 220 }]);
    expect(weekdayAverage(by, '2026-10-25', 7)).toEqual([0, 10, 0, 0, 0, 120, 90]);
    expect(compare(by, '2026-10-25', 7)).toEqual({ now: 220, before: 40, pct: 450 });
    expect(studyStreak(by, '2026-10-25')).toBe(2);
    expect(studyStreak(by, '2026-10-26')).toBe(2);
  });
});

describe('형광펜 단어', () => {
  it('색 판단', () => {
    expect(isHighlight(255, 240, 80)).toBe(true); // 노랑
    expect(isHighlight(150, 240, 140)).toBe(true); // 연두
    expect(isHighlight(250, 250, 248)).toBe(false); // 흰 종이
    expect(isHighlight(30, 30, 30)).toBe(false); // 글자
  });
  it('네모 안 비율 (글자 칸은 빼고)', () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const yellow = i % w < 5;
      data.set(i % 3 === 0 ? [0, 0, 0, 255] : yellow ? [255, 240, 80, 255] : [255, 255, 255, 255], i * 4);
    }
    const r = highlightRatio(data, w, h, { x0: 0, y0: 0, x1: 9, y1: 9 });
    expect(r).toBeGreaterThan(0.4);
    expect(r).toBeLessThan(0.6);
    expect(highlightRatio(data, w, h, { x0: 0, y0: 0, x1: 4, y1: 9 })).toBe(1);
  });
  it('단어 고르기: 이어 칠한 것은 숙어로, 겹친 것은 하나로', () => {
    expect(cleanWord('“Resilience,')).toBe('Resilience');
    expect(cleanWord('12')).toBe('');
    const lines = [
      [{ text: 'They', ratio: 0 }, { text: 'took', ratio: 0.9 }, { text: 'part', ratio: 0.8 }, { text: 'in', ratio: 0.7 }, { text: 'it.', ratio: 0 }],
      [{ text: 'Resilience', ratio: 0.9 }, { text: 'is', ratio: 0.1 }, { text: 'resilience', ratio: 0.9 }, { text: '—', ratio: 0.9 }],
    ];
    expect(pickHighlighted(lines)).toEqual(['took part in', 'resilience']);
  });
});

describe('붙여넣기 형식 더', () => {
  it('쉼표·CSV 따옴표', () => {
    expect(splitWordLine('abandon, 버리다')).toEqual({ term: 'abandon', meaning: '버리다' });
    expect(splitWordLine('"give up","포기하다"')).toEqual({ term: 'give up', meaning: '포기하다' });
    expect(splitWordLine('in spite of, ~에도 불구하고')?.term).toBe('in spite of');
  });
});
