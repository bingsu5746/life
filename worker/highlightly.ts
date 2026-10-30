// Highlightly NBA & NCAAB API (nba.highlightly.net). 키는 Cloudflare 비밀값 「Highlightly」, 머리글 x-rapidapi-key.
// 주소 · 응답 모양은 문서(highlightly.net/nba-api/documentation, OpenAPI docs.json 4.1.4)를 보고 맞췄다:
// - GET /matches?league=NBA&date=YYYY-MM-DD&timezone=… → { data: [{ id, homeTeam{name,displayName,abbreviation}, awayTeam{…}, state, date }], pagination, plan }
// - GET /box-score/{matchId} → [홈팀, 원정팀] 각 { name, boxScores: [{ player{id,name,jersey}, statistics: [{ name, value }] }] }
//   통계 이름은 문서 예: Total Minutes Played · Total Points Scored · Successful Field Goals (FGM) · Total Field Goals (FGA) …
// - GET /players?name=… → { data: [{ id, fullName }] } · GET /players/{id}/statistics → [{ perSeason: [{ season, seasonBreakdown, stats: [{ name, value, category }] }] }]
// 무료 플랜은 일부 결과가 숨겨질 수 있다고 문서에 있다 (plan.message)
import type { NbaLine } from './nba';

const BASE = 'https://nba.highlightly.net';

