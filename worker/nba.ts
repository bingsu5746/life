// NBA 경기 (balldontlie). 키는 Cloudflare 비밀값 「balldontlie」.
// 무료는 1분에 5번이라 날짜별로 기억해 두고 쓴다 (accounts.ts).
// 문서 주소가 /v1/games 와 /nba/v1/games 두 가지로 보이고, 키를 「키」 그대로 / 「Bearer 키」 로 보내는 설명이 섞여 있어서 차례로 해 본다.
export interface NbaTeam {
  abbr: string;
  name: string;
  city: string;
}
export interface NbaGame {
  id: number;
  date: string; // 미국 날짜 YYYY-MM-DD
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

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const team = (t: unknown): NbaTeam => {
  const o = (t ?? {}) as Record<string, unknown>;
  return { abbr: s(o.abbreviation), name: s(o.name) || s(o.full_name), city: s(o.city) };
};

export function parseGames(json: unknown): NbaGame[] {
  const data = (json as { data?: unknown[] })?.data ?? [];
  return data
    .map((g) => g as Record<string, unknown>)
    .filter((g) => g && typeof g === 'object')
    .map((g) => {
      const status = s(g.status);
      const iso = s(g.datetime) || (/^\d{4}-\d{2}-\d{2}T/.test(status) ? status : '');
      return { id: n(g.id), date: s(g.date).slice(0, 10), home: team(g.home_team), away: team(g.visitor_team), homeScore: n(g.home_team_score), awayScore: n(g.visitor_team_score), status, period: n(g.period), time: s(g.time).trim(), start: iso || undefined };
    });
}

export async function fetchGames(key: string, date: string): Promise<NbaGame[]> {
  const q = `dates[]=${date}&per_page=100`;
  let last = '';
  for (const path of ['/v1/games', '/nba/v1/games'])
    for (const auth of [key, `Bearer ${key}`]) {
      const res = await fetch(`https://api.balldontlie.io${path}?${q}`, { headers: { authorization: auth } });
      if (res.ok) return parseGames(await res.json());
      last = `${res.status} ${(await res.text()).slice(0, 100)}`;
      console.error('nba try failed', path, auth === key ? 'key' : 'bearer', last);
      if (res.status === 429) throw new Error('잠깐 막혔어요 (1분에 5번까지예요)');
      // 키 모양이 틀린 것(401)은 다른 모양으로, 주소가 없는 것(404)은 다른 주소로
      if (res.status !== 401 && res.status !== 404) throw new Error(`NBA ${last}`);
    }
  throw new Error(`NBA ${last}`);
}
