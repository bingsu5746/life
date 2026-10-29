// 농구 혼자 연습: 드릴 목록 · 내 기록에서 약점 찾기 · 오늘의 연습 짜기
// 드릴은 농구에서 흔히 쓰는 기본 연습이다. 시간·횟수는 처음 해 보기 좋은 권장량(예시)이라 몸에 맞게 늘리고 줄이면 된다.
import { addDays } from '../study/dates';
import { alive, type BasketballStat, type DateStr, type StudyData } from '../study/model';

export type DrillArea = 'ft' | 'shoot' | 'three' | 'handle' | 'finish' | 'pass' | 'reb' | 'foot' | 'cond';
export const AREA_NAME: Record<DrillArea, string> = { ft: '자유투', shoot: '슈팅', three: '3점', handle: '핸들링', finish: '골밑 마무리', pass: '패스', reb: '리바운드', foot: '풋워크·수비', cond: '체력' };
/** 필요한 것: 공만(any) · 벽 · 골대 */
export type Need = 'any' | 'wall' | 'hoop';

export interface Drill {
  id: string;
  name: string;
  area: DrillArea;
  minutes: number;
  need: Need;
  /** 1 쉬움 · 2 보통 · 3 어려움 */
  level: 1 | 2 | 3;
  /** 한 번에 할 양 (권장) */
  reps: string;
  steps: string[];
  /** 슛 연습이면 던질 개수 (성공률을 기록할 수 있음) */
  shots?: number;
  /** 어떤 슛 기록에 더할지 */
  shotKind?: 'ft' | 'fg' | 'tp';
}

