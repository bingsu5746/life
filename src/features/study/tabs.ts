// 아래(폰)·왼쪽(PC) 메뉴의 칸들. 설정에서 칸을 숨길 수 있다 (오늘 칸은 빼고)
export const TABS = [
  { key: 'today', label: '오늘' },
  { key: 'exams', label: '시험' },
  { key: 'books', label: '문제집' },
  { key: 'tutor', label: '과외' },
  { key: 'math', label: '수학 방', short: '수학방' },
  { key: 'review', label: '저장소' },
  { key: 'words', label: '단어' },
  { key: 'translate', label: '번역' },
  { key: 'time', label: '기록' },
  { key: 'life', label: '할 일·습관', short: '할 일' },
] as const;

/** 메인 화면의 영역 (공부 · 운동 · 돈 · 취미) */
export const AREAS = [
  { key: 'home', label: '메인' },
  { key: 'study', label: '공부' },
  { key: 'money', label: '돈' },
  { key: 'hobby', label: '취미' },
  { key: 'diary', label: '일기' },
  { key: 'market', label: '시장' },
  { key: 'news', label: '뉴스' },
  { key: 'ai', label: 'AI' },
] as const;
export type AreaKey = (typeof AREAS)[number]['key'];

export interface AreaItem {
  /** 주소의 두 번째 칸 ('' 이면 영역 처음) */
  key: string;
  label: string;
  icon: string;
  /** 영역 밖 주소로 갈 때 (취미 안의 영화 · 게임 · 음악) */
  to?: string;
}

/** 취미 영역에 함께 들어 있는 주소 맨 앞 칸 */
export const HOBBY_PARTS = ['movies', 'games', 'music', 'travel', 'basketball'] as const;

/** 공부를 뺀 영역마다 왼쪽(폰은 아래) 메뉴: 영역을 누르면 메인 대신 이 칸들이 나온다 */
export const AREA_ITEMS: Record<Exclude<AreaKey, 'home' | 'study'>, AreaItem[]> = {
  money: [
    { key: '', label: '이번 달', icon: 'area-money' },
    { key: 'fixed', label: '고정', icon: 'repeat' },
    { key: 'saving', label: '모으기', icon: 'coin' },
    { key: 'wish', label: '위시리스트', icon: 'gift' },
  ],
  hobby: [
    { key: '', label: '취미', icon: 'area-hobby' },
    { key: 'reading', label: '독서', icon: 'books' },
    { key: 'basketball', label: '농구', icon: 'ball', to: '/basketball' },
    { key: 'movies', label: '영화', icon: 'area-movies', to: '/movies' },
    { key: 'games', label: '게임', icon: 'game', to: '/games' },
    { key: 'music', label: '음악', icon: 'music', to: '/music' },
    { key: 'travel', label: '여행', icon: 'pin', to: '/travel' },
    { key: 'wish', label: '위시리스트', icon: 'gift' },
  ],
  ai: [{ key: '', label: '문제 풀이', icon: 'area-ai' }],
  news: [
    { key: '', label: '오늘', icon: 'news' },
    { key: 'kr', label: '국내', icon: 'flag' },
    { key: 'biz', label: '경제', icon: 'chart' },
    { key: 'it', label: 'IT · 과학', icon: 'solve' },
    { key: 'ent', label: '연예', icon: 'star' },
    { key: 'sports', label: '스포츠', icon: 'ball' },
    { key: 'world', label: '세계', icon: 'globe' },
    { key: 'wbiz', label: '세계 경제', icon: 'bank' },
    { key: 'wtech', label: '세계 기술', icon: 'sparkle' },
  ],
  market: [
    { key: '', label: '시장', icon: 'area-market' },
    { key: 'shop', label: '상점', icon: 'bag' },
    { key: 'mine', label: '보관함', icon: 'ticket' },
    { key: 'dare', label: '도전', icon: 'flag' },
    { key: 'black', label: '암시장', icon: 'moon' },
    { key: 'bank', label: '은행', icon: 'bank' },
    { key: 'stocks', label: '주식', icon: 'chart' },
    { key: 'rules', label: '규칙', icon: 'scale' },
  ],
  diary: [
    { key: '', label: '일기', icon: 'area-diary' },
    { key: 'search', label: '찾기', icon: 'search' },
    { key: 'ask', label: '과거의 나', icon: 'review' },
    { key: 'letter', label: '편지', icon: 'save' },
    { key: 'people', label: '사람', icon: 'tutor' },
    { key: 'words', label: '기분 말', icon: 'words' },
    { key: 'dream', label: '꿈', icon: 'moon' },
    { key: 'form', label: '양식', icon: 'settings' },
    { key: 'highlight', label: '하이라이트', icon: 'sparkle' },
    { key: 'recap', label: '한 해 결산', icon: 'trophy' },
  ],
};

