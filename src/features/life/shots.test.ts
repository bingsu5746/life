import { describe, expect, it } from 'vitest';
import { zoneOf } from './homecourt';
import { durationSecs, report, whenDate, type ShotRec } from './shots';

describe('zoneOf (FIBA 반코트, 카드 높이 = 폭 × 0.685)', () => {
  it('구역', () => {
    expect(zoneOf(0.5, 0.16)).toBe('ra'); // 림 바로 아래
    expect(zoneOf(0.5, 0.45)).toBe('paint');
    expect(zoneOf(0.02, 0.1)).toBe('c3L'); // 왼쪽 코너
    expect(zoneOf(0.98, 0.1)).toBe('c3R');
    expect(zoneOf(0.5, 0.95)).toBe('top3'); // 3점 라인 밖 정면
    expect(zoneOf(0.2, 0.15)).toBe('midLB');
    expect(zoneOf(0.5, 0.7)).toBe('midC'); // 자유투 라인 뒤, 3점 안
    expect(zoneOf(0.25, 0.55)).toBe('midL');
  });
});

describe('report', () => {
  it('성공률 · eFG', () => {
    const shots: ShotRec[] = [
      [500, 160, 1],
      [500, 160, 0],
      [20, 100, 1],
      [20, 100, 0],
    ];
    const r = report(shots);
    expect(r.total).toEqual({ m: 2, a: 4 });
    expect(r.three).toEqual({ m: 1, a: 2 });
    expect(r.efg).toBeCloseTo(62.5);
  });
});

describe('홈코트 글 읽기', () => {
  it('걸린 시간', () => {
    expect(durationSecs('17m 36s')).toBe(1056);
    expect(durationSecs('1h 2m')).toBe(3720);
    expect(durationSecs(null)).toBeUndefined();
  });
  it('날짜', () => {
    expect(whenDate('Yesterday at 6:58 PM', '2026-10-31')).toBe('2026-10-30');
    expect(whenDate('Today at 1:00 PM', '2026-10-31')).toBe('2026-10-31');
    expect(whenDate('Oct 29 at 6:58 PM', '2026-10-31')).toBe('2026-10-29');
    expect(whenDate('Dec 30 at 6:58 PM', '2026-10-31')).toBe('2025-12-30');
  });
});