export const DRILLS: Drill[] = [
  {
    id: 'form',
    name: '폼 슈팅',
    area: 'shoot',
    minutes: 8,
    need: 'hoop',
    level: 1,
    reps: '골대 앞 1~2m에서 20번',
    shots: 20,
    shotKind: 'fg',
    steps: ['골대 바로 앞에서 한 손(슛 손)만으로 공을 올려요', '팔꿈치를 몸 앞 일직선으로, 손목을 끝까지 꺾어 공이 뒤로 회전하게', '들어가면 한 걸음씩 뒤로 물러나요', '넣는 것보다 같은 폼으로 20번 반복하는 게 목표'],
  },
  {
    id: 'ft',
    name: '자유투 루틴',
    area: 'ft',
    minutes: 8,
    need: 'hoop',
    level: 1,
    reps: '10개씩 2세트 (총 20개)',
    shots: 20,
    shotKind: 'ft',
    steps: ['자유투 라인에 서서 매번 같은 루틴(공 튀기기 2번·숨 한 번 쉬기)을 해요', '경기처럼 한 개 한 개 집중해서 던져요', '10개마다 몇 개 들어갔는지 적어요', '두 번 연속 놓치면 숨을 고르고 다시 같은 루틴으로'],
  },
  {
    id: 'spot5',
    name: '5점 스팟 슈팅',
    area: 'shoot',
    minutes: 12,
    need: 'hoop',
    level: 2,
    reps: '5곳에서 각 5개 (25개)',
    shots: 25,
    shotKind: 'fg',
    steps: ['골대 주변 5곳(양 코너·양 윙·탑)을 정해요', '한 곳에서 5개를 던지고 다음 곳으로 이동', '이동할 땐 공을 잡고 바로 슈팅 자세로 (캐치 앤 슛)', '성공 수를 적고 지난번과 비교'],
  },
  {
    id: 'three',
    name: '3점 캐치 앤 슛',
    area: 'three',
    minutes: 12,
    need: 'hoop',
    level: 2,
    reps: '3점 라인 5곳 × 5개 (25개)',
    shots: 25,
    shotKind: 'tp',
    steps: ['3점 라인 밖 5곳에서 한 곳씩 5개', '스스로 공을 굴려 잡고(또는 튕겨 잡고) 바로 점프 슛', '발은 어깨너비, 무릎을 굽혀 다리 힘으로 던져요', '3점 성공 수를 적어요'],
  },
  {
    id: 'mikan',
    name: '미칸 드릴',
    area: 'finish',
    minutes: 5,
    need: 'hoop',
    level: 1,
    reps: '1분씩 3번',
    steps: ['골대 바로 밑에서 오른쪽 레이업 → 공을 받아 왼쪽 레이업을 번갈아 계속해요', '공을 땅에 튀기지 않고 잡자마자 올려요', '보드(백보드) 위쪽 네모를 보고 부드럽게', '1분 동안 몇 개 넣었는지 세어 봐요'],
  },
  {
    id: 'finish2',
    name: '양손 레이업 마무리',
    area: 'finish',
    minutes: 10,
    need: 'hoop',
    level: 2,
    reps: '오른손 10개 · 왼손 10개',
    steps: ['하프라인 쪽에서 드리블로 달려가 레이업', '오른쪽에서는 오른손, 왼쪽에서는 왼손으로', '마지막 두 걸음 리듬 "하나-둘"을 지켜요', '반대 손(약한 손) 성공률에 신경 써요'],
  },
  { id: 'euro', name: '유로 스텝·역방향 레이업', area: 'finish', minutes: 8, need: 'hoop', level: 3, reps: '양쪽 8개씩', steps: ['공을 잡은 뒤 한 발 옆으로, 다음 발 반대쪽으로 크게 벌려 수비를 피하는 상상', '수비수 대신 의자나 물병을 세워 두면 좋아요', '천천히 정확하게, 익숙해지면 속도를 올려요'] },
  {
    id: 'pullup',
    name: '1드리블 풀업 점퍼',
    area: 'shoot',
    minutes: 10,
    need: 'hoop',
    level: 3,
    reps: '양쪽 윙에서 8개씩',
    shots: 16,
    shotKind: 'fg',
    steps: ['윙에서 한 번 드리블하고 그 자리에서 점프 슛', '드리블 후 발을 모아 균형을 잡고 위로 점프', '넘어가지 않게 수직으로, 착지 위치를 확인', '성공 수를 적어요'],
  },
  {
    id: 'stationary',
    name: '제자리 볼 핸들링',
    area: 'handle',
    minutes: 6,
    need: 'any',
    level: 1,
    reps: '동작마다 30초',
    steps: ['파운드 드리블(공을 세게 땅에 튀기기)을 양손으로 30초씩', '크로스오버 30초 · 다리 사이(레그 스루) 30초 · 등 뒤(비하인드) 30초', '눈은 공이 아니라 앞을 보며', '익숙해지면 낮게, 더 빠르게'],
  },
  {
    id: 'twoball',
    name: '투 볼 드리블',
    area: 'handle',
    minutes: 6,
    need: 'any',
    level: 3,
    reps: '동작마다 30초 (공 2개 필요)',
    steps: ['공 두 개를 동시에 튀기기 → 번갈아 튀기기 → 하나는 높게 하나는 낮게', '양손이 같은 리듬을 가질 때까지 천천히', '(공이 하나뿐이면 약한 손 드리블 2분으로 대신해요)'],
  },
  { id: 'weakhand', name: '약한 손 드리블 코스', area: 'handle', minutes: 8, need: 'any', level: 2, reps: '왕복 5번', steps: ['물병이나 신발 5개를 2m 간격으로 세워 지그재그 코스를 만들어요', '약한 손으로만 드리블하며 코스를 통과', '방향을 바꿀 때 몸으로 공을 보호', '왕복 시간을 재서 기록'] },
  { id: 'wallpass', name: '벽 패스', area: 'pass', minutes: 6, need: 'wall', level: 1, reps: '체스트 30번 · 바운스 30번', steps: ['벽에서 2~3m 떨어져 가슴 높이로 힘껏 던지고 받아요', '엄지가 아래로 향하게 손목까지 쭉 뻗어요', '바운스 패스는 벽 중간쯤을 노려요', '받자마자 다음 패스 자세로'] },
  {
    id: 'rebound',
    name: '백보드 리바운드 점프',
    area: 'reb',
    minutes: 6,
    need: 'hoop',
    level: 2,
    reps: '15번 × 2세트',
    steps: ['공을 백보드에 던지고 점프해서 공중에서 두 손으로 잡아요', '착지하면 바로 두 발로 서서 공을 가슴 앞에 보호', '발을 어깨너비로 벌리고 무릎을 굽혀 착지', '발목·무릎이 아프면 바로 멈춰요'],
  },
  { id: 'pivot', name: '피벗 풋워크', area: 'foot', minutes: 5, need: 'any', level: 1, reps: '양쪽 10번씩', steps: ['한 발을 축으로 고정하고 다른 발로 앞·뒤로 돌아요', '공을 몸 가까이 두고 팔꿈치를 넓게', '축발이 끌리지 않는지 확인', '피벗 후 바로 슈팅이나 패스 자세로 이어요'] },
  { id: 'slide', name: '수비 슬라이드', area: 'foot', minutes: 6, need: 'any', level: 2, reps: '30초 × 4세트', steps: ['무릎을 굽히고 엉덩이를 낮춰 수비 자세', '발을 끌지 않고 옆으로 두 걸음씩 밀면서 이동 (발을 교차하지 않게)', '손은 넓게 벌리고 시선은 앞', '30초 쉬고 반복'] },
  { id: 'rope', name: '줄넘기', area: 'cond', minutes: 9, need: 'any', level: 1, reps: '3분 × 3세트', steps: ['한 발씩 가볍게 뛰거나 양발로', '발 앞쪽으로 착지하며 무릎을 부드럽게', '1분 쉬고 반복 (줄이 없으면 제자리 가볍게 뛰기)'] },
  {
    id: 'around',
    name: '어라운드 더 월드',
    area: 'shoot',
    minutes: 10,
    need: 'hoop',
    level: 2,
    reps: '5곳을 한 바퀴 (연속 성공하면 다음 곳)',
    shots: 15,
    shotKind: 'fg',
    steps: ['골대 둘레 5곳을 정해요', '한 곳에서 넣으면 다음 곳으로, 놓치면 한 번 더 기회', '한 바퀴를 마치면 끝. 던진 개수와 성공 수를 적어요', '혼자 하는 게임이라 집중력과 슈팅 감각을 함께 키워요'],
  },
];

