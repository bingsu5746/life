// 롤 챔피언 통계를 직접 모으기: Riot 은 승률 · 픽률 · 카운터 · 빌드 통계를 주지 않아서,
// 마스터 이상 솔로랭크(큐 420) 경기를 몇 판씩 받아 챔피언 · 포지션 · 아이템 · 룬 · 스펠 · 맞상대별로 센다.
// Cloudflare 무료 플랜은 저장소에 쓰는 줄이 하루 10만 줄까지라서(공식 문서), 챔피언마다 한 줄(JSON)에 모아 쓴다:
//   lolagg2 표 k = 'P|패치'      → { games, bans: { 챔프: 수 } }
//             k = 'C|패치|챔프' → { pos: { 포지션: [판, 승, 킬, 데스, 어시, 딜, 킬관여×1000] }, items · runes · spells: { 포지션: { 열쇠: [판, 승] } }, mu: { 포지션: { 상대: [판, 승, 킬, 데스, 어시, 딜, 킬관여×1000] } } }
//   lolm2 표 = 이미 센 경기 번호 (30일 보관)
// 한 판에 쓰는 줄은 챔피언 10줄 + 패치 1줄 + 경기 번호 1줄 = 12줄. 얼마나 자주 모을지는 accounts.ts 알람이 하루 쓰기량을 보고 정한다.
import { within } from './nba';

const POS = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
type Sql = DurableObjectState['storage']['sql'];
type Stat = number[]; // [판, 승, 킬, 데스, 어시, 딜, 킬관여×1000]
interface ChampAgg {
  pos: Record<string, Stat>;
  items: Record<string, Record<string, Stat>>;
  runes: Record<string, Record<string, Stat>>;
  spells: Record<string, Record<string, Stat>>;
  mu: Record<string, Record<string, Stat>>;
}
interface PatchAgg {
  games: number;
  bans: Record<string, number>;
}

export function lolMetaTables(sql: Sql) {
  // WITHOUT ROWID: 따로 붙는 색인이 없어 쓰는 줄이 한 번만 세진다
  sql.exec('CREATE TABLE IF NOT EXISTS lolagg2 (k TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID');
  sql.exec('CREATE TABLE IF NOT EXISTS lolm2 (id TEXT PRIMARY KEY, at INTEGER NOT NULL) WITHOUT ROWID');
  // 예전 방식(한 판에 110줄 쓰던 표)은 지운다
  sql.exec('DROP TABLE IF EXISTS lolagg');
  sql.exec('DROP TABLE IF EXISTS lolm');
}
const read = <T>(sql: Sql, k: string): T | null => {
  const r = sql.exec<{ data: string }>('SELECT data FROM lolagg2 WHERE k = ?', k).toArray()[0];
  return r ? (JSON.parse(r.data) as T) : null;
};
const write = (sql: Sql, k: string, v: unknown) => sql.exec('INSERT OR REPLACE INTO lolagg2 (k, data) VALUES (?, ?)', k, JSON.stringify(v));
const bump = (o: Record<string, Stat>, key: string, win: boolean, st?: { k: number; d: number; a: number; dmg: number; kp: number }) => {
  const c = o[key] ?? (st ? [0, 0, 0, 0, 0, 0, 0] : [0, 0]);
  c[0]++;
  if (win) c[1]++;
  if (st) {
    c[2] += st.k;
    c[3] += st.d;
    c[4] += st.a;
    c[5] += st.dmg;
    c[6] += Math.round(st.kp * 1000);
  }
  o[key] = c;
};

type Part = Record<string, unknown> & {
  championId?: number;
  teamId?: number;
  teamPosition?: string;
  win?: boolean;
  kills?: number;
  deaths?: number;
  assists?: number;
  totalDamageDealtToChampions?: number;
  perks?: { statPerks?: Record<string, number>; styles?: { style?: number; selections?: { perk?: number }[] }[] };
};

