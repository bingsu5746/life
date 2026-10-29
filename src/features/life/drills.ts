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
  /** 어느 선수의 연습에서 따왔는지 (자료가 있는 것만) */
  from?: string;
  /** 그 자료 */
  src?: string;
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
  // ---- 선수들의 연습에서 따온 것 (자료 링크가 있는 것만, 양은 혼자 하기 좋게 줄임) ----
  {
    id: 'ray',
    name: '같은 자리 루틴',
    area: 'shoot',
    minutes: 15,
    need: 'hoop',
    level: 2,
    reps: '5곳 × 5개 + 자유투 10개',
    shots: 35,
    shotKind: 'fg',
    from: '레이 앨런',
    src: 'https://www.espn.com/blog/playbook/visuals/post/_/id/1900/short-film-captures-ray-allens-routine',
    steps: ['매번 똑같은 5곳(양 코너·양 윙·탑)에서 같은 순서로 던져요', '자리마다 5개, 마지막에 자유투 10개', '레이 앨런은 경기마다 같은 자리·같은 순서로 슛 연습을 했다고 해요 — 핵심은 "늘 같게"', '성공 수를 적어 매번 비교'],
  },
  {
    id: 'kobe',
    name: '넣을 때까지 스팟 슈팅',
    area: 'shoot',
    minutes: 15,
    need: 'hoop',
    level: 3,
    reps: '5곳에서 각 5개 넣기 (던진 수도 세기)',
    shots: 40,
    shotKind: 'fg',
    from: '코비 브라이언트',
    src: 'https://www.espn.com/nba/story/_/id/15179469/kobe-bryant-famous-pregame-shooting-routine',
    steps: ['던진 개수가 아니라 「넣은 개수」로 끝나는 연습이에요', '한 곳에서 5개를 넣어야 다음 곳으로 (코비는 자리마다 10~20개를 넣었다고 해요)', '3점 라인 바깥부터 시작해 점점 안쪽으로', '던진 총 개수를 세어 두면 성공률이 나와요 (기록 칸에는 넣은 수/던진 수)'],
  },
  {
    id: 'tennis',
    name: '테니스공 드리블',
    area: 'handle',
    minutes: 6,
    need: 'any',
    level: 3,
    reps: '손마다 1분 × 2',
    from: '스테픈 커리',
    src: 'https://www.aol.com/news/2015-11-07-stephen-curry-does-a-dribbling-drill-with-blinding-glasses-and-a-21260663.html',
    steps: ['한 손으로 농구공을 계속 드리블하면서 다른 손으로 테니스공을 위로 던졌다 받아요', '눈은 테니스공, 드리블은 손 감각으로', '익숙해지면 벽에 테니스공을 튀겨 받거나 손을 바꿔요', '커리가 트레이너와 하던 연습으로 알려져 있어요'],
  },
  {
    id: 'curry2ball',
    name: '투 볼 워밍업',
    area: 'handle',
    minutes: 6,
    need: 'any',
    level: 2,
    reps: '동작마다 30초 (공 2개)',
    from: '스테픈 커리',
    src: 'https://global.espn.com/nba/story/_/id/22215844/steph-curry-pregame-show-anything-routine',
    steps: ['경기 전 몸 풀기처럼: 두 공 동시에 → 번갈아 → 앞뒤로 밀고 당기기', '각 동작 30초, 쉬지 말고 다음 동작', '커리는 경기 전 두 공 드리블로 몸을 푼다고 해요', '공이 하나면 약한 손만 2분'],
  },
  {
    id: 'kyrie',
    name: '미칸 변형 4종',
    area: 'finish',
    minutes: 8,
    need: 'hoop',
    level: 3,
    reps: '종류마다 30초',
    from: '카이리 어빙',
    src: 'https://www.breakthroughbasketball.com/training/kyrie-mikans.html',
    steps: ['기본 미칸 → 역방향(백보드를 등지고) 미칸 → 약한 손만 미칸 → 두 발 점프 미칸', '종류마다 30초, 공은 어깨 높이에 두고 내리지 않기', '백보드의 여러 곳에 회전을 바꿔 가며 올려 보기', '카이리가 마무리 연습으로 쓰는 미칸 변형이에요'],
  },
  {
    id: 'dirk',
    name: '균형 잡기 슈팅',
    area: 'shoot',
    minutes: 10,
    need: 'hoop',
    level: 3,
    reps: '자세마다 5개 (한 발·뱅크·약한 손)',
    shots: 15,
    shotKind: 'fg',
    from: '디르크 노비츠키',
    src: 'https://dallasnews.com/sports/mavericks/2014/02/04/mavericks-dirk-nowitzki-the-basket-looks-massive-on-shooting-run-like-this',
    steps: ['골대 2~4m에서 한 발로 서서 점프 슛 5개 (안쪽 무릎을 들고)', '45도에서 백보드를 맞히는 뱅크 슛 5개', '약한 손으로 가까이서 5개', '노비츠키는 한 발 점퍼·뱅크 슛·반대 손 슛까지 섞어서 연습했다고 해요'],
  },
  {
    id: 'derozan-pump',
    name: '펌프 페이크 미드레인지',
    area: 'shoot',
    minutes: 10,
    need: 'hoop',
    level: 2,
    reps: '양쪽 엘보·베이스라인에서 5개씩 (20개)',
    shots: 20,
    shotKind: 'fg',
    from: '더마 드로잔',
    src: 'https://www.si.com/nba/bulls/onsi/news/jakob-poeltl-on-why-demar-derozans-pump-fake-is-so-effective',
    steps: [
      '미드레인지에서 공을 잡고 슛하는 것처럼 공을 이마까지 올려요 (펌프 페이크) — 무릎은 펴지 말고',
      '수비가 떴다고 생각하고 옆으로 한 번 드리블 → 풀업 점퍼',
      '다음엔 페이크 없이 바로 슛, 그다음엔 페이크 두 번 → 슛 처럼 섞어요',
      '드로잔의 펌프 페이크는 「수비를 제자리에서 끌어내는 타이밍」이 핵심이라고 해요. 같은 자세에서 진짜·가짜가 구분 안 되게',
    ],
  },
  {
    id: 'derozan-foot',
    name: '미드레인지 풋워크 (사이드 스텝·드롭 스텝·스텝백)',
    area: 'foot',
    minutes: 12,
    need: 'hoop',
    level: 3,
    reps: '기술마다 양쪽 5개 (30개)',
    shots: 30,
    shotKind: 'fg',
    from: '더마 드로잔',
    src: 'https://global.espn.com/nba/story/_/id/18184330/demar-derozan-quest-take-kobe-mantle',
    steps: [
      '사이드 스텝: 드리블하다 옆으로 크게 한 걸음 → 슛',
      '드롭 스텝: 골대를 등지고 바깥발을 골대 쪽으로 빼며 돌아 슛 또는 레이업',
      '스텝백: 앞으로 한 번 치고 뒤로 한 걸음 → 슛',
      '드로잔은 십 년 넘게 이런 미드레인지 발동작을 갈고닦았다고 해요. 그의 트레이너는 연습을 「경기 속도」로 한다고 했어요 — 천천히 익힌 뒤 경기처럼 빠르게',
    ],
  },
  // ---- 흔히 쓰는 기본 연습 ----
  {
    id: 'ft2',
    name: '자유투 두 개 연속',
    area: 'ft',
    minutes: 6,
    need: 'hoop',
    level: 2,
    reps: '연속 2개를 5번 성공할 때까지',
    shots: 20,
    shotKind: 'ft',
    steps: ['자유투 2개를 연속으로 넣으면 1점, 하나라도 놓치면 0점', '5점이 될 때까지 (던진 개수를 세어요)', '경기처럼 두 번째 공에서 긴장하는 걸 연습해요', '숨이 찬 상태(줄넘기 뒤)에서 하면 더 실전 같아요'],
  },
  {
    id: 'tired-ft',
    name: '숨찬 자유투',
    area: 'ft',
    minutes: 8,
    need: 'hoop',
    level: 2,
    reps: '왕복 달리기 → 자유투 2개 × 5번',
    shots: 10,
    shotKind: 'ft',
    steps: ['코트 끝까지 왕복으로 달리고 바로 자유투 2개', '5번 반복', '지쳤을 때도 같은 루틴을 지키는 게 목표', '넣은 개수를 적어 보통 자유투와 비교'],
  },
  {
    id: 'elbow',
    name: '엘보 점퍼',
    area: 'shoot',
    minutes: 8,
    need: 'hoop',
    level: 2,
    reps: '양쪽 엘보 번갈아 20개',
    shots: 20,
    shotKind: 'fg',
    steps: ['자유투 라인 양 끝(엘보)을 오가며 슛', '공을 잡고 한 번에 슛 자세로 (스텝은 안쪽 발 먼저)', '리바운드해서 반대쪽 엘보로 드리블한 뒤 바로 슛', '미드레인지는 경기에서 가장 자주 나오는 거리예요'],
  },
  { id: 'one-min-3', name: '1분 3점', area: 'three', minutes: 5, need: 'hoop', level: 2, reps: '1분 × 3세트', shots: 30, shotKind: 'tp', steps: ['1분 동안 3점을 최대한 많이 던져요 (스스로 리바운드)', '빨라져도 발 모양과 팔 각도는 그대로', '넣은 개수를 세고 세트마다 비교', '세트 사이 1분 쉬기'] },
  {
    id: 'stepback',
    name: '스텝백 점퍼',
    area: 'three',
    minutes: 8,
    need: 'hoop',
    level: 3,
    reps: '양쪽 6개씩',
    shots: 12,
    shotKind: 'fg',
    steps: ['앞으로 드리블 → 앞발로 바닥을 밀며 뒤로 한 걸음', '두 발로 착지해 균형을 잡고 바로 슛', '처음엔 미드레인지, 익숙해지면 3점 라인', '뒤로 기울지 않게 위로 뛰는 게 핵심'],
  },
  { id: 'floater', name: '플로터', area: 'finish', minutes: 6, need: 'hoop', level: 2, reps: '양쪽 8개씩', steps: ['골대 3~4m 앞에서 한 발로 뛰어 손끝으로 공을 높이 띄워요', '키 큰 수비 위로 넘기는 상상', '공을 손바닥이 아닌 손끝으로 밀어 부드럽게', '오른손·왼손 모두'] },
  {
    id: 'power',
    name: '파워 레이업',
    area: 'finish',
    minutes: 5,
    need: 'hoop',
    level: 1,
    reps: '양쪽 8개씩',
    steps: ['한 번 드리블해 두 발로 동시에 멈추고(점프 스톱) 양발로 올라가 마무리', '몸을 수비 쪽으로 향하게 해 부딪쳐도 버티기', '공은 두 손으로 턱 높이에 단단히', '골밑 몸싸움이 약할 때 좋아요'],
  },
  { id: 'figure8', name: '8자 드리블', area: 'handle', minutes: 5, need: 'any', level: 1, reps: '1분 × 3', steps: ['다리를 넓게 벌리고 두 다리 사이로 8자를 그리며 낮게 드리블', '반대 방향으로도', '공을 보지 않고 할 수 있으면 다음 단계', '손가락 끝으로 공을 다뤄요'] },
  {
    id: 'combo',
    name: '연속 무브 (크로스-레그-비하인드)',
    area: 'handle',
    minutes: 6,
    need: 'any',
    level: 2,
    reps: '30초 × 6',
    steps: ['크로스오버 → 다리 사이 → 등 뒤를 한 세트로 계속 이어요', '무브 사이에 공을 세게 한 번 튀기기 (파운드)', '눈은 앞, 무릎은 굽혀 낮게', '빨라질수록 공이 몸에서 멀어지지 않게'],
  },
  {
    id: 'hesi',
    name: '속도 바꾸기 (헤지테이션)',
    area: 'handle',
    minutes: 6,
    need: 'any',
    level: 2,
    reps: '코트 길이 왕복 × 4',
    steps: ['드리블하며 달리다 갑자기 멈칫(속도를 줄이며 몸을 세움) → 다시 폭발적으로 출발', '멈칫할 때 공은 높게, 출발할 때 낮게', '물병을 수비수 삼아 앞에서 하기', '수비를 따돌리는 가장 기본 기술'],
  },
  {
    id: 'jab',
    name: '잽 스텝 + 슛',
    area: 'foot',
    minutes: 8,
    need: 'hoop',
    level: 2,
    reps: '양쪽 8개씩',
    shots: 16,
    shotKind: 'fg',
    steps: ['공을 잡고 피벗 발을 고정한 채 앞발로 짧게 찔러요(잽)', '수비가 물러났다고 생각하고 바로 슛', '잽 → 돌파(한 번 드리블) → 풀업으로도', '축발이 떨어지면 트래블링이에요'],
  },
  { id: 'jumpstop', name: '점프 스톱 시리즈', area: 'foot', minutes: 6, need: 'hoop', level: 1, reps: '10번', steps: ['드리블로 달려가 두 발로 동시에 멈추기 (점프 스톱)', '멈춘 뒤 피벗 → 슛 · 펌프 페이크 → 레이업', '멈출 때 무릎을 굽혀 균형', '복잡한 골밑에서 공을 지키는 기본'] },
  { id: 'ladder', name: '사다리 발놀림 (선 이용)', area: 'foot', minutes: 6, need: 'any', level: 1, reps: '패턴마다 4번', steps: ['바닥 선이나 테이프로 사다리 칸을 만들어요', '한 칸에 두 발 · 옆으로 들어갔다 나오기 · 한 발씩', '발 앞쪽으로 빠르고 가볍게', '방향 전환과 빠른 첫발에 도움'] },
  { id: 'wall-tip', name: '벽 손끝 튕기기', area: 'reb', minutes: 4, need: 'wall', level: 1, reps: '30초 × 4 (양손·한 손)', steps: ['팔을 머리 위로 뻗고 공을 벽에 손끝으로 계속 튕겨요', '양손 → 오른손 → 왼손', '리바운드할 때 공을 손끝으로 따내는 감각', '팔이 떨어지지 않게 끝까지'] },
  { id: 'onehand-wall', name: '한 손 벽 패스', area: 'pass', minutes: 5, need: 'wall', level: 2, reps: '손마다 25번', steps: ['드리블에서 바로 한 손으로 벽에 패스 (푸시 패스)', '돌아오는 공을 한 손으로 받아 바로 드리블', '오른손·왼손 모두', '실전 패스는 대부분 한 손으로 나가요'] },
  {
    id: 'suicides',
    name: '왕복 달리기',
    area: 'cond',
    minutes: 6,
    need: 'any',
    level: 2,
    reps: '4세트 (세트 사이 1분)',
    steps: ['출발선 → 가까운 선 → 출발선 → 중간 → 출발선 → 먼 선 → 출발선', '선을 손으로 짚고 돌아요', '마지막 세트까지 같은 속도를 목표로', '농구는 짧게 달리고 멈추기를 반복하는 운동이에요'],
  },
  { id: 'core', name: '코어 · 하체', area: 'cond', minutes: 8, need: 'any', level: 1, reps: '플랭크 40초 · 런지 10번 · 스쿼트 15번 × 2', steps: ['플랭크 40초', '좌우 런지 10번씩', '맨몸 스쿼트 15번', '두 바퀴. 슛이 짧아지는 건 하체가 지쳐서인 경우가 많아요'] },
  {
    id: 'beat',
    name: '프로 이기기 (슈팅 게임)',
    area: 'shoot',
    minutes: 10,
    need: 'hoop',
    level: 2,
    reps: '한 판 (11점 먼저)',
    shots: 20,
    shotKind: 'fg',
    steps: ['넣으면 나 +1점, 놓치면 「프로」 +2점', '먼저 11점을 내면 승리', '자리를 매번 바꿔 가며 (양 코너·윙·탑·엘보)', '긴장감 속에서 한 개씩 집중하는 연습'],
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
/** goals: 내가 정한 목표 성공률(%)이 있으면 그 값을 기준으로 */
export function weaknesses(s: Stats, goals: { ft?: number; fg?: number; tp?: number } = {}): Weakness[] {
  const g = { ft: (goals.ft ?? 70) / 100, tp: (goals.tp ?? 33) / 100, fg: (goals.fg ?? 45) / 100 };
  const out: (Weakness & { gap: number })[] = [];
  const ft = pct(s.ft);
  if (ft !== null && ft < g.ft) out.push({ area: 'ft', gap: g.ft - ft, why: `자유투 ${Math.round(ft * 100)}% (${s.ft.m}/${s.ft.a})` });
  const tp = pct(s.tp);
  if (tp !== null && tp < g.tp) out.push({ area: 'three', gap: g.tp - tp, why: `3점 ${Math.round(tp * 100)}% (${s.tp.m}/${s.tp.a})` });
  const fg = pct(s.fg);
  if (fg !== null && fg < g.fg) out.push({ area: 'shoot', gap: g.fg - fg, why: `2점 ${Math.round(fg * 100)}% (${s.fg.m}/${s.fg.a})` });
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
  /** 최근에 한 드릴 (되도록 다른 것을 고른다) */
  recent?: string[];
}

const has = (have: Need, need: Need) => need === 'any' || have === 'hoop' || (have === 'wall' && need === 'wall');

/** 오늘의 연습: 몸 풀기 → 약한 부분 2~3개 → 마무리 자유투(골대 있을 때). 시간 안에 맞춘다 */
export function buildSession(o: SessionOpts): Drill[] {
  const rand = rng(o.salt);
  const ok = DRILLS.filter((x) => has(o.have, x.need) && x.level <= o.maxLevel);
  const fresh = (cands: Drill[]) => {
    const f = cands.filter((x) => !o.recent?.includes(x.id));
    return f.length ? f : cands;
  };
  const pick = (cands: Drill[]) => {
    const c = fresh(cands);
    return c.length ? c[Math.floor(rand() * c.length)] : undefined;
  };
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
    const x = pick(ok.filter((y) => y.area === a && !used.has(y.id) && !['ft', 'ft2'].includes(y.id) && y.minutes <= budget + 2));
    if (x) {
      add(x);
      budget -= x.minutes;
    }
    if (out.length >= 5) break;
  }
  // 마무리 자유투 (자유투 드릴 중 하나)
  if (o.have === 'hoop') add(pick(ok.filter((x) => x.area === 'ft' && x.id !== 'tired-ft')));
  return out;
}