export interface Stats {
  ft: { m: number; a: number };
  fg: { m: number; a: number };
  tp: { m: number; a: number };
  sessions: number;
  games: number;
  ast: number;
  reb: number;
}

const pct = (x: { m: number; a: number }) => (x.a >= 10 ? x.m / x.a : null);

/** 최근 days 일의 농구 기록 합 */
export function recentStats(d: Pick<StudyData, 'workouts'>, today: DateStr, days = 30): Stats {
  const from = addDays(today, -(days - 1));
  const list = alive(d.workouts).filter((w) => w.kind === '농구' && w.date >= from && w.date <= today);
  const s: Stats = { ft: { m: 0, a: 0 }, fg: { m: 0, a: 0 }, tp: { m: 0, a: 0 }, sessions: list.length, games: 0, ast: 0, reb: 0 };
  for (const w of list) {
    const b = w.bb as BasketballStat | undefined;
    if (!b) continue;
    s.ft.m += b.ftm ?? 0;
    s.ft.a += b.fta ?? 0;
    s.fg.m += b.fgm ?? 0;
    s.fg.a += b.fga ?? 0;
    s.tp.m += b.tpm ?? 0;
    s.tp.a += b.tpa ?? 0;
    if (b.mode === 'game') {
      s.games++;
      s.ast += b.ast ?? 0;
      s.reb += b.reb ?? 0;
    }
  }
  return s;
}

export interface Weakness {
  area: DrillArea;
  /** 왜 */
  why: string;
}