/** 영화 안에서의 메뉴 (취미로 돌아가기 + 영화 칸들) */
export const MOVIE_ITEMS: AreaItem[] = [
  { key: 'hobby', label: '취미', icon: 'area-hobby', to: '/hobby' },
  { key: 'now', label: '극장가', icon: 'area-movies', to: '/movies' },
  { key: 'watched', label: '내 영화', icon: 'film', to: '/movies/watched' },
  { key: 'find', label: '찾기', icon: 'search', to: '/movies/find' },
  { key: 'rec', label: '추천', icon: 'star', to: '/movies/rec' },
];

/** 게임 안에서의 메뉴 (취미로 돌아가기 + 게임 시간 · 롤 전적 · 롤 챔피언 · 롤 실시간 · Steam). 위시리스트는 취미 메뉴로 */
export const GAME_ITEMS: AreaItem[] = [
  { key: 'hobby', label: '취미', icon: 'area-hobby', to: '/hobby' },
  { key: 'mine', label: '게임 시간', icon: 'time', to: '/games' },
  { key: 'lol', label: '롤 전적', icon: 'trophy', to: '/games/lol' },
  { key: 'champs', label: '롤 챔피언', icon: 'search', to: '/games/champs' },
  { key: 'live', label: '롤 실시간', icon: 'pulse', to: '/games/live' },
  { key: 'steam', label: 'Steam', icon: 'game', to: '/games/steam' },
];
export const gameItem = (sub?: string) => (sub === 'lol' || sub === 'steam' || sub === 'champs' || sub === 'live' ? sub : sub === 'champ' ? 'champs' : 'mine');
/** 롤 챔피언 하나 안에서의 메뉴 (챔피언 목록으로 + 빌드 · 룬 · 아이템 · 카운터 · 스킬 · 팁) */
export const champItems = (id: string, pos: string): AreaItem[] => [
  { key: 'back', label: '챔피언 목록', icon: 'list', to: '/games/champs' },
  ...(
    [
      ['build', '빌드', 'target'],
      ['runes', '룬', 'life'],
      ['items', '아이템', 'save'],
      ['counter', '카운터', 'game'],
      ['skills', '스킬', 'books'],
      ['tips', '팁', 'solve'],
      ['skins', '스킨', 'area-hobby'],
    ] as const
  ).map(([k, label, icon]) => ({ key: k, label, icon, to: `/games/champ/${id}/${k}${pos ? `-${pos}` : ''}` })),
];
export const champItem = (sub?: string) => (sub ?? 'build').split('-')[0];

/** 여행 안에서의 메뉴 (취미로 돌아가기 + 가 볼 곳 · 다녀온 곳 · 지도 · 여행 기록) */
export const TRAVEL_ITEMS: AreaItem[] = [
  { key: 'hobby', label: '취미', icon: 'area-hobby', to: '/hobby' },
  { key: 'want', label: '가 볼 곳', icon: 'flag', to: '/travel' },
  { key: 'visited', label: '다녀온 곳', icon: 'done', to: '/travel/visited' },
  { key: 'map', label: '지도', icon: 'pin', to: '/travel/map' },
  { key: 'trail', label: '여행 기록', icon: 'route', to: '/travel/trail' },
];
export const travelItem = (sub?: string) => (sub === 'visited' || sub === 'map' || sub === 'trail' ? sub : 'want');

/** 농구 안에서의 메뉴 (취미로 돌아가기 + 농구 연습 · 농구 기록 · NBA) */
export const BASKETBALL_ITEMS: AreaItem[] = [
  { key: 'hobby', label: '취미', icon: 'area-hobby', to: '/hobby' },
  { key: 'drills', label: '농구 연습', icon: 'target', to: '/basketball/drills' },
  { key: 'log', label: '농구 기록', icon: 'ball', to: '/basketball' },
  { key: 'shots', label: '슛 분석', icon: 'court', to: '/basketball/shots' },
  { key: 'nba', label: 'NBA', icon: 'game', to: '/basketball/nba' },
];
export const basketballItem = (sub?: string) => (sub === 'drills' || sub === 'nba' || sub === 'shots' ? sub : 'log');

/** NBA 안에서의 메뉴 (농구로 돌아가기 + 경기 · 순위 · 로스터 · 선수) */
/** 통계: 이번 주 · 이번 달 · AI 코치 · 이것저것 · 영역별 통계 */
export const REVIEW_ITEMS: AreaItem[] = [
  { key: 'week', label: '이번 주', icon: 'review', to: '/week' },
  { key: 'month', label: '이번 달', icon: 'exams', to: '/month' },
  { key: 'coach', label: 'AI 코치', icon: 'area-ai', to: '/insights/coach' },
  { key: 'fun', label: '이것저것', icon: 'sparkle', to: '/insights/fun' },
  { key: 'study', label: '공부', icon: 'area-study', to: '/insights/study' },
  { key: 'grades', label: '성적', icon: 'up', to: '/insights/grades' },
  { key: 'fitness', label: '운동', icon: 'area-fitness', to: '/insights/fitness' },
  { key: 'hobby', label: '취미', icon: 'area-hobby', to: '/insights/hobby' },
  { key: 'money', label: '돈', icon: 'area-money', to: '/insights/money' },
  { key: 'year', label: '올해', icon: 'trophy', to: '/insights/year' },
];
export const reviewItem = (p0: string, sub?: string) => (p0 === 'week' || p0 === 'month' ? p0 : REVIEW_ITEMS.some((x) => x.key === sub) ? sub! : 'study');

