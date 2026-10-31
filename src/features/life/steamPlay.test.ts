import { describe, expect, it } from 'vitest';
import { dailyPlay, pickUnplayed, playBetween } from './steamPlay';

describe('Steam 한 시간', () => {
  const h = { '2026-10-01': { 10: 100, 20: 50 }, '2026-10-02': { 10: 160, 20: 50 }, '2026-10-04': { 10: 160, 20: 80, 30: 5 } };
  it('날마다 차이', () => {
    expect(dailyPlay(h)).toEqual([
      { date: '2026-10-02', min: 60, gap: 1 },
      { date: '2026-10-04', min: 35, gap: 2 },
    ]);
    expect(playBetween(h, '2026-10-01', '2026-10-31', (id) => id === 20)).toBe(30);
  });
  it('안 해 본 게임 고르기', () => {
    const owned = [
      { appid: 1, minutes: 0 },
      { appid: 2, minutes: 9 },
      { appid: 3, minutes: 0 },
    ];
    expect([1, 3]).toContain(pickUnplayed(owned, '2026-10-26')?.appid);
    expect(pickUnplayed([{ appid: 2, minutes: 9 }], 'x')).toBeNull();
  });
});