/** 경기들을 메모리에서 센 뒤, 바뀐 챔피언 줄만 한 번씩 쓴다. 센 판 수 */
export function countMatches(sql: Sql, matches: { id: string; m: unknown }[]): number {
  const patches = new Map<string, PatchAgg>();
  const champs = new Map<string, ChampAgg>();
  const patchOf = (p: string) => {
    if (!patches.has(p)) patches.set(p, read<PatchAgg>(sql, `P|${p}`) ?? { games: 0, bans: {} });
    return patches.get(p)!;
  };
  const champOf = (p: string, cid: number) => {
    const k = `C|${p}|${cid}`;
    if (!champs.has(k)) champs.set(k, read<ChampAgg>(sql, k) ?? { pos: {}, items: {}, runes: {}, spells: {}, mu: {} });
    return champs.get(k)!;
  };
  let n = 0;
  for (const { id, m } of matches) {
    const info = (m as { info?: { queueId?: number; gameVersion?: string; gameDuration?: number; participants?: Part[]; teams?: { bans?: { championId?: number }[] }[] } })?.info;
    if (!info || info.queueId !== 420 || (info.gameDuration ?? 0) < 300) continue;
    const patch = (info.gameVersion ?? '').split('.').slice(0, 2).join('.');
    const ps = info.participants ?? [];
    if (!/^\d+\.\d+$/.test(patch) || ps.length !== 10) continue;
    if (sql.exec('SELECT 1 FROM lolm2 WHERE id = ?', id).toArray().length) continue;
    sql.exec('INSERT INTO lolm2 (id, at) VALUES (?, ?)', id, Date.now());
    const pa = patchOf(patch);
    pa.games++;
    for (const t of info.teams ?? []) for (const b of t.bans ?? []) if (b.championId && b.championId > 0) pa.bans[b.championId] = (pa.bans[b.championId] ?? 0) + 1;
    const teamKills = (team?: number) => ps.filter((p) => p.teamId === team).reduce((s, p) => s + (p.kills ?? 0), 0);
    for (const p of ps) {
      const pos = String(p.teamPosition ?? '');
      const cid = p.championId ?? 0;
      if (!POS.has(pos) || !cid) continue;
      const win = p.win === true;
      const tk = teamKills(p.teamId);
      const st = { k: p.kills ?? 0, d: p.deaths ?? 0, a: p.assists ?? 0, dmg: p.totalDamageDealtToChampions ?? 0, kp: tk ? ((p.kills ?? 0) + (p.assists ?? 0)) / tk : 0 };
      const c = champOf(patch, cid);
      bump(c.pos, pos, win, st);
      c.items[pos] ??= {};
      for (const it of new Set([0, 1, 2, 3, 4, 5].map((i) => Number(p[`item${i}`]) || 0))) if (it) bump(c.items[pos], String(it), win);
      c.spells[pos] ??= {};
      bump(c.spells[pos], [Number(p.summoner1Id) || 0, Number(p.summoner2Id) || 0].sort((a, b) => a - b).join('-'), win);
      const styles = p.perks?.styles ?? [];
      const perks = [...(styles[0]?.selections ?? []), ...(styles[1]?.selections ?? [])].map((x) => x.perk ?? 0);
      const sh = p.perks?.statPerks ?? {};
      if (perks.length === 6 && styles[0]?.style && styles[1]?.style) {
        c.runes[pos] ??= {};
        bump(c.runes[pos], [styles[0].style, styles[1].style, ...perks, sh.offense ?? 0, sh.flex ?? 0, sh.defense ?? 0].join('.'), win);
      }
      const opp = ps.find((o) => o.teamId !== p.teamId && o.teamPosition === pos);
      if (opp?.championId) {
        c.mu[pos] ??= {};
        bump(c.mu[pos], String(opp.championId), win, st);
      }
    }
    n++;
  }
  for (const [p, v] of patches) write(sql, `P|${p}`, v);
  for (const [k, v] of champs) write(sql, k, v);
  return n;
}

async function riot(key: string, url: string): Promise<unknown> {
  const res = await within(fetch(url, { headers: { 'X-Riot-Token': key } }), 15_000, 'Riot');
  if (!res.ok) throw new Error(`Riot ${res.status}`);
  return res.json();
}

