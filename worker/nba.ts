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
    const res = await within(fetch(`https://api.balldontlie.io${t.prefix}${path}?${query}`, { headers: { authorization: t.bearer ? `Bearer ${key}` : key }, signal: AbortSignal.timeout(10000) }), 11000, 'balldontlie');
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

// ===== NBA 공식 데이터 (키 없음). 주소 · 머리글 · 응답 모양은 nba_api 1.12.0 (swar/nba_api) 을 보고 맞췄다 =====
// - cdn.nba.com/static/json/liveData/… : 경기 선수 기록(boxscore) · 오늘 경기(todaysScoreboard)
// - stats.nba.com/stats/… : 날짜별 경기(scoreboardv3) · 순위(leaguestandingsv3) · 선수 시즌 평균(leaguedashplayerstats)
//   (nba_api 설명: stats.nba.com 은 클라우드 서버 주소에 답하지 않는 일이 많다 → 8초 안에 답이 없으면 다른 길로)
export const NBA_TEAM_IDS: Record<string, number> = {
  ATL: 1610612737,
  BOS: 1610612738,
  BKN: 1610612751,
  CHA: 1610612766,
  CHI: 1610612741,
  CLE: 1610612739,
  DAL: 1610612742,
  DEN: 1610612743,
  DET: 1610612765,
  GSW: 1610612744,
  HOU: 1610612745,
  IND: 1610612754,
  LAC: 1610612746,
  LAL: 1610612747,
  MEM: 1610612763,
  MIA: 1610612748,
  MIL: 1610612749,
  MIN: 1610612750,
  NOP: 1610612740,
  NYK: 1610612752,
  OKC: 1610612760,
  ORL: 1610612753,
  PHI: 1610612755,
  PHX: 1610612756,
  POR: 1610612757,
  SAC: 1610612758,
  SAS: 1610612759,
  TOR: 1610612761,
  UTA: 1610612762,
  WAS: 1610612764,
};
const ABBR_OF = Object.fromEntries(Object.entries(NBA_TEAM_IDS).map(([a, id]) => [id, a])) as Record<number, string>;

