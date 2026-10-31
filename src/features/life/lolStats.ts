// 롤 통계: 서버에 모아 둔 경기(LolGame)로 op.gg · 한 해 결산처럼
export interface LolGame {
  id: string;
  at: number;
  dur: number;
  q: number;
  win: boolean;
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
  dmgRank: number;
}

/** 큐 번호 → 이름 (Riot 문서의 큐 목록 중 자주 쓰는 것) */
export const QUEUE: Record<number, string> = { 420: '솔로랭크', 440: '자유랭크', 400: '일반', 430: '일반', 490: '빠른 대전', 450: '칼바람', 1700: '아레나', 900: 'URF', 1900: 'URF', 830: 'AI 대전', 840: 'AI 대전', 850: 'AI 대전', 0: '사용자 설정' };
export const queueName = (q: number) => QUEUE[q] ?? `기타 (${q})`;
export type QueueFilter = 'all' | 'solo' | 'flex' | 'normal' | 'aram';
export const QUEUE_FILTER: Record<QueueFilter, (q: number) => boolean> = {
  all: () => true,
  solo: (q) => q === 420,
  flex: (q) => q === 440,
  normal: (q) => q === 400 || q === 430 || q === 490,
  aram: (q) => q === 450,
};
export const POS: Record<string, string> = { TOP: '탑', JUNGLE: '정글', MIDDLE: '미드', BOTTOM: '원딜', UTILITY: '서폿' };

export const kda = (k: number, d: number, a: number) => (d ? (k + a) / d : k + a);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export interface LolSummary {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  k: number;
  d: number;
  a: number;
  kda: number;
  csMin: number;
  kp: number;
  dmg: number;
  dmgMin: number;
  vision: number;
  goldMin: number;
  minutes: number;
}
/** 다시하기 판은 빼고 */
export function summary(games: LolGame[]): LolSummary {
  const g = games.filter((x) => !x.remake);
  const wins = g.filter((x) => x.win).length;
  const k = avg(g.map((x) => x.k)),
    d = avg(g.map((x) => x.d)),
    a = avg(g.map((x) => x.a));
  const mins = g.reduce((s, x) => s + x.dur / 60, 0);
  return {
    games: g.length,
    wins,
    losses: g.length - wins,
    winRate: g.length ? (wins / g.length) * 100 : 0,
    k,
    d,
    a,
    kda: kda(k, d, a),
    csMin: mins ? g.reduce((s, x) => s + x.cs, 0) / mins : 0,
    kp: avg(g.map((x) => x.kp)) * 100,
    dmg: avg(g.map((x) => x.dmg)),
    dmgMin: mins ? g.reduce((s, x) => s + x.dmg, 0) / mins : 0,
    vision: avg(g.map((x) => x.vision)),
    goldMin: mins ? g.reduce((s, x) => s + x.gold, 0) / mins : 0,
    minutes: mins,
  };
}

/** 모스트 챔피언 (판 수 순) */
export function byChampion(games: LolGame[]): ({ champ: string; cid: number } & LolSummary)[] {
  const m = new Map<string, LolGame[]>();
  for (const g of games) if (!g.remake) m.set(g.champ, [...(m.get(g.champ) ?? []), g]);
  return [...m.values()].map((list) => ({ champ: list[0].champ, cid: list[0].cid, ...summary(list) })).sort((a, b) => b.games - a.games || b.winRate - a.winRate);
}

/** 포지션별 (판 수 순) */
export function byPosition(games: LolGame[]): { pos: string; games: number; winRate: number; kda: number }[] {
  const m = new Map<string, LolGame[]>();
  for (const g of games) if (!g.remake && POS[g.pos]) m.set(g.pos, [...(m.get(g.pos) ?? []), g]);
  return [...m]
    .map(([pos, list]) => {
      const s = summary(list);
      return { pos, games: s.games, winRate: s.winRate, kda: s.kda };
    })
    .sort((a, b) => b.games - a.games);
}