async function hl(key: string, path: string): Promise<unknown> {
  const res = await Promise.race([fetch(`${BASE}${path}`, { headers: { 'x-rapidapi-key': key }, signal: AbortSignal.timeout(10000) }), new Promise<never>((_, no) => setTimeout(() => no(new Error('Highlightly 응답 없음 (11초)')), 11000))]);
  if (!res.ok) throw new Error(`Highlightly ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

const s = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

interface HlTeam {
  name?: string;
  displayName?: string;
  abbreviation?: string;
}
/** 우리 팀(약자 · 이름)과 Highlightly 팀이 같은지: 약자가 같거나, 이름(Lakers)이 같거나, 전체 이름이 그 이름으로 끝나면 */
export function sameTeam(t: HlTeam | undefined, abbr: string, name: string): boolean {
  if (!t) return false;
  if (t.abbreviation && norm(t.abbreviation) === norm(abbr)) return true;
  const nm = norm(name);
  return !!nm && (norm(t.name ?? '') === nm || norm(t.displayName ?? '').endsWith(nm));
}

/** 미국 날짜 · 두 팀으로 Highlightly 경기 번호 찾기 */
export async function hlMatchId(key: string, date: string, home: { abbr: string; name: string }, away: { abbr: string; name: string }): Promise<number | null> {
  const j = (await hl(key, `/matches?${new URLSearchParams({ league: 'NBA', date, timezone: 'America/New_York', limit: '50' })}`)) as { data?: { id?: unknown; homeTeam?: HlTeam; awayTeam?: HlTeam }[] };
  const m = (j?.data ?? []).find((x) => sameTeam(x.homeTeam, home.abbr, home.name) && sameTeam(x.awayTeam, away.abbr, away.name));
  return m ? n(m.id) || null : null;
}

/** 박스스코어 통계 이름 → 우리 칸 (문서에 나온 이름 기준) */
function pick(stats: { name?: unknown; value?: unknown }[], ...names: RegExp[]): unknown {
  for (const re of names) {
    const hit = stats.find((x) => re.test(s(x.name)));
    if (hit) return hit.value;
  }
  return undefined;
}
export function parseHlBox(json: unknown, abbrOf: (teamName: string) => string): NbaLine[] {
  const teams = (Array.isArray(json) ? json : []) as { name?: unknown; boxScores?: { player?: { id?: unknown; name?: unknown; jersey?: unknown }; statistics?: { name?: unknown; value?: unknown }[] }[] }[];
  const out: NbaLine[] = [];
  for (const t of teams) {
    const team = abbrOf(s(t.name));
    for (const b of t.boxScores ?? []) {
      const st = b.statistics ?? [];
      out.push({
        playerId: n(b.player?.id),
        name: s(b.player?.name),
        pos: '',
        team,
        min: s(pick(st, /minutes played/i)),
        pts: n(pick(st, /points scored/i)),
        reb: n(pick(st, /^total rebounds/i)),
        ast: n(pick(st, /assists/i)),
        stl: n(pick(st, /steals/i)),
        blk: n(pick(st, /blocks/i)),
        fgm: n(pick(st, /successful field goals/i)),
        fga: n(pick(st, /^total field goals/i)),
        fg3m: n(pick(st, /successful 3pt/i)),
        fg3a: n(pick(st, /total 3pt/i)),
        ftm: n(pick(st, /successful free throws/i)),
        fta: n(pick(st, /total free throws/i)),
        tov: n(pick(st, /turnovers/i)),
        pf: n(pick(st, /fouls/i)),
      });
    }
  }
  return out.filter((l) => l.name);
}
export const fetchHlBox = async (key: string, matchId: number, abbrOf: (teamName: string) => string) => parseHlBox(await hl(key, `/box-score/${matchId}`), abbrOf);

export interface HlSeason {
  season: number;
  kind: string;
  team: string;
  stats: { name: string; value: number; category: string }[];
}
/** 선수 이름 → Highlightly 선수 → 시즌별 기록 (정규시즌만, 최근 것부터) */
export async function fetchHlPlayerSeasons(key: string, name: string): Promise<{ id: number; seasons: HlSeason[] } | null> {
  const list = (await hl(key, `/players?${new URLSearchParams({ name, limit: '10' })}`)) as { data?: { id?: unknown; fullName?: unknown }[] };
  const want = norm(name);
  const p = (list?.data ?? []).find((x) => norm(s(x.fullName)) === want) ?? (list?.data ?? [])[0];
  const id = n(p?.id);
  if (!id) return null;
  const j = (await hl(key, `/players/${id}/statistics`)) as { perSeason?: { season?: unknown; seasonBreakdown?: unknown; teams?: { abbreviation?: unknown }[]; stats?: { name?: unknown; value?: unknown; category?: unknown }[] }[] }[];
  const per = (Array.isArray(j) ? j[0]?.perSeason : []) ?? [];
  const seasons = per
    .map((x) => ({
      season: n(x.season),
      kind: s(x.seasonBreakdown),
      team: (x.teams ?? [])
        .map((t) => s(t.abbreviation))
        .filter(Boolean)
        .join('/'),
      stats: (x.stats ?? []).map((st) => ({ name: s(st.name), value: n(st.value), category: s(st.category) })).filter((st) => st.name),
    }))
    .filter((x) => x.season && !/entire/i.test(x.kind))
    .sort((a, b) => b.season - a.season);
  return { id, seasons };
}

/** 순위 (동부 · 서부). 통계 이름에서 승 · 패를 찾는다 (못 찾으면 빈 목록 → 다른 길) */
export async function fetchHlStandings(key: string, abbrOfName: (name: string, abbr: string) => string): Promise<{ abbr: string; name: string; city: string; conf: string; w: number; l: number }[]> {
  const out: { abbr: string; name: string; city: string; conf: string; w: number; l: number }[] = [];
  for (const [ab, conf] of [
    ['EAST', 'East'],
    ['WEST', 'West'],
  ]) {
    const j = (await hl(key, `/standings?${new URLSearchParams({ abbreviation: ab, leagueType: 'NBA', limit: '5' })}`)) as { data?: { year?: unknown; data?: { team?: HlTeam; statistics?: { value?: unknown; displayName?: unknown }[] }[] }[] };
    const latest = (j?.data ?? []).slice().sort((a, b) => n(b.year) - n(a.year))[0];
    for (const r of latest?.data ?? []) {
      const st = r.statistics ?? [];
      const get = (re: RegExp) => st.find((x) => re.test(s(x.displayName).trim()));
      const w = get(/^(wins?|w)$/i);
      const l = get(/^(loss(es)?|l)$/i);
      if (!w || !l) continue;
      const abbr = abbrOfName(s(r.team?.name), s(r.team?.abbreviation));
      if (abbr) out.push({ abbr, name: s(r.team?.name), city: '', conf, w: n(w.value), l: n(l.value) });
    }
  }
  return out;
}
