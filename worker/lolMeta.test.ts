import { describe, expect, it } from 'vitest';
import { countMatch } from './lolMeta';

// sql.exec 를 흉내: lolagg 에 쌓인 것을 지도에 모은다
function fakeSql() {
  const m = new Map<string, { g: number; w: number; kk: number }>();
  return {
    m,
    exec: (_q: string, k: string, w: number, kk: number) => {
      const c = m.get(k) ?? { g: 0, w: 0, kk: 0 };
      c.g++;
      c.w += w;
      c.kk += kk;
      m.set(k, c);
      return { toArray: () => [] };
    },
  };
}
const part = (teamId: number, pos: string, cid: number, win: boolean, kills = 1) => ({
  teamId,
  teamPosition: pos,
  championId: cid,
  win,
  kills,
  deaths: 1,
  assists: 1,
  totalDamageDealtToChampions: 1000,
  item0: 3071,
  item1: 3071,
  summoner1Id: 11,
  summoner2Id: 4,
  perks: {
    statPerks: { offense: 5008, flex: 5008, defense: 5001 },
    styles: [
      { style: 8000, selections: [{ perk: 8010 }, { perk: 9111 }, { perk: 9104 }, { perk: 8299 }] },
      { style: 8400, selections: [{ perk: 8444 }, { perk: 8451 }] },
    ],
  },
});
const POS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

describe('롤 통계 세기', () => {
  it('솔랭 한 판: 경기 수 · 챔프 · 아이템(중복 한 번) · 맞상대 · 밴', () => {
    const sql = fakeSql();
    const match = { info: { queueId: 420, gameVersion: '16.21.123.4', gameDuration: 1800, teams: [{ bans: [{ championId: 7 }, { championId: -1 }] }, { bans: [] }], participants: [...POS.map((p, i) => part(100, p, 10 + i, true)), ...POS.map((p, i) => part(200, p, 20 + i, false))] } };
    expect(countMatch(sql as never, match)).toBe(true);
    expect(sql.m.get('T|16.21')?.g).toBe(1);
    expect(sql.m.get('B|16.21|7')?.g).toBe(1);
    expect(sql.m.get('C|16.21|10|TOP')).toMatchObject({ g: 1, w: 1 });
    expect(sql.m.get('I|16.21|10|TOP|3071')?.g).toBe(1);
    expect(sql.m.get('M|16.21|10|TOP|20')).toMatchObject({ g: 1, w: 1 });
    expect(sql.m.get('M|16.21|20|TOP|10')).toMatchObject({ g: 1, w: 0 });
    expect(sql.m.get('S|16.21|10|TOP|4-11')?.g).toBe(1);
    expect([...sql.m.keys()].some((k) => k.startsWith('R|16.21|10|TOP|8000.8400.8010'))).toBe(true);
  });
  it('일반 · 짧은 판은 안 센다', () => {
    const sql = fakeSql();
    expect(countMatch(sql as never, { info: { queueId: 430, gameVersion: '16.21.1', gameDuration: 1800, participants: [] } })).toBe(false);
    expect(sql.m.size).toBe(0);
  });
});