/** 연승 · 연패: 지금 몇 연속인지 · 가장 길었던 것 */
export function streaks(games: LolGame[]): { now: number; nowWin: boolean; bestWin: number; bestLose: number } {
  const g = games.filter((x) => !x.remake).sort((a, b) => b.at - a.at);
  let now = 0;
  const nowWin = g[0]?.win ?? false;
  for (const x of g) {
    if (x.win !== nowWin) break;
    now++;
  }
  let bestWin = 0,
    bestLose = 0,
    run = 0,
    last: boolean | null = null;
  for (const x of [...g].reverse()) {
    run = x.win === last ? run + 1 : 1;
    last = x.win;
    if (x.win) bestWin = Math.max(bestWin, run);
    else bestLose = Math.max(bestLose, run);
  }
  return { now, nowWin, bestWin, bestLose };
}

/** 시간대별 (한국 시간 0~23시를 4칸으로) · 요일별 승률 */
export function byHour(games: LolGame[]): { label: string; games: number; winRate: number }[] {
  const slots = [
    ['새벽 (0~6시)', 0, 6],
    ['오전 (6~12시)', 6, 12],
    ['오후 (12~18시)', 12, 18],
    ['저녁 (18~24시)', 18, 24],
  ] as const;
  return slots.map(([label, a, b]) => {
    const list = games.filter((g) => {
      const h = new Date(g.at + 9 * 3600_000).getUTCHours();
      return !g.remake && h >= a && h < b;
    });
    return { label, games: list.length, winRate: list.length ? (list.filter((g) => g.win).length / list.length) * 100 : 0 };
  });
}
export function byWeekday(games: LolGame[]): { label: string; games: number; winRate: number }[] {
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  return names.map((label, i) => {
    const list = games.filter((g) => !g.remake && new Date(g.at + 9 * 3600_000).getUTCDay() === i);
    return { label, games: list.length, winRate: list.length ? (list.filter((g) => g.win).length / list.length) * 100 : 0 };
  });
}

/** 한 해 결산 */
export interface LolYear {
  year: number;
  games: number;
  hours: number;
  wins: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  pentas: number;
  quadras: number;
  firstBloods: number;
  champs: number;
  most?: { champ: string; cid: number; games: number; winRate: number };
  bestChamp?: { champ: string; cid: number; games: number; winRate: number; kda: number };
  pos?: string;
  best?: LolGame;
  longest?: LolGame;
  months: { month: number; games: number; winRate: number }[];
  first: number;
}
export function yearRecap(all: LolGame[], year: number): LolYear {
  const g = all.filter((x) => !x.remake && new Date(x.at + 9 * 3600_000).getUTCFullYear() === year);
  const champs = byChampion(g);
  const good = champs.filter((c) => c.games >= 5).sort((a, b) => b.winRate - a.winRate || b.kda - a.kda)[0];
  const wins = g.filter((x) => x.win).length;
  return {
    year,
    games: g.length,
    hours: g.reduce((s, x) => s + x.dur, 0) / 3600,
    wins,
    winRate: g.length ? (wins / g.length) * 100 : 0,
    kills: g.reduce((s, x) => s + x.k, 0),
    deaths: g.reduce((s, x) => s + x.d, 0),
    assists: g.reduce((s, x) => s + x.a, 0),
    pentas: g.reduce((s, x) => s + x.penta, 0),
    quadras: g.filter((x) => x.multi >= 4).length,
    firstBloods: g.filter((x) => x.first).length,
    champs: champs.length,
    most: champs[0] && { champ: champs[0].champ, cid: champs[0].cid, games: champs[0].games, winRate: champs[0].winRate },
    bestChamp: good && { champ: good.champ, cid: good.cid, games: good.games, winRate: good.winRate, kda: good.kda },
    pos: byPosition(g)[0]?.pos,
    best: [...g].sort((a, b) => kda(b.k, b.d, b.a) - kda(a.k, a.d, a.a) || b.k - a.k)[0],
    longest: [...g].sort((a, b) => b.dur - a.dur)[0],
    months: Array.from({ length: 12 }, (_, i) => {
      const list = g.filter((x) => new Date(x.at + 9 * 3600_000).getUTCMonth() === i);
      return { month: i + 1, games: list.length, winRate: list.length ? (list.filter((x) => x.win).length / list.length) * 100 : 0 };
    }),
    first: g.length ? Math.min(...g.map((x) => x.at)) : 0,
  };
}