/** 전체 챔피언 번호 (Data Dragon, 하루 한 번 새로) */
async function allChamps(cacheGet: (k: string) => string | undefined, cacheSet: (k: string, v: string) => void): Promise<number[]> {
  const c = JSON.parse(cacheGet('lolmeta:champs') ?? 'null') as { at: number; ids: number[] } | null;
  if (c && Date.now() - c.at < 86_400_000 && c.ids.length) return c.ids;
  const v = ((await (await within(fetch('https://ddragon.leagueoflegends.com/api/versions.json'), 15_000, 'Data Dragon')).json()) as string[])[0];
  const j = (await (await within(fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`), 15_000, 'Data Dragon')).json()) as { data: Record<string, { key: string }> };
  const ids = Object.values(j.data)
    .map((x) => Number(x.key))
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  cacheSet('lolmeta:champs', JSON.stringify({ at: Date.now(), ids }));
  return ids;
}

/** 챔피언 → 그 챔피언을 하는 마스터 이상 사람들 (센 경기 참가자 · 숙련도 상위에서 알게 된 것, 챔피언마다 최근 8명) */
type Who = Record<string, string[]>;
const addWho = (who: Who, cid: number, puuid: string) => {
  const l = (who[cid] ??= []).filter((x) => x !== puuid);
  l.unshift(puuid);
  who[cid] = l.slice(0, 8);
};

/** 한 번에: 모든 챔피언을 차례로 돌며, 이번 차례 챔피언을 하는 사람의 최근 솔랭 몇 판을 받아 센다
 *  (한 판에 10명이 다 세지니, 인기 챔피언은 저절로 많이 모이고 비인기 챔피언도 차례가 돌아온다) */
export async function lolMetaTick(key: string, sql: Sql, cacheGet: (k: string) => string | undefined, cacheSet: (k: string, v: string) => void, perTick = 3): Promise<{ counted: number; champ?: number }> {
  let seeds = JSON.parse(cacheGet('lolmeta:seeds') ?? 'null') as { at: number; list: string[] } | null;
  if (!seeds || Date.now() - seeds.at > 24 * 3600_000 || !seeds.list.length) {
    const list: string[] = [];
    for (const tier of ['challengerleagues', 'grandmasterleagues', 'masterleagues']) {
      const j = (await riot(key, `https://kr.api.riotgames.com/lol/league/v4/${tier}/by-queue/RANKED_SOLO_5x5`)) as { entries?: { puuid?: string }[] };
      for (const e of j.entries ?? []) if (e.puuid) list.push(e.puuid);
      if (list.length >= 1500) break;
    }
    if (!list.length) throw new Error('리그 목록에 puuid 가 없어요');
    seeds = { at: Date.now(), list: list.sort(() => Math.random() - 0.5) };
    cacheSet('lolmeta:seeds', JSON.stringify(seeds));
  }
  const who = JSON.parse(cacheGet('lolmeta:who') ?? '{}') as Who;
  // 숙련도 상위 3개로 사람 알아 두기 (한 번에 2명씩, 시드 목록을 차례로)
  const mi = Number(cacheGet('lolmeta:mi') ?? 0);
  for (let k = 0; k < 2; k++) {
    const p = seeds.list[(mi + k) % seeds.list.length];
    const top = (await riot(key, `https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${p}/top?count=3`).catch(() => [])) as { championId?: number }[];
    for (const t of top) if (t.championId) addWho(who, t.championId, p);
  }
  cacheSet('lolmeta:mi', String(mi + 2));

  // 이번 차례 챔피언
  const champs = await allChamps(cacheGet, cacheSet);
  const ci = Number(cacheGet('lolmeta:ci') ?? 0);
  cacheSet('lolmeta:ci', String(ci + 1));
  const champ = champs[ci % champs.length];
  const players = who[champ] ?? [];
  let puuid: string;
  if (players.length) puuid = players[Math.floor(Math.random() * players.length)];
  else {
    // 아직 그 챔피언을 하는 사람을 모르면 시드 차례대로
    const i = Number(cacheGet('lolmeta:i') ?? 0) % seeds.list.length;
    cacheSet('lolmeta:i', String(i + 1));
    puuid = seeds.list[i];
  }
  const since = Math.floor((Date.now() - 14 * 86_400_000) / 1000);
  const ids = (await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&startTime=${since}&count=20`)) as string[];
  const fresh = ids.filter((x) => !sql.exec('SELECT 1 FROM lolm2 WHERE id = ?', x).toArray().length).slice(0, perTick);
  // 하루 한 번 30일 지난 번호 지우기
  if (Date.now() - Number(cacheGet('lolmeta:gc') ?? 0) > 86_400_000) {
    sql.exec('DELETE FROM lolm2 WHERE at < ?', Date.now() - 30 * 86_400_000);
    cacheSet('lolmeta:gc', String(Date.now()));
  }
  const got: { id: string; m: unknown }[] = [];
  for (const id of fresh) {
    const m = await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/${id}`);
    got.push({ id, m });
    // 이 판 참가자들도 그 챔피언을 하는 사람으로 기억
    for (const p of ((m as { info?: { queueId?: number; participants?: { puuid?: string; championId?: number }[] } }).info?.queueId === 420 ? (m as { info: { participants?: { puuid?: string; championId?: number }[] } }).info.participants : []) ?? [])
      if (p.puuid && p.championId) addWho(who, p.championId, p.puuid);
  }
  cacheSet('lolmeta:who', JSON.stringify(who));
  return { counted: got.length ? countMatches(sql, got) : 0, champ };
}

// ===== 읽기 (화면이 쓰는 모양은 예전과 같게: k = '포지션|열쇠') =====
export interface Row {
  k: string;
  g: number;
  w: number;
  kk: number;
  dd: number;
  aa: number;
  dmg: number;
  kp: number;
}
const toRow = (k: string, s: Stat): Row => ({ k, g: s[0] ?? 0, w: s[1] ?? 0, kk: s[2] ?? 0, dd: s[3] ?? 0, aa: s[4] ?? 0, dmg: s[5] ?? 0, kp: s[6] ?? 0 });
const sortPatch = (a: string, b: string) => {
  const [a1, a2] = a.split('.').map(Number);
  const [b1, b2] = b.split('.').map(Number);
  return b1 - a1 || b2 - a2;
};

