// NBA (balldontlie). 키는 Cloudflare 비밀값 「balldontlie」. 무료는 1분에 5번이라 accounts.ts 가 결과를 기억해 둔다.
// 문서 주소가 /v1/… 와 /nba/v1/… 두 가지로 보이고, 키를 「키」 그대로 / 「Bearer 키」 로 보내는 설명이 섞여 있어서
// 처음엔 차례로 해 보고, 된 조합을 기억해 둔다.
// 무료 플랜은 팀 · 선수 · 경기만 된다고 하고(경기 선수 기록은 유료), 순위 · 시즌 평균은 확실하지 않아서
// 안 되면(401 · 403) 「유료 플랜에서만」 이라고 알려 준다.
export interface NbaTeam {
  abbr: string;
  name: string;
  city: string;
  /** East · West (있으면) */
  conf?: string;
}
export interface NbaGame {
  id: number;
  date: string; // 미국 날짜 YYYY-MM-DD
  season?: number;
  home: NbaTeam;
  away: NbaTeam;
  homeScore: number;
  awayScore: number;
  /** 'Final' · '3rd Qtr' 같은 글, 시작 전이면 시작 시각(ISO) */
  status: string;
  period: number;
  time: string;
  /** 시작 시각 (ISO, 있으면) */
  start?: string;
}
export interface NbaStanding {
  abbr: string;
  name: string;
  city: string;
  conf: string;
  w: number;
  l: number;
}
export interface NbaLine {
  playerId: number;
  name: string;
  pos: string;
  team: string;
  min: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  tov: number;
  pf: number;
}
export interface NbaAverage {
  gp: number;
  min: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
  tov: number;
}

