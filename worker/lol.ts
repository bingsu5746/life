// 리그 오브 레전드 (Riot API, 키는 Cloudflare 비밀값 「riot」, 머리글 X-Riot-Token). 한국 서버:
// - 계정 asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{이름}/{태그} → puuid
// - 소환사 kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{puuid} → profileIconId · summonerLevel
// - 랭크 kr.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid} → [{ queueType, tier, rank, leaguePoints, wins, losses }]
// - 숙련도 kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}/top?count=
// - 경기 asia.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?start=&count= · /lol/match/v5/matches/{id}
// 챔피언 이름 · 그림은 Data Dragon (ddragon.leagueoflegends.com, 키 없음)
import { within } from './nba';

export class RiotError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function riot(key: string, url: string): Promise<unknown> {
  const res = await within(fetch(url, { headers: { 'X-Riot-Token': key } }), 15_000, 'Riot');
  if (res.status === 404) throw new RiotError('찾을 수 없어요', 404);
  if (res.status === 429) throw new RiotError('Riot 이 잠깐 막았어요 (횟수). 2분 뒤 다시 해 주세요', 429);
  if (res.status === 401 || res.status === 403) throw new RiotError('Riot 키가 맞지 않거나 기한이 지났어요 (개발용 키는 하루마다 새로 받아야 해요)', 403);
  if (!res.ok) throw new RiotError(`Riot ${res.status}`, res.status);
  return res.json();
}

export interface LolProfile {
  puuid: string;
  gameName: string;
  tagLine: string;
  level: number;
  icon: number;
  ranks: { queue: string; tier: string; rank: string; lp: number; wins: number; losses: number }[];
  mastery: { champ: number; level: number; points: number; last: number }[];
}
export async function lolProfile(key: string, gameName: string, tagLine: string): Promise<LolProfile> {
  const acc = (await riot(key, `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`)) as { puuid: string; gameName?: string; tagLine?: string };
  const [sum, league, mastery] = await Promise.all([
    riot(key, `https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${acc.puuid}`) as Promise<{ profileIconId?: number; summonerLevel?: number }>,
    riot(key, `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${acc.puuid}`).catch(() => []) as Promise<{ queueType?: string; tier?: string; rank?: string; leaguePoints?: number; wins?: number; losses?: number }[]>,
    riot(key, `https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${acc.puuid}/top?count=10`).catch(() => []) as Promise<{ championId?: number; championLevel?: number; championPoints?: number; lastPlayTime?: number }[]>,
  ]);
  return {
    puuid: acc.puuid,
    gameName: acc.gameName ?? gameName,
    tagLine: acc.tagLine ?? tagLine,
    level: sum.summonerLevel ?? 0,
    icon: sum.profileIconId ?? 0,
    ranks: (Array.isArray(league) ? league : []).map((x) => ({ queue: x.queueType ?? '', tier: x.tier ?? '', rank: x.rank ?? '', lp: x.leaguePoints ?? 0, wins: x.wins ?? 0, losses: x.losses ?? 0 })),
    mastery: (Array.isArray(mastery) ? mastery : []).map((x) => ({ champ: x.championId ?? 0, level: x.championLevel ?? 0, points: x.championPoints ?? 0, last: x.lastPlayTime ?? 0 })),
  };
}

