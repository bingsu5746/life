import { describe, expect, it } from 'vitest';
import { lostEdits } from './sync';

describe('lostEdits', () => {
  it('이 기기에서 고친 뒤 다른 기기 것이 더 최근이면 센다', () => {
    const local = { notes: { a: { updatedAt: 200 }, b: { updatedAt: 50 }, c: { updatedAt: 300 } } };
    const merged = { notes: { a: { updatedAt: 250 }, b: { updatedAt: 400 }, c: { updatedAt: 300 } } };
    expect(lostEdits('study', local, merged, 100)).toBe(1);
    expect(lostEdits('words', { w: { updatedAt: 200 } }, { w: { updatedAt: 210 } }, 100)).toBe(1);
  });
});
