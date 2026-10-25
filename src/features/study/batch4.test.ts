import { describe, expect, it } from 'vitest';
import { notesFromPaper, numberFrequency, paperTitle, percent } from './papers';
import { emptyStudy, type PastPaper, type WrongNote } from './model';
import { mergeStudy } from './merge';
import { sanitizeCollections } from './sanitize';

const paper: PastPaper = { id: 'p', updatedAt: 1, subjectId: 'm', kind: 'kice', title: '2025학년도 6월 모의평가', date: '2026-10-20', score: 84, full: 100, wrong: [21, 29, 30], created: 1 };

describe('기출·모의고사 풀이', () => {
  it('이름 짓기', () => {
    expect(paperTitle('csat', '2025', '')).toBe('2025학년도 수능');
    expect(paperTitle('kice', '2025', '6')).toBe('2025학년도 6월 모의평가');
    expect(paperTitle('edu', '2024', '3')).toBe('2024년 3월 학력평가');
    expect(paperTitle('other', '', '')).toBe('');
  });
  it('점수 비율·번호 횟수', () => {
    expect(percent({ ...paper, score: 42, full: 50 })).toBe(84);
    expect(percent({ ...paper, score: undefined })).toBeNull();
    const f = numberFrequency([[21, 30], [21, 21], [15]]);
    expect(f.counts.get(21)).toBe(2);
    expect(f.max).toBe(30);
  });
  it('틀린 번호 → 오답 노트 (이미 넣은 번호는 빼고)', () => {
    const d = emptyStudy();
    const first = notesFromPaper(d, paper, '2026-10-25', 100);
    expect(first.map((n) => n.number)).toEqual(['21', '29', '30']);
    expect(first[0]).toMatchObject({ paperId: 'p', subjectId: 'm', box: 1, due: '2026-10-26' });
    d.notes[first[0].id] = { ...first[0], updatedAt: 1 };
    expect(notesFromPaper(d, paper, '2026-10-25').map((n) => n.number)).toEqual(['29', '30']);
  });
  it('다듬기', () => {
    const c = sanitizeCollections({ papers: { p: { ...paper, kind: 'x', grade: 0, minutes: 9999, wrong: [3, 'a', 500] }, q: { id: 'q', updatedAt: 1, date: 'no' } } as never });
    expect(Object.keys(c.papers)).toEqual(['p']);
    expect(c.papers.p).toMatchObject({ kind: 'other', grade: undefined, minutes: undefined, wrong: [3] });
  });
});

describe('오답 한마디', () => {
  const note = (updatedAt: number, comments: WrongNote['comments']): WrongNote => ({ id: 'n', updatedAt, subjectId: 'm', question: '', photos: [], myAnswer: '', answer: '', reason: null, memo: '', created: 1, box: 1, due: '2026-10-26', wrong: 1, comments });
  it('두 기기에서 따로 남긴 한마디가 모두 남는다', () => {
    const a = emptyStudy();
    const b = emptyStudy();
    a.notes.n = note(10, [{ id: 'x', date: '2026-10-25', text: '부호 조심', at: 10 }]);
    b.notes.n = note(9, [{ id: 'y', date: '2026-10-25', text: '조건 다시 읽기', at: 12 }]);
    expect(mergeStudy(a, b, 20).notes.n.comments?.map((c) => c.id)).toEqual(['x', 'y']);
  });
  it('다듬기: 모양이 틀린 한마디는 버린다', () => {
    const c = sanitizeCollections({ notes: { n: { ...note(1, undefined), comments: [{ id: 'a', date: '2026-10-25', text: 'ok' }, { id: 'b', date: 'x', text: 'no' }, 3] } } as never });
    expect((c.notes.n as WrongNote).comments).toEqual([{ id: 'a', date: '2026-10-25', text: 'ok', at: undefined }]);
  });
});
