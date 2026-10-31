import { describe, expect, it } from 'vitest';
import { emptyStudy } from '../study/model';
import { recap, recapLines } from './recap';

describe('한 해 결산', () => {
  it('그해 기록만 센다', () => {
    const d = emptyStudy();
    d.subjects = { ma: { id: 'ma', name: '수학', color: '#000', order: 1, updatedAt: 1 } } as never;
    d.sessions = { a: { id: 'a', date: '2026-03-01', minutes: 120, subjectId: 'ma', start: 1, end: 2, kind: 'watch', updatedAt: 1 }, b: { id: 'b', date: '2025-03-01', minutes: 60, start: 1, end: 2, kind: 'watch', updatedAt: 1 } } as never;
    d.movies = { m: { id: 'm', title: '존 윅', status: 'watched', watched: '2026-05-01', rating: 5, updatedAt: 1 } } as never;
    const r = recap(d, 2026);
    expect(r.studyMin).toBe(120);
    expect(r.topSubject).toEqual({ name: '수학', min: 120 });
    expect(r.movies).toBe(1);
    expect(recapLines(r).map((l) => l.label)).toEqual(['공부', '본 영화']);
  });
});
