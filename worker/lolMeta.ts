// 롤 챔피언 통계를 직접 모으기: Riot 은 승률 · 픽률 · 카운터 · 빌드 통계를 주지 않아서,
// 마스터 이상 솔로랭크(큐 420) 경기를 1분마다 몇 판씩 받아 챔피언 · 포지션 · 아이템 · 룬 · 스펠 · 맞상대별로 센다.
// 표 lolagg: k(열쇠) · g(판) · w(승) · kk/dd/aa(킬 · 데스 · 어시 합) · dmg(챔피언에게 준 피해 합) · kp(킬 관여 × 1000 합)
//   T|패치            → 경기 수 (픽률 · 밴률 분모)
//   C|패치|챔프|포지션 → 그 포지션 판 · 승
//   B|패치|챔프       → 밴 수
//   I|패치|챔프|포지션|아이템 · R|…|룬(핵심.보조계열.6개.파편3개) · S|…|스펠1-스펠2 · M|…|맞상대챔프
// 표 lolm: 이미 센 경기 번호
import { within } from './nba';

const POS = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
type Sql = DurableObjectState['storage']['sql'];

export function lolMetaTables(sql: Sql) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS lolagg (k TEXT PRIMARY KEY, g INTEGER NOT NULL DEFAULT 0, w INTEGER NOT NULL DEFAULT 0, kk INTEGER NOT NULL DEFAULT 0, dd INTEGER NOT NULL DEFAULT 0, aa INTEGER NOT NULL DEFAULT 0, dmg INTEGER NOT NULL DEFAULT 0, kp INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS lolm (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
  `);
}

function add(sql: Sql, k: string, win: boolean, s?: { k: number; d: number; a: number; dmg: number; kp: number }) {
  sql.exec(
    'INSERT INTO lolagg (k, g, w, kk, dd, aa, dmg, kp) VALUES (?, 1, ?, ?, ?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET g = g + 1, w = w + excluded.w, kk = kk + excluded.kk, dd = dd + excluded.dd, aa = aa + excluded.aa, dmg = dmg + excluded.dmg, kp = kp + excluded.kp',
    k,
    win ? 1 : 0,
    s?.k ?? 0,
    s?.d ?? 0,
    s?.a ?? 0,
    s?.dmg ?? 0,
    Math.round((s?.kp ?? 0) * 1000),
  );
}

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

/** 한 경기를 센다 (솔로랭크 · 다시하기 아닌 것만). 센 판이면 true */
export function countMatch(sql: Sql, m: unknown): boolean {
  const info = (m as { info?: { queueId?: number; gameVersion?: string; gameDuration?: number; participants?: Part[]; teams?: { bans?: { championId?: number }[] }[] } })?.info;
  if (!info || info.queueId !== 420 || (info.gameDuration ?? 0) < 300) return false;
  const patch = (info.gameVersion ?? '').split('.').slice(0, 2).join('.');
  if (!/^\d+\.\d+$/.test(patch)) return false;
  const ps = info.participants ?? [];
  if (ps.length !== 10) return false;
  add(sql, `T|${patch}`, false);
  for (const t of info.teams ?? []) for (const b of t.bans ?? []) if (b.championId && b.championId > 0) add(sql, `B|${patch}|${b.championId}`, false);
  const teamKills = (team?: number) => ps.filter((p) => p.teamId === team).reduce((s, p) => s + (p.kills ?? 0), 0);
  for (const p of ps) {
    const pos = String(p.teamPosition ?? '');
    const cid = p.championId ?? 0;
    if (!POS.has(pos) || !cid) continue;
    const win = p.win === true;
    const tk = teamKills(p.teamId);
    const st = { k: p.kills ?? 0, d: p.deaths ?? 0, a: p.assists ?? 0, dmg: p.totalDamageDealtToChampions ?? 0, kp: tk ? ((p.kills ?? 0) + (p.assists ?? 0)) / tk : 0 };
    const base = `${patch}|${cid}|${pos}`;
    add(sql, `C|${base}`, win, st);
    for (const it of new Set([0, 1, 2, 3, 4, 5].map((i) => Number(p[`item${i}`]) || 0))) if (it) add(sql, `I|${base}|${it}`, win);
    const sp = [Number(p.summoner1Id) || 0, Number(p.summoner2Id) || 0].sort((a, b) => a - b).join('-');
    add(sql, `S|${base}|${sp}`, win);
    const styles = p.perks?.styles ?? [];
    const perks = [...(styles[0]?.selections ?? []), ...(styles[1]?.selections ?? [])].map((x) => x.perk ?? 0);
    const shards = p.perks?.statPerks ?? {};
    if (perks.length === 6 && styles[0]?.style && styles[1]?.style) add(sql, `R|${base}|${[styles[0].style, styles[1].style, ...perks, shards.offense ?? 0, shards.flex ?? 0, shards.defense ?? 0].join('.')}`, win);
    const opp = ps.find((o) => o.teamId !== p.teamId && o.teamPosition === pos);
    if (opp?.championId) add(sql, `M|${base}|${opp.championId}`, win, st);
  }
  return true;
}

async function riot(key: string, url: string): Promise<unknown> {
  const res = await within(fetch(url, { headers: { 'X-Riot-Token': key } }), 15_000, 'Riot');
  if (!res.ok) throw new Error(`Riot ${res.status}`);
  return res.json();
}

/** 1분에 한 번: 마스터 이상 한 사람의 최근 솔랭 몇 판을 받아 센다. 상태는 cache 표에 적는다 */
export async function lolMetaTick(key: string, sql: Sql, cacheGet: (k: string) => string | undefined, cacheSet: (k: string, v: string) => void, perTick = 6): Promise<{ counted: number; err?: string }> {
  // 씨앗: 챌린저 · 그랜드마스터 · 마스터 리그 사람들 (6시간마다 새로)
  let seeds = JSON.parse(cacheGet('lolmeta:seeds') ?? 'null') as { at: number; list: string[] } | null;
  if (!seeds || Date.now() - seeds.at > 6 * 3600_000 || !seeds.list.length) {
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
  const i = Number(cacheGet('lolmeta:i') ?? 0) % seeds.list.length;
  cacheSet('lolmeta:i', String(i + 1));
  const puuid = seeds.list[i];
  const since = Math.floor((Date.now() - 14 * 86_400_000) / 1000);
  const ids = (await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&startTime=${since}&count=20`)) as string[];
  const fresh = ids.filter((id) => !sql.exec('SELECT 1 FROM lolm WHERE id = ?', id).toArray().length).slice(0, perTick);
  let counted = 0;
  for (const id of fresh) {
    const m = await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/${id}`);
    sql.exec('INSERT OR IGNORE INTO lolm (id, at) VALUES (?, ?)', id, Date.now());
    if (countMatch(sql, m)) counted++;
  }
  // 오래된 경기 번호는 지운다 (30일)
  sql.exec('DELETE FROM lolm WHERE at < ?', Date.now() - 30 * 86_400_000);
  return { counted };
}

interface Row {
  k: string;
  g: number;
  w: number;
  kk: number;
  dd: number;
  aa: number;
  dmg: number;
  kp: number;
}
const rows = (sql: Sql, like: string) => sql.exec<Row & Record<string, SqlStorageValue>>('SELECT k, g, w, kk, dd, aa, dmg, kp FROM lolagg WHERE k LIKE ?', like).toArray();
const pat = (patch: string) => (patch === 'all' ? '%' : patch);

/** 패치 목록 (최근 것부터) · 패치마다 경기 수 */
export function metaPatches(sql: Sql): { patch: string; games: number }[] {
  return rows(sql, 'T|%')
    .map((r) => ({ patch: r.k.slice(2), games: r.g }))
    .sort((a, b) => {
      const [a1, a2] = a.patch.split('.').map(Number);
      const [b1, b2] = b.patch.split('.').map(Number);
      return b1 - a1 || b2 - a2;
    });
}

/** 티어표: 챔피언 · 포지션별 판 · 승 · 밴 (패치 하나 또는 all) */
export function metaTable(sql: Sql, patch: string) {
  const total = rows(sql, `T|${pat(patch)}`).reduce((s, r) => s + r.g, 0);
  const champ = new Map<string, { cid: number; pos: string; g: number; w: number; kk: number; dd: number; aa: number }>();
  for (const r of rows(sql, `C|${pat(patch)}|%`)) {
    const [, , cid, pos] = r.k.split('|');
    const key = `${cid}|${pos}`;
    const c = champ.get(key) ?? { cid: Number(cid), pos, g: 0, w: 0, kk: 0, dd: 0, aa: 0 };
    c.g += r.g;
    c.w += r.w;
    c.kk += r.kk;
    c.dd += r.dd;
    c.aa += r.aa;
    champ.set(key, c);
  }
  const bans: Record<number, number> = {};
  for (const r of rows(sql, `B|${pat(patch)}|%`)) {
    const cid = Number(r.k.split('|')[2]);
    bans[cid] = (bans[cid] ?? 0) + r.g;
  }
  return { total, rows: [...champ.values()], bans };
}

/** 챔피언 하나: 포지션 · 아이템 · 룬 · 스펠 · 맞상대(내 기록 + 상대 기록) */
export function metaChamp(sql: Sql, patch: string, cid: number) {
  const p = pat(patch);
  const sumBy = (list: Row[], keyOf: (parts: string[]) => string) => {
    const m = new Map<string, Row>();
    for (const r of list) {
      const key = keyOf(r.k.split('|'));
      const c = m.get(key) ?? { k: key, g: 0, w: 0, kk: 0, dd: 0, aa: 0, dmg: 0, kp: 0 };
      c.g += r.g;
      c.w += r.w;
      c.kk += r.kk;
      c.dd += r.dd;
      c.aa += r.aa;
      c.dmg += r.dmg;
      c.kp += r.kp;
      m.set(key, c);
    }
    return [...m.values()];
  };
  const total = rows(sql, `T|${p}`).reduce((s, r) => s + r.g, 0);
  const pos = sumBy(rows(sql, `C|${p}|${cid}|%`), (x) => x[3]);
  const items = sumBy(rows(sql, `I|${p}|${cid}|%`), (x) => `${x[3]}|${x[4]}`);
  const runes = sumBy(rows(sql, `R|${p}|${cid}|%`), (x) => `${x[3]}|${x[4]}`);
  const spells = sumBy(rows(sql, `S|${p}|${cid}|%`), (x) => `${x[3]}|${x[4]}`);
  const mine = sumBy(rows(sql, `M|${p}|${cid}|%`), (x) => `${x[3]}|${x[4]}`);
  // 상대 쪽 기록: 상대 챔프의 M 행 중 맞상대가 이 챔프인 것
  const theirs = sumBy(
    rows(sql, `M|${p}|%|%|${cid}`).filter((r) => r.k.split('|')[4] === String(cid)),
    (x) => `${x[3]}|${x[2]}`,
  );
  const bans = rows(sql, `B|${p}|${cid}`).reduce((s, r) => s + r.g, 0);
  return { total, bans, pos, items, runes, spells, mine, theirs };
}