/** 기록으로 본 약한 부분 (가장 약한 순, 기록이 적으면 빈 목록) */
export function weaknesses(s: Stats): Weakness[] {
  const out: (Weakness & { gap: number })[] = [];
  const ft = pct(s.ft);
  if (ft !== null && ft < 0.7) out.push({ area: 'ft', gap: 0.7 - ft, why: `자유투 ${Math.round(ft * 100)}% (${s.ft.m}/${s.ft.a})` });
  const tp = pct(s.tp);
  if (tp !== null && tp < 0.33) out.push({ area: 'three', gap: 0.33 - tp, why: `3점 ${Math.round(tp * 100)}% (${s.tp.m}/${s.tp.a})` });
  const fg = pct(s.fg);
  if (fg !== null && fg < 0.45) out.push({ area: 'shoot', gap: 0.45 - fg, why: `2점 ${Math.round(fg * 100)}% (${s.fg.m}/${s.fg.a})` });
  if (s.games >= 2 && s.ast / s.games < 1.5) out.push({ area: 'pass', gap: 0.05, why: `경기당 어시스트 ${Math.round((s.ast / s.games) * 10) / 10}` });
  if (s.games >= 2 && s.reb / s.games < 3) out.push({ area: 'reb', gap: 0.04, why: `경기당 리바운드 ${Math.round((s.reb / s.games) * 10) / 10}` });
  return out.sort((a, b) => b.gap - a.gap).map(({ gap: _g, ...w }) => w);
}

/** 같은 날 같은 값이면 같은 순서 (다시 뽑기는 salt 를 바꿈) */
function rng(seed: number): () => number {
  let x = (Math.abs(seed) * 9301 + 49297) % 233280;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
}

export interface SessionOpts {
  /** 쓸 수 있는 시간 (분) */
  minutes: number;
  /** 있는 것: 골대 / 벽 / 공만 */
  have: Need;
  weak: Weakness[];
  salt: number;
  /** 초보면 쉬운 것 위주 */
  maxLevel: 1 | 2 | 3;
}

const has = (have: Need, need: Need) => need === 'any' || have === 'hoop' || (have === 'wall' && need === 'wall');

/** 오늘의 연습: 몸 풀기 → 약한 부분 2~3개 → 마무리 자유투(골대 있을 때). 시간 안에 맞춘다 */
export function buildSession(o: SessionOpts): Drill[] {
  const rand = rng(o.salt);
  const ok = DRILLS.filter((x) => has(o.have, x.need) && x.level <= o.maxLevel);
  const pick = (cands: Drill[]) => (cands.length ? cands[Math.floor(rand() * cands.length)] : undefined);
  const used = new Set<string>();
  const out: Drill[] = [];
  const add = (x?: Drill) => {
    if (x && !used.has(x.id)) {
      used.add(x.id);
      out.push(x);
    }
  };
  // 몸 풀기: 줄넘기 또는 제자리 핸들링
  add(pick(ok.filter((x) => x.id === 'rope' || x.id === 'stationary' || x.id === 'pivot')));
  let budget = o.minutes - (out[0]?.minutes ?? 0) - (has(o.have, 'hoop') && o.have === 'hoop' ? 6 : 0);
  // 약한 부분 먼저, 그다음 고르게
  const areas = [...o.weak.map((w) => w.area), 'shoot', 'handle', 'finish', 'pass'] as DrillArea[];
  for (const a of areas) {
    if (budget < 5) break;
    const x = pick(ok.filter((y) => y.area === a && !used.has(y.id) && y.id !== 'ft' && y.minutes <= budget + 2));
    if (x) {
      add(x);
      budget -= x.minutes;
    }
    if (out.length >= 5) break;
  }
  if (o.have === 'hoop') add(DRILLS.find((x) => x.id === 'ft'));
  return out;
}

export const totalMinutes = (list: Drill[]) => list.reduce((a, x) => a + x.minutes, 0);
