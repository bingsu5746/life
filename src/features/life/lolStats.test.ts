import { describe, expect, it } from 'vitest';
import { byChampion, byPosition, champDetail, kda, streaks, summary, yearRecap, type LolGame } from './lolStats';

const g = (o: Partial<LolGame>): LolGame => ({
  id: Math.random().toString(),
  at: Date.UTC(2026, 4, 1),
  dur: 1800,
  q: 420,
  win: true,
  remake: false,
  champ: 'Ahri',
  cid: 103,
  pos: 'MIDDLE',
  k: 5,
  d: 2,
  a: 5,
  cs: 180,
  gold: 12000,
  dmg: 20000,
  taken: 15000,
  vision: 20,
  wards: 8,
  kp: 0.5,
  items: [],
  spells: [],
  multi: 1,
  penta: 0,
  first: false,
  lvl: 16,
  dmgRank: 1,
  ...o,
});

describe('롤 통계', () => {
  it('요약 · 다시하기 빼기', () => {
    const s = summary([g({}), g({ win: false, k: 1, d: 6, a: 3 }), g({ remake: true })]);
    expect([s.games, s.wins, s.losses, s.winRate]).toEqual([2, 1, 1, 50]);
    expect(s.kda).toBeCloseTo(kda(3, 4, 4));
    expect(s.csMin).toBeCloseTo(6);
  });
  it('모스트 · 포지션 · 연승', () => {
    const list = [g({ at: 3 }), g({ at: 2, champ: 'Zed', cid: 238 }), g({ at: 1, win: false })];
    expect(byChampion(list)[0]).toMatchObject({ champ: 'Ahri', games: 2, winRate: 50 });
    expect(byPosition(list)[0]).toMatchObject({ pos: 'MIDDLE', games: 3 });
    expect(streaks(list)).toEqual({ now: 2, nowWin: true, bestWin: 2, bestLose: 1 });
  });
  it('한 해 결산', () => {
    const y = yearRecap([g({ penta: 1, multi: 5 }), g({ at: Date.UTC(2025, 1, 1) })], 2026);
    expect([y.games, y.pentas, y.quadras, y.most?.champ]).toEqual([1, 1, 1, 'Ahri']);
  });
});

describe('챔피언 자세히', () => {
  it('아이템 · 스펠', () => {
    const c = champDetail([g({ items: [3020, 6655, 0, 0, 0, 2003, 3340], spells: [4, 14] }), g({ items: [3020, 3089, 0, 0, 0, 0, 3364], spells: [14, 4], win: false })]);
    expect(c.items[0]).toEqual({ id: 3020, n: 2 });
    expect(c.items.some((x) => x.id === 2003 || x.id === 3340)).toBe(false);
    expect(c.spells[0]).toMatchObject({ key: '4-14', n: 2, winRate: 50 });
  });
});