/** 달력 안의 메뉴 (달 · 주 · 일정 목록) */
export const CAL_ITEMS: AreaItem[] = [
  { key: '', label: '달', icon: 'exams', to: '/calendar' },
  { key: 'week', label: '주', icon: 'list', to: '/calendar/week' },
  { key: 'list', label: '일정', icon: 'time', to: '/calendar/list' },
];

export const NBA_ITEMS: AreaItem[] = [
  { key: 'back', label: '농구', icon: 'ball', to: '/basketball' },
  { key: 'games', label: '경기', icon: 'game', to: '/basketball/nba' },
  { key: 'standings', label: '순위', icon: 'trophy', to: '/basketball/nba/standings' },
  { key: 'roster', label: '로스터', icon: 'list', to: '/basketball/nba/roster' },
  { key: 'players', label: '선수', icon: 'tutor', to: '/basketball/nba/players' },
];
export const nbaItem = (sub?: string) => (sub === 'standings' ? 'standings' : sub === 'roster' || sub?.startsWith('roster-') ? 'roster' : sub === 'players' ? 'players' : 'games');

/** 영화 주소의 두 번째 칸 → 켜진 영화 메뉴 */
export const movieItem = (sub?: string) => (sub === 'watched' || sub === 'want' || sub === 'quotes' || sub === 'awards' || sub === 'ceremony' ? 'watched' : sub === 'find' || sub === 'rec' ? sub : 'now');

/** 지금 주소에서 어느 메뉴가 켜져 있는지 */
export function activeItem(area: keyof typeof AREA_ITEMS, sub?: string, p0?: string): string {
  if (area === 'hobby' && (HOBBY_PARTS as readonly string[]).includes(p0 ?? '')) return p0!;
  if (area === 'diary') return sub === 'search' || sub === 'ask' || sub === 'letter' || sub === 'people' || sub === 'words' || sub === 'dream' || sub === 'form' || sub === 'recap' ? sub : sub?.startsWith('highlight') ? 'highlight' : '';
  if (area === 'money') return sub === 'fixed' || sub === 'saving' || sub === 'wish' ? sub : '';
  if (area === 'hobby') return sub === 'wish' || sub === 'reading' ? sub : '';
  if (area === 'news') return sub && ['kr', 'biz', 'it', 'ent', 'sports', 'world', 'wbiz', 'wtech'].includes(sub) ? sub : '';
  if (area === 'market') return sub === 'shop' || sub === 'mine' || sub === 'dare' || sub === 'black' || sub === 'bank' || sub === 'stocks' || sub === 'rules' ? sub : '';
  return '';
}

/** 설정 화면의 칸 */
export const SETTING_CATS = [
  { key: 'general', label: '일반', icon: 'settings' },
  { key: 'study', label: '공부', icon: 'area-study' },
  { key: 'school', label: '학교', icon: 'exams' },
  { key: 'life', label: '운동·돈·취미', icon: 'area-hobby' },
  { key: 'notify', label: '알림', icon: 'bell' },
  { key: 'data', label: '백업', icon: 'save' },
] as const;

/** 공부 › 시험 안에서의 메뉴 (공부로 돌아가기 + 시험 · 수행평가 · 성적 · 내신 목표 · 목표 대학 · 채점) */
export const EXAM_ITEMS: (AreaItem & { short: string })[] = [
  { key: 'exams', label: '시험', short: '시험', icon: 'exams', to: '/exams' },
  { key: 'tasks', label: '수행평가', short: '수행', icon: 'books', to: '/exams/tasks' },
  { key: 'grades', label: '성적', short: '성적', icon: 'up', to: '/exams/grades' },
  { key: 'goal', label: '내신 목표', short: '내신목표', icon: 'target', to: '/exams/goal' },
  { key: 'csat', label: '수능 목표', short: '수능목표', icon: 'trophy', to: '/exams/csat' },
  { key: 'univ', label: '목표 대학', short: '대학', icon: 'pin', to: '/exams/univ' },
  { key: 'check', label: '채점', short: '채점', icon: 'solve', to: '/exams/check' },
];
export const examItem = (id?: string) => (id === 'tasks' || id === 'grades' || id === 'goal' || id === 'csat' || id === 'univ' || id === 'check' ? id : 'exams');