/** 경기 한 판을 내 기록만 짧게 */
export interface LolGame {
  id: string;
  at: number;
  dur: number;
  q: number;
  win: boolean;
  /** 다시하기(4분 안 끝난 판) */
  remake: boolean;
  champ: string;
  cid: number;
  pos: string;
  k: number;
  d: number;
  a: number;
  cs: number;
  gold: number;
  dmg: number;
  taken: number;
  vision: number;
  wards: number;
  kp: number;
  items: number[];
  spells: number[];
  multi: number;
  penta: number;
  first: boolean;
  lvl: number;
  /** 팀에서 딜 순위 (1 = 가장 많이) */
  dmgRank: number;
}
type P = Record<string, unknown> & { puuid?: string; teamId?: number; championName?: string; championId?: number; kills?: number; deaths?: number; assists?: number; totalDamageDealtToChampions?: number };
export function toGame(id: string, m: unknown, puuid: string): LolGame | null {
  const info = (m as { info?: { gameCreation?: number; gameDuration?: number; queueId?: number; participants?: P[] } })?.info;
  const ps = info?.participants ?? [];
  const me = ps.find((p) => p.puuid === puuid);
  if (!info || !me) return null;
  const team = ps.filter((p) => p.teamId === me.teamId);
  const teamKills = team.reduce((s, p) => s + (p.kills ?? 0), 0);
  const n = (k: string) => (typeof me[k] === 'number' ? (me[k] as number) : 0);
  const dmg = n('totalDamageDealtToChampions');
  return {
    id,
    at: info.gameCreation ?? 0,
    dur: info.gameDuration ?? 0,
    q: info.queueId ?? 0,
    win: me.win === true,
    remake: me.gameEndedInEarlySurrender === true,
    champ: me.championName ?? '',
    cid: me.championId ?? 0,
    pos: String(me.teamPosition || me.individualPosition || ''),
    k: n('kills'),
    d: n('deaths'),
    a: n('assists'),
    cs: n('totalMinionsKilled') + n('neutralMinionsKilled'),
    gold: n('goldEarned'),
    dmg,
    taken: n('totalDamageTaken'),
    vision: n('visionScore'),
    wards: n('wardsPlaced'),
    kp: teamKills ? (n('kills') + n('assists')) / teamKills : 0,
    items: [0, 1, 2, 3, 4, 5, 6].map((i) => n(`item${i}`)),
    spells: [n('summoner1Id'), n('summoner2Id')],
    multi: n('largestMultiKill'),
    penta: n('pentaKills'),
    first: me.firstBloodKill === true,
    lvl: n('champLevel'),
    dmgRank: 1 + team.filter((p) => (p.totalDamageDealtToChampions ?? 0) > dmg).length,
  };
}

/** 새 경기를 받아 붙인다 (한 번에 max 판까지, Riot 횟수 한도 때문에). have: 이미 가진 경기 */
export async function lolNewGames(key: string, puuid: string, have: Set<string>, max = 30): Promise<{ games: LolGame[]; more: boolean }> {
  const ids: string[] = [];
  for (let start = 0; start < 300; start += 100) {
    const page = (await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=100`)) as string[];
    const fresh = page.filter((x) => !have.has(x));
    ids.push(...fresh);
    // 이미 가진 경기가 나오면 그 뒤는 예전 것
    if (fresh.length < page.length || page.length < 100 || ids.length >= max) break;
  }
  const games: LolGame[] = [];
  for (const id of ids.slice(0, max)) {
    try {
      const g = toGame(id, await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/${id}`), puuid);
      if (g) games.push(g);
    } catch (e) {
      if (e instanceof RiotError && e.status === 429) break;
    }
  }
  return { games, more: ids.length > max };
}

/** 예전 경기 더 받기 (start 번째부터, 올해 통계용) */
export async function lolOlderGames(key: string, puuid: string, have: Set<string>, start: number, max = 40): Promise<{ games: LolGame[]; end: boolean }> {
  const page = (await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=100`)) as string[];
  const ids = page.filter((x) => !have.has(x)).slice(0, max);
  const games: LolGame[] = [];
  for (const id of ids) {
    try {
      const g = toGame(id, await riot(key, `https://asia.api.riotgames.com/lol/match/v5/matches/${id}`), puuid);
      if (g) games.push(g);
    } catch (e) {
      if (e instanceof RiotError && e.status === 429) break;
    }
  }
  return { games, end: page.length < 100 && ids.length <= max };
}