const s = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const team = (t: unknown): NbaTeam => {
  const o = (t ?? {}) as Record<string, unknown>;
  return { abbr: s(o.abbreviation), name: s(o.name) || s(o.full_name), city: s(o.city), conf: s(o.conference) || undefined };
};
const rows = (json: unknown) => (((json as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[]).filter((x) => x && typeof x === 'object');

export function parseGames(json: unknown): NbaGame[] {
  return rows(json).map((g) => {
    const status = s(g.status);
    const iso = s(g.datetime) || (/^\d{4}-\d{2}-\d{2}T/.test(status) ? status : '');
    return { id: n(g.id), date: s(g.date).slice(0, 10), season: n(g.season) || undefined, home: team(g.home_team), away: team(g.visitor_team), homeScore: n(g.home_team_score), awayScore: n(g.visitor_team_score), status, period: n(g.period), time: s(g.time).trim(), start: iso || undefined };
  });
}

export function parseLines(json: unknown): NbaLine[] {
  return rows(json)
    .map((r) => {
      const p = (r.player ?? {}) as Record<string, unknown>;
      const t = (r.team ?? {}) as Record<string, unknown>;
      return {
        playerId: n(p.id),
        name: `${s(p.first_name)} ${s(p.last_name)}`.trim(),
        pos: s(p.position),
        team: s(t.abbreviation),
        min: s(r.min),
        pts: n(r.pts),
        reb: n(r.reb),
        ast: n(r.ast),
        stl: n(r.stl),
        blk: n(r.blk),
        fgm: n(r.fgm),
        fga: n(r.fga),
        fg3m: n(r.fg3m),
        fg3a: n(r.fg3a),
        ftm: n(r.ftm),
        fta: n(r.fta),
        tov: n(r.turnover),
        pf: n(r.pf),
      };
    })
    .filter((l) => l.name);
}

export function parseAverage(json: unknown): NbaAverage | null {
  const r = rows(json)[0];
  if (!r) return null;
  // 새 판은 stats 안에 들어 있기도 해서 둘 다 본다
  const o = (r.stats && typeof r.stats === 'object' ? r.stats : r) as Record<string, unknown>;
  return { gp: n(o.games_played ?? o.gp), min: s(o.min), pts: n(o.pts), reb: n(o.reb), ast: n(o.ast), stl: n(o.stl), blk: n(o.blk), fgPct: n(o.fg_pct), fg3Pct: n(o.fg3_pct), ftPct: n(o.ft_pct), tov: n(o.turnover ?? o.tov) };
}

/** 경기 목록으로 순위 만들기 (끝난 경기만) */
export function standingsFrom(games: NbaGame[]): NbaStanding[] {
  const m = new Map<string, NbaStanding>();
  const get = (t: NbaTeam) => m.get(t.abbr) ?? m.set(t.abbr, { abbr: t.abbr, name: t.name, city: t.city, conf: t.conf ?? '', w: 0, l: 0 }).get(t.abbr)!;
  for (const g of games) {
    if (!/final/i.test(g.status) || !g.home.abbr || !g.away.abbr) continue;
    const h = get(g.home);
    const a = get(g.away);
    if (g.homeScore > g.awayScore) (h.w++, a.l++);
    else if (g.awayScore > g.homeScore) (a.w++, h.l++);
  }
  return [...m.values()];
}

export function parseStandings(json: unknown): NbaStanding[] {
  return rows(json)
    .map((r) => {
      const t = team(r.team);
      return { abbr: t.abbr, name: t.name, city: t.city, conf: s(r.conference) || t.conf || '', w: n(r.wins), l: n(r.losses) };
    })
    .filter((x) => x.abbr);
}

export class Paid extends Error {}

let combo: { prefix: string; bearer: boolean } | null = null;
/** balldontlie 부르기. 된 주소·키 모양을 기억한다. 429 는 잠깐 막힘, 그 조합으로도 401·403 이면 유료 */
export async function bdl(key: string, path: string, query: string): Promise<unknown> {
  const tries = combo
    ? [combo]
    : [
        { prefix: '/v1', bearer: false },
        { prefix: '/v1', bearer: true },
        { prefix: '/nba/v1', bearer: false },
        { prefix: '/nba/v1', bearer: true },
      ];
  let last = '';
  for (const t of tries) {
    const res = await fetch(`https://api.balldontlie.io${t.prefix}${path}?${query}`, { headers: { authorization: t.bearer ? `Bearer ${key}` : key } });
    if (res.ok) {
      combo = t;
      return res.json();
    }
    last = `${res.status} ${(await res.text()).slice(0, 100)}`;
    console.error('nba call failed', t.prefix + path, t.bearer ? 'bearer' : 'key', last);
    if (res.status === 429) throw new Error('잠깐 막혔어요 (1분에 5번까지예요)');
    if (combo && (res.status === 401 || res.status === 403)) throw new Paid('balldontlie 무료 플랜에서는 안 되는 기능이에요 (유료 플랜에서만)');
    if (res.status !== 401 && res.status !== 404) throw new Error(`NBA ${last}`);
  }
  throw new Error(`NBA ${last}`);
}

export const fetchGames = async (key: string, date: string) => parseGames(await bdl(key, '/games', `dates[]=${date}&per_page=100`));

/** 한 시즌 경기 한 쪽 (cursor 로 이어 받기) */
export async function seasonPage(key: string, season: number, cursor?: number): Promise<{ games: NbaGame[]; next?: number }> {
  const j = (await bdl(key, '/games', `seasons[]=${season}&per_page=100${cursor ? `&cursor=${cursor}` : ''}`)) as { meta?: { next_cursor?: unknown } };
  const next = n(j?.meta?.next_cursor);
  return { games: parseGames(j), next: next || undefined };
}

export const fetchStandings = async (key: string, season: number) => parseStandings(await bdl(key, '/standings', `season=${season}`));
export const fetchBox = async (key: string, gameId: number) => parseLines(await bdl(key, '/stats', `game_ids[]=${gameId}&per_page=100`));
export const fetchAverage = async (key: string, playerId: number, season: number) => parseAverage(await bdl(key, '/season_averages', `season=${season}&player_id=${playerId}&player_ids[]=${playerId}`));

/** 날짜(미국) → 시즌 (10월에 시작하는 해) */
export const seasonOf = (date: string) => (Number(date.slice(5, 7)) >= 9 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1);