export const totalMinutes = (list: Drill[]) => list.reduce((a, x) => a + x.minutes, 0);

export interface ShotLine {
  m: number;
  a: number;
}
export interface ShotSum {
  fg: ShotLine;
  tp: ShotLine;
  ft: ShotLine;
}

/** from~to (포함) 동안 적은 슛 (경기·연습 모두) */
export function shotsBetween(d: Pick<StudyData, 'workouts'>, from: DateStr, to: DateStr): ShotSum {
  const out: ShotSum = { fg: { m: 0, a: 0 }, tp: { m: 0, a: 0 }, ft: { m: 0, a: 0 } };
  for (const w of alive(d.workouts)) {
    if (w.kind !== '농구' || !w.bb || w.date < from || w.date > to) continue;
    out.fg.m += w.bb.fgm ?? 0;
    out.fg.a += w.bb.fga ?? 0;
    out.tp.m += w.bb.tpm ?? 0;
    out.tp.a += w.bb.tpa ?? 0;
    out.ft.m += w.bb.ftm ?? 0;
    out.ft.a += w.bb.fta ?? 0;
  }
  return out;
}

/** 연습 이름으로 어느 슛인지 짐작 (드릴 목록 → 이름 속 낱말) */
export function guessKind(name: string): 'fg' | 'tp' | 'ft' | undefined {
  const x = DRILLS.find((d) => d.name === name.trim());
  if (x?.shotKind) return x.shotKind;
  if (/자유투/.test(name)) return 'ft';
  if (/3점|쓰리/.test(name)) return 'tp';
  if (/슛|슈팅|점퍼|레이업|미드|2점|플로터|뱅크/.test(name)) return 'fg';
  return undefined;
}

/** 연습 항목들 → 2점·3점·자유투 합 (슛으로 정한 항목만) */
export function practiceTotals(items: { kind?: 'fg' | 'tp' | 'ft'; made?: number; att?: number }[]): { fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number } {
  const t = { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
  for (const i of items) {
    if (!i.kind || !i.att) continue;
    t[`${i.kind}m` as 'fgm'] += Math.min(i.made ?? 0, i.att);
    t[`${i.kind}a` as 'fga'] += i.att;
  }
  return t;
}
