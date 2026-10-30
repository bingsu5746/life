import { describe, expect, it } from 'vitest';
import { parse2k } from './nba2k';

describe('NBA 2K 능력치', () => {
  it('설명서 모양의 선수 · 분류별 능력치 펼치기', () => {
    const p = parse2k({ success: true, data: [{ name: 'Stephen Curry', slug: 'stephen-curry', team: 'Golden State Warriors', overall: 95, positions: ['PG'], attributes: { shooting: { closeShot: 96, midRangeShot: 97, threePointShot: 99 }, misc: { note: 'x' } } }] });
    expect(p[0]).toMatchObject({ name: 'Stephen Curry', ovr: 95, pos: ['PG'], attrs: { closeShot: 96, midRangeShot: 97, threePointShot: 99 } });
    expect(parse2k([{ name: 'A', overall: '80' }])[0].ovr).toBe(80);
  });
});

describe('nba2kapi 실제 응답 모양 (2026-10-30 공개 목록에서 확인)', () => {
  it('attributes 가 펼쳐진 모양 · overall · positions', () => {
    const p = parse2k({ success: true, data: [{ name: 'Nikola Jokic', overall: 97, positions: ['C'], team: 'Denver Nuggets', attributes: { threePointShot: 85, passAccuracy: 93, drivingLayup: 94 } }], meta: { pagination: { hasMore: true, nextCursor: '2' } } });
    expect(p[0]).toMatchObject({ name: 'Nikola Jokic', ovr: 97, attrs: { threePointShot: 85, passAccuracy: 93, drivingLayup: 94 } });
  });
});