export function metaPatches(sql: Sql): { patch: string; games: number }[] {
  return sql
    .exec<{ k: string; data: string }>("SELECT k, data FROM lolagg2 WHERE k LIKE 'P|%'")
    .toArray()
    .map((r) => ({ patch: r.k.slice(2), games: (JSON.parse(r.data) as PatchAgg).games }))
    .sort((a, b) => sortPatch(a.patch, b.patch));
}
const patchesOf = (sql: Sql, patch: string) => (patch === 'all' ? metaPatches(sql).map((p) => p.patch) : [patch]);

/** 티어표: 챔피언 · 포지션별 판 · 승 · 밴 */
export function metaTable(sql: Sql, patch: string) {
  let total = 0;
  const bans: Record<number, number> = {};
  const acc = new Map<string, Row & { cid: number; pos: string }>();
  for (const p of patchesOf(sql, patch)) {
    const pa = read<PatchAgg>(sql, `P|${p}`);
    if (!pa) continue;
    total += pa.games;
    for (const [c, n] of Object.entries(pa.bans)) bans[Number(c)] = (bans[Number(c)] ?? 0) + n;
    for (const r of sql.exec<{ k: string; data: string }>('SELECT k, data FROM lolagg2 WHERE k LIKE ?', `C|${p}|%`).toArray()) {
      const cid = Number(r.k.split('|')[2]);
      for (const [pos, s] of Object.entries((JSON.parse(r.data) as ChampAgg).pos)) {
        const key = `${cid}|${pos}`;
        const cur = acc.get(key) ?? { ...toRow(pos, []), cid, pos };
        const add = toRow(pos, s);
        acc.set(key, { ...cur, g: cur.g + add.g, w: cur.w + add.w, kk: cur.kk + add.kk, dd: cur.dd + add.dd, aa: cur.aa + add.aa, dmg: cur.dmg + add.dmg, kp: cur.kp + add.kp });
      }
    }
  }
  return { total, rows: [...acc.values()].map(({ cid, pos, g, w, kk, dd, aa }) => ({ cid, pos, g, w, kk, dd, aa })), bans };
}

/** 챔피언 하나: 포지션 · 아이템 · 룬 · 스펠 · 맞상대(내 쪽 + 상대 쪽) */
export function metaChamp(sql: Sql, patch: string, cid: number) {
  let total = 0,
    bans = 0;
  const sum = new Map<string, Map<string, Row>>();
  const addTo = (bucket: string, k: string, s: Stat) => {
    const m = sum.get(bucket) ?? new Map<string, Row>();
    const cur = m.get(k) ?? toRow(k, []);
    const a = toRow(k, s);
    m.set(k, { k, g: cur.g + a.g, w: cur.w + a.w, kk: cur.kk + a.kk, dd: cur.dd + a.dd, aa: cur.aa + a.aa, dmg: cur.dmg + a.dmg, kp: cur.kp + a.kp });
    sum.set(bucket, m);
  };
  for (const p of patchesOf(sql, patch)) {
    const pa = read<PatchAgg>(sql, `P|${p}`);
    if (!pa) continue;
    total += pa.games;
    bans += pa.bans[cid] ?? 0;
    const c = read<ChampAgg>(sql, `C|${p}|${cid}`);
    if (c) {
      for (const [pos, s] of Object.entries(c.pos)) addTo('pos', pos, s);
      for (const b of ['items', 'runes', 'spells', 'mu'] as const) for (const [pos, o] of Object.entries(c[b])) for (const [k, s] of Object.entries(o)) addTo(b, `${pos}|${k}`, s);
    }
    // 상대 쪽: 맞상대 챔피언들의 줄에서 상대가 이 챔프인 것
    for (const r of sql.exec<{ k: string; data: string }>('SELECT k, data FROM lolagg2 WHERE k LIKE ?', `C|${p}|%`).toArray()) {
      const opp = r.k.split('|')[2];
      if (opp === String(cid)) continue;
      for (const [pos, o] of Object.entries((JSON.parse(r.data) as ChampAgg).mu)) if (o[cid]) addTo('theirs', `${pos}|${opp}`, o[cid]);
    }
  }
  const list = (b: string) => [...(sum.get(b)?.values() ?? [])];
  return { total, bans, pos: list('pos'), items: list('items'), runes: list('runes'), spells: list('spells'), mine: list('mu'), theirs: list('theirs') };
}