const CDN_HEADERS = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0', referer: 'https://www.nba.com/', accept: 'application/json, text/plain, */*' };
const STATS_HEADERS = { ...CDN_HEADERS, 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', origin: 'https://www.nba.com', 'accept-language': 'en-US,en;q=0.9' };

/** 정해진 시간 안에 안 끝나면 실패로 (바깥 서버가 답 없이 붙잡고 있어도 화면이 「받는 중」에 멈추지 않게) */
export function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error(`${what} 응답 없음 (${Math.round(ms / 1000)}초)`)), ms))]);
}
/** stats.nba.com 이 답하지 않으면 30분 동안은 묻지 않고 바로 다른 길로 (nba_api 설명: 클라우드 서버 주소에는 답하지 않는 일이 많다) */
let statsDownUntil = 0;
async function getNba(url: string, stats: boolean): Promise<unknown> {
  if (stats && Date.now() < statsDownUntil) throw new Error('stats.nba.com 이 우리 서버에 답하지 않아요 (잠시 쉬는 중)');
  try {
    return await within(
      (async () => {
        const res = await fetch(url, { headers: stats ? STATS_HEADERS : CDN_HEADERS, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`nba.com ${res.status}`);
        return res.json();
      })(),
      9000,
      stats ? 'stats.nba.com' : 'cdn.nba.com',
    );
  } catch (e) {
    if (stats) statsDownUntil = Date.now() + 30 * 60_000;
    throw e;
  }
}
/** stats.nba.com: nba_api 처럼 값 이름 차례대로 */
const statsUrl = (endpoint: string, params: Record<string, string>) =>
  `https://stats.nba.com/stats/${endpoint}?${Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')}`;
/** resultSets 의 표(이름이 없으면 첫 표) → 줄마다 { 이름: 값 } */
function resultRows(json: unknown, name?: string): Record<string, unknown>[] {
  type Set = { name?: string; headers?: string[]; rowSet?: unknown[][] };
  const j = json as { resultSets?: Set[] | Set; resultSet?: Set };
  const rs = Array.isArray(j?.resultSets) ? (name ? j.resultSets.find((x) => x.name === name) : j.resultSets[0]) : (j?.resultSets ?? j?.resultSet);
  const h = rs?.headers ?? [];
  return (rs?.rowSet ?? []).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
/** 시즌 글자: 2026 → 2026-27 */
export const seasonText = (season: number) => `${season}-${String((season + 1) % 100).padStart(2, '0')}`;

/** 날짜(미국) · 홈 · 원정 약자로 NBA 경기 번호 찾기: 날짜별 경기(stats) → 안 되면 오늘 경기(cdn) */
export async function nbaGameId(date: string, home: string, away: string): Promise<string | null> {
  const pick = (games: unknown[]) => {
    const g = (games as { gameId?: string; homeTeam?: { teamTricode?: string }; awayTeam?: { teamTricode?: string } }[]).find((x) => x.homeTeam?.teamTricode === home && x.awayTeam?.teamTricode === away);
    return g?.gameId ?? null;
  };
  try {
    const j = (await getNba(statsUrl('scoreboardv3', { GameDate: date, LeagueID: '00' }), true)) as { scoreboard?: { games?: unknown[] } };
    const id = pick(j?.scoreboard?.games ?? []);
    if (id) return id;
  } catch (e) {
    console.error('nba.com scoreboardv3 failed', date, e instanceof Error ? e.message : String(e));
  }
  const t = (await getNba('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', false)) as { scoreboard?: { games?: unknown[] } };
  return pick(t?.scoreboard?.games ?? []);
}

/** "PT25M01.00S" → "25:01" */
const clock = (v: unknown) => {
  const m = s(v).match(/PT(\d+)M(\d+)/);
  return m ? `${Number(m[1])}:${m[2].padStart(2, '0')}` : s(v);
};
export function parseNbaBox(json: unknown): NbaLine[] {
  const g = (json as { game?: Record<string, unknown> })?.game ?? {};
  const out: NbaLine[] = [];
  for (const side of ['awayTeam', 'homeTeam']) {
    const t = (g[side] ?? {}) as { teamTricode?: string; players?: Record<string, unknown>[] };
    for (const p of t.players ?? []) {
      const st = (p.statistics ?? {}) as Record<string, unknown>;
      out.push({
        playerId: n(p.personId),
        name: s(p.name) || `${s(p.firstName)} ${s(p.familyName)}`.trim(),
        pos: s(p.position),
        team: s(t.teamTricode),
        min: clock(st.minutes),
        pts: n(st.points),
        reb: n(st.reboundsTotal),
        ast: n(st.assists),
        stl: n(st.steals),
        blk: n(st.blocks),
        fgm: n(st.fieldGoalsMade),
        fga: n(st.fieldGoalsAttempted),
        fg3m: n(st.threePointersMade),
        fg3a: n(st.threePointersAttempted),
        ftm: n(st.freeThrowsMade),
        fta: n(st.freeThrowsAttempted),
        tov: n(st.turnovers),
        pf: n(st.foulsPersonal),
      });
    }
  }
  return out.filter((l) => l.name);
}
export const fetchNbaBox = async (gameId: string) => parseNbaBox(await getNba(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`, false));

export async function fetchNbaStandings(season: number): Promise<NbaStanding[]> {
  const rows = resultRows(await getNba(statsUrl('leaguestandingsv3', { LeagueID: '00', Season: seasonText(season), SeasonType: 'Regular Season', SeasonYear: '' }), true));
  return rows.map((r) => ({ abbr: ABBR_OF[n(r.TeamID)] ?? '', name: s(r.TeamName), city: s(r.TeamCity), conf: s(r.Conference), w: n(r.WINS), l: n(r.LOSSES) })).filter((x) => x.abbr);
}

export interface NbaPlayerAvg extends NbaAverage {
  id: number;
  name: string;
  team: string;
  age: number;
  fg3m: number;
}
/** 이번 시즌 모든 선수의 경기당 평균 (한 번에 받아 기억해 두고 찾는다) */
export async function fetchNbaAverages(season: number): Promise<NbaPlayerAvg[]> {
  const blank = [
    'College',
    'Conference',
    'Country',
    'DateFrom',
    'DateTo',
    'Division',
    'DraftPick',
    'DraftYear',
    'GameScope',
    'GameSegment',
    'Height',
    'ISTRound',
    'Location',
    'Outcome',
    'PORound',
    'PlayerExperience',
    'PlayerPosition',
    'SeasonSegment',
    'ShotClockRange',
    'StarterBench',
    'TeamID',
    'TwoWay',
    'VsConference',
    'VsDivision',
    'Weight',
  ];
  const params: Record<string, string> = { LastNGames: '0', LeagueID: '00', MeasureType: 'Base', Month: '0', OpponentTeamID: '0', PaceAdjust: 'N', PerMode: 'PerGame', Period: '0', PlusMinus: 'N', Rank: 'N', Season: seasonText(season), SeasonType: 'Regular Season' };
  for (const k of blank) params[k] = '';
  return resultRows(await getNba(statsUrl('leaguedashplayerstats', params), true)).map((r) => ({
    id: n(r.PLAYER_ID),
    name: s(r.PLAYER_NAME),
    team: s(r.TEAM_ABBREVIATION),
    age: n(r.AGE),
    fg3m: n(r.FG3M),
    gp: n(r.GP),
    min: n(r.MIN).toFixed(1),
    pts: n(r.PTS),
    reb: n(r.REB),
    ast: n(r.AST),
    stl: n(r.STL),
    blk: n(r.BLK),
    fgPct: n(r.FG_PCT),
    fg3Pct: n(r.FG3_PCT),
    ftPct: n(r.FT_PCT),
    tov: n(r.TOV),
  }));
}

export interface NbaRosterPlayer {
  id: number;
  name: string;
  num: string;
  pos: string;
  height: string;
  weight: string;
  age: number;
  exp: string;
  school: string;
}
/** 팀 로스터 (commonteamroster) */
export async function fetchNbaRoster(abbr: string, season: number): Promise<NbaRosterPlayer[]> {
  const id = NBA_TEAM_IDS[abbr];
  if (!id) throw new Error('팀을 확인해 주세요');
  return resultRows(await getNba(statsUrl('commonteamroster', { LeagueID: '00', Season: seasonText(season), TeamID: String(id) }), true), 'CommonTeamRoster').map((r) => ({
    id: n(r.PLAYER_ID),
    name: s(r.PLAYER),
    num: s(r.NUM),
    pos: s(r.POSITION),
    height: s(r.HEIGHT),
    weight: s(r.WEIGHT),
    age: n(r.AGE),
    exp: s(r.EXP),
    school: s(r.SCHOOL),
  }));
}

export interface NbaCareerRow {
  season: string;
  team: string;
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
}
/** 선수 커리어 (정규시즌 시즌별 경기당 평균, playercareerstats) */
export async function fetchNbaCareer(playerId: number): Promise<NbaCareerRow[]> {
  return resultRows(await getNba(statsUrl('playercareerstats', { LeagueID: '00', PerMode: 'PerGame', PlayerID: String(playerId) }), true), 'SeasonTotalsRegularSeason').map((r) => ({
    season: s(r.SEASON_ID),
    team: s(r.TEAM_ABBREVIATION),
    gp: n(r.GP),
    min: n(r.MIN),
    pts: n(r.PTS),
    reb: n(r.REB),
    ast: n(r.AST),
    stl: n(r.STL),
    blk: n(r.BLK),
    fgPct: n(r.FG_PCT),
    fg3Pct: n(r.FG3_PCT),
    ftPct: n(r.FT_PCT),
  }));
}

/** 로스터 (stats.nba.com 이 안 될 때): balldontlie 팀 번호를 찾아 그 팀 선수 (무료 기능: 팀 · 선수) */
let bdlTeams: Record<string, number> | null = null;
export async function fetchBdlRoster(key: string, abbr: string): Promise<NbaRosterPlayer[]> {
  if (!bdlTeams) {
    const t = rows(await bdl(key, '/teams', 'per_page=100'));
    bdlTeams = Object.fromEntries(t.map((x) => [s(x.abbreviation), n(x.id)]));
  }
  const id = bdlTeams[abbr];
  if (!id) throw new Error('팀을 찾지 못했어요');
  return rows(await bdl(key, '/players', `team_ids[]=${id}&per_page=100`)).map((p) => ({ id: 0, name: `${s(p.first_name)} ${s(p.last_name)}`.trim(), num: s(p.jersey_number), pos: s(p.position), height: s(p.height), weight: s(p.weight), age: 0, exp: '', school: s(p.college) }));
}
