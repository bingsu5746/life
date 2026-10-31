import { describe, expect, it } from 'vitest';
import { countMatches, metaChamp, metaTable } from './lolMeta';

// sql.exec 흉내: lolagg2(k → data) 와 lolm2(id) 만
function fakeSql() {
  const agg = new Map<string, string>();
  const seen = new Set<string>();
  let writes = 0;
  const rows = (r: unknown[]) => ({ toArray: () => r });
  return {
    agg,
    get writes() {
      return writes;
    },
    exec: (q: string, ...a: unknown[]) => {
      if (q.startsWith('SELECT 1 FROM lolm2')) return rows(seen.has(a[0] as string) ? [{}] : []);
      if (q.startsWith('INSERT INTO lolm2')) {
        writes++;
        seen.add(a[0] as string);
        return rows([]);
      }
      if (q.startsWith('SELECT data FROM lolagg2')) return rows(agg.has(a[0] as string) ? [{ data: agg.get(a[0] as string) }] : []);
      if (q.startsWith('INSERT OR REPLACE INTO lolagg2')) {
        writes++;
        agg.set(a[0] as string, a[1] as string);
        return rows([]);
      }
      if (q.startsWith('SELECT k, data FROM lolagg2')) {
        const pre = q.includes("'P|%'") ? 'P|' : String(a[0]).replace('%', '');
        return rows([...agg].filter(([k]) => k.startsWith(pre)).map(([k, data]) => ({ k, data })));
      }
      throw new Error(q);
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
const match = { info: { queueId: 420, gameVersion: '16.21.123.4', gameDuration: 1800, teams: [{ bans: [{ championId: 7 }, { championId: -1 }] }, { bans: [] }], participants: [...POS.map((p, i) => part(100, p, 10 + i, true)), ...POS.map((p, i) => part(200, p, 20 + i, false))] } };

describe('롤 통계 세기', () => {
  it('솔랭 한 판: 한 판에 12줄만 쓰고, 티어표 · 챔피언 화면 모양이 맞다', () => {
    const sql = fakeSql();
    expect(countMatches(sql as never, [{ id: 'KR_1', m: match }])).toBe(1);
    expect(sql.writes).toBe(12);
    const t = metaTable(sql as never, '16.21');
    expect(t.total).toBe(1);
    expect(t.bans[7]).toBe(1);
    expect(t.rows.find((r) => r.cid === 10)).toMatchObject({ pos: 'TOP', g: 1, w: 1 });
    const c = metaChamp(sql as never, '16.21', 10);
    expect(c.items.find((r) => r.k === 'TOP|3071')?.g).toBe(1);
    expect(c.spells.find((r) => r.k === 'TOP|4-11')?.g).toBe(1);
    expect(c.runes.some((r) => r.k.startsWith('TOP|8000.8400.8010'))).toBe(true);
    expect(c.mine.find((r) => r.k === 'TOP|20')).toMatchObject({ g: 1, w: 1 });
    expect(c.theirs.find((r) => r.k === 'TOP|20')).toMatchObject({ g: 1, w: 0 });
  });
  it('같은 경기는 두 번 안 세고, 일반 · 짧은 판도 안 센다', () => {
    const sql = fakeSql();
    countMatches(sql as never, [{ id: 'KR_1', m: match }]);
    expect(countMatches(sql as never, [{ id: 'KR_1', m: match }])).toBe(0);
    expect(countMatches(sql as never, [{ id: 'KR_2', m: { info: { queueId: 430, gameVersion: '16.21.1', gameDuration: 1800, participants: [] } } }])).toBe(0);
    expect(metaTable(sql as never, 'all').total).toBe(1);
  });
});
