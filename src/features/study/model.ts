// 공부 도우미의 자료 모양 (설계: docs/superpowers/specs/2026-10-23-study-planner-design.md §8.1)
// 모든 항목은 고친 시각(updatedAt)을 갖고, 지운 항목은 deleted 표시로 남겨 다른 기기에도 알린다.

export type Id = string;
/** 날짜 YYYY-MM-DD (그 기기 시간대 기준) */
export type DateStr = string;
/** 페이지(또는 Day) 범위, 양 끝 포함 */
export type Range = [number, number];
/** 체크 기록: [시작, 끝, 체크한 시각] — 두 기기에서 따로 체크해도 합칠 수 있게 시각을 남긴다 */
export type Mark = [number, number, number];

export interface Stamp {
  updatedAt: number;
  deleted?: true;
}

export interface StudySettings {
  /** 하루가 시작되는 시각 (0~6시). 이 시각 전은 전날로 친다 */
  dayStart: number;
  /** 쉬는 요일 (0=일 … 6=토) */
  restDays: number[];
  /** 빼는 날짜 (여행·행사) */
  offDates: DateStr[];
  /** 과외 수업이 있는 날은 평소의 몇 배만 배정할지 (0~1) */
  tutorRatio: number;
  /** 하루 최대 (넘으면 경고만) */
  dailyMax: number | null;
  /** 다시 보기 간격 (상자 1~5, 일) */
  intervals: number[];
  /** 객관식으로 오를 수 있는 가장 높은 상자 */
  quizMaxBox: number;
  /** 모르는 단어 모음: 하루 새 단어 수 */
  inboxPerDay: number;
  /** 단어장 계획에도 과외 날 비율을 쓸지 */
  wordsUseTutorRatio: boolean;
  pomo: { work: number; short: number; long: number; every: number };
  /** 메뉴에서 숨긴 칸 (예: 'preview') */
  hiddenTabs?: string[];
  /** 주마다 요일별 공부 시간 목표(분): 그 주 월요일 → [월 … 일] */
  weekTargets?: Record<DateStr, number[]>;
  /** 풀이 AI 하루 한도 (서비스 화면에서 본 숫자를 직접 넣음) */
  solveLimits?: Record<string, number>;
  /** 메인 아침 루틴 숨기기 */
  morningOff?: boolean;
  /** 학교 시간표: 요일(1=월 … 5=금, 6=토)마다 그날 수업 과목 (교시 순) */
  schoolTimetable?: Record<string, Id[]>;
  /** 운동 목표: 일주일에 몇 번 · 몇 분 */
  fitnessGoal?: { perWeek?: number; minutes?: number };
  /** 한 달 지출 예산 (원) */
  monthlyBudget?: number;
  /** 내신 목표 역산: 과목마다 학기 목표 점수(100점 환산)와 반영 비율 · 이미 받은 점수 */
  semesterGoals?: Record<Id, SemesterGoal>;
  /** 일기 쓰라는 알림 시각 HH:MM */
  diaryTime?: string;
  /** 하루 마감 체크인 알림 시각 HH:MM */
  checkinTime?: string;
  /** 잠 목표 (시간) */
  sleepGoal?: number;
  /** 일주일에 쓸 돈 한도 (넘으면 저녁 알림) */
  weeklyLimit?: number;
  /** 날씨 위치 (없으면 노원구) */
  weatherPlace?: { lat: number; lon: number; name: string };
  /** 내 학교 (나이스에서 급식·학사일정·시간표를 받을 때) */
  school?: { name: string; grade?: number; cls?: string };
  /** 마지막으로 백업 파일을 내려받은 날 */
  lastBackup?: DateStr;
  /** 농구 목표 성공률 (%) */
  bbGoals?: { ft?: number; fg?: number; tp?: number };
  /** 올해 읽을 책 수 */
  readingGoal?: number;
  /** 새 시험 계획의 기본값 (지난 시험 돌아보기에서 정함) */
  examPlanDefaults?: { weekday: number; weekend: number; perLine: number };
  /** 일기 양식: 쓸 칸들 · 새 일기에 오늘 한 것을 미리 채울지 */
  diaryForm?: { parts: string[]; autoFill: boolean };
  /** 메인 화면에서 숨긴 영역 (예: 'money') */
  hiddenAreas?: string[];
  /** 목표 등급: 성적 종류마다 과목 이름 → 등급 */
  gradeGoals?: { school?: Record<string, number>; mock?: Record<string, number> };
}

export interface Subject extends Stamp {
  id: Id;
  name: string;
  color: string;
  order: number;
  /** 주간 목표 공부 시간 (분) */
  weeklyGoal?: number;
  /** 학교 진도 기록 (오래된 것부터, 최근 30개) */
  progress?: ProgressEntry[];
}

/** 학교에서 어디까지 나갔는지 */
export interface ProgressEntry {
  date: DateStr;
  text: string;
  /** 고친 시각 (두 기기에서 따로 고쳤을 때 합치기용) */
  at?: number;
}

/** 시험 범위 한 줄 (체크하며 공부) */
export interface ScopeLine {
  id: Id;
  text: string;
  done: boolean;
  /** 체크·고친 시각 (두 기기에서 따로 체크해도 합칠 수 있게) */
  at?: number;
}

/** 한 과목의 시험 범위 */
export interface ExamScope {
  id: Id;
  subjectId: Id;
  /** 이 과목 시험 날 (없으면 시험 날) */
  date?: DateStr;
  lines: ScopeLine[];
  note?: string;
  /** 고친 시각 */
  at?: number;
}

/** 시험 기간의 하루: 그날 보는 과목들 */
export interface ExamDay {
  date: DateStr;
  subjectIds: Id[];
  /** 고친 시각 */
  at?: number;
}

/** school: 내신(학교 시험), mock: 모의고사·수능, other: 그 밖 */
export type ExamKind = 'school' | 'mock' | 'other';

export interface SemesterGoal {
  /** 학기 목표 (100점 환산) */
  target: number;
  /** 반영 항목: 중간 · 기말 · 수행평가 … (비율 %, 받은 점수는 100점 만점으로) */
  parts: { name: string; weight: number; score?: number }[];
}

/** 시험 공부 자동 계획 설정 (시험마다) */
export interface ExamPlanSettings {
  on: boolean;
  /** 하루에 쓸 수 있는 시간 (분): 평일 · 주말 */
  weekday: number;
  weekend: number;
  /** 범위 한 줄을 처음 공부하는 데 드는 시간 (분) */
  perLine: number;
  /** 복습 시간 = 처음 공부 시간 × 이 값 */
  review: number;
  /** 과목마다 내가 정한 시간 배수 */
  weights?: Record<Id, number>;
  /** 복습·훑어보기·오답 항목을 끝낸 날 */
  done?: Record<string, DateStr>;
  /** 오늘 할 것을 고정한 목록 */
  lock?: { date: DateStr; ids: string[] };
  /** 계획을 처음 켠 날 */
  started?: DateStr;
}

export interface Exam extends Stamp {
  id: Id;
  name: string;
  /** 시험 시작 날 (과목마다 다르면 첫날) */
  date: DateStr;
  /** 여러 날 보는 시험의 마지막 날 (하루만 보면 없음) */
  end?: DateStr;
  kind?: ExamKind;
  /** 날짜별 시험 과목 (여러 날 보는 시험) */
  days?: ExamDay[];
  scopes?: ExamScope[];
  /** 자동 계획 설정 */
  plan?: ExamPlanSettings;
}

/** 성적 한 과목 */
export interface GradeScore {
  id: Id;
  /** 과목 이름 (모의고사 과목은 내 과목 목록과 다를 수 있어 이름으로 둔다) */
  subject: string;
  /** 원점수 */
  raw?: number;
  /** 만점 (없으면 100) */
  full?: number;
  /** 등급 (1~9) */
  grade?: number;
  /** 내신: 과목 평균 */
  average?: number;
  /** 모의고사: 표준점수 */
  standard?: number;
  /** 모의고사: 백분위 */
  percentile?: number;
  /** 틀린 문항 번호 */
  wrong?: number[];
  at?: number;
}

/** 예습 한 가지: 수업 전에 미리 볼 곳 */
export interface PreviewItem extends Stamp {
  id: Id;
  subjectId: Id;
  /** 수업 날 (이날 수업 전까지 예습) */
  date: DateStr;
  /** 예습할 곳 (예: 3단원 2절, 교과서 58~63쪽) */
  text: string;
  done: boolean;
  doneAt?: number;
  /** 예습하며 궁금했던 것 (수업 때 확인) */
  questions?: string;
  /** 수업 듣고 나서: ok 이해함, some 조금 헷갈림, no 모르겠음 */
  after?: 'ok' | 'some' | 'no';
  created: number;
}

/** 수행평가 */
export interface Assessment extends Stamp {
  id: Id;
  subjectId: Id;
  title: string;
  /** 내는 날 · 발표하는 날 */
  due: DateStr;
  /** 준비할 것 (체크하며) */
  steps: ScopeLine[];
  done: boolean;
  memo?: string;
  created: number;
}

/** 백지 복습: 단원 이름만 보고 떠올려 쓴 뒤 핵심 내용과 비교 */
export interface BlankSheet extends Stamp, Review {
  id: Id;
  subjectId: Id;
  /** 단원 이름 (떠올릴 때 보이는 것) */
  title: string;
  /** 핵심 내용 (한 줄에 하나) */
  points: ScopeLine[];
  /** 떠올려 본 기록 (최근 10개) */
  tries: { id: Id; date: DateStr; missed: Id[]; at?: number }[];
  created: number;
}

/** 하루 잠·컨디션 (id 는 날짜) */
export interface DayCondition extends Stamp {
  id: DateStr;
  /** 잠든 시각 HH:MM (전날 밤) */
  sleep?: string;
  /** 일어난 시각 HH:MM */
  wake?: string;
  /** 컨디션 1(나쁨)~5(좋음) */
  mood?: number;
}

/** 주간 돌아보기 한 줄 (id 는 그 주 월요일) */
export interface WeekNote extends Stamp {
  id: DateStr;
  text: string;
  /** 다음 주에 바꿀 한 가지 (이 주를 돌아보며 정함) */
  change?: string;
  /** 다음 주가 끝날 때: 지켰는지 */
  kept?: boolean;
}

/** 지난 성적 (시험 한 번) */
export interface GradeRecord extends Stamp {
  id: Id;
  kind: 'school' | 'mock';
  /** 모의고사 학년 (학교에서 보는 것 · 혼자 푸는 고3·수능) */
  level?: '고1' | '고2' | '고3';
  /** 예: 1학년 2학기 기말고사, 6월 모의고사 */
  name: string;
  date: DateStr;
  /** 이 앱의 시험에서 넣었으면 그 시험 */
  examId?: Id;
  scores: GradeScore[];
  memo?: string;
}

export interface Unit {
  name: string;
  from: number;
  to: number;
  /** 계획에서 뺄 단원 */
  skip?: boolean;
}

export interface Book extends Stamp {
  id: Id;
  name: string;
  subjectId: Id;
  units: Unit[];
  done: Mark[];
  undone: Mark[];
}

/** 오늘 분량: 오늘 처음 볼 때 정해서 오늘 동안은 바꾸지 않는다 (§5.4) */
export interface TodayLock {
  date: DateStr;
  items: number[];
}

export interface Plan extends Stamp {
  id: Id;
  /** 문제집(book) 또는 단어장(words: 단위는 Day) */
  target: 'book' | 'words';
  targetId: Id;
  /** 계획에 넣을 범위 (단원·페이지를 고른 결과) */
  range: Range[];
  start: DateStr;
  examId?: Id;
  due?: DateStr;
  /** 마감 날도 공부하는 날에 넣을지 */
  includeDue: boolean;
  /** 이 계획만의 쉬는 요일 (없으면 공부 설정) */
  restDays?: number[];
  dailyMax?: number | null;
  todayLock?: TodayLock;
  /** 지난 오늘 분량 중 못 한 양 (「밀려서 늘었어요」 안내용) */
  carried?: { date: DateStr; count: number };
  /** 처음 계획한 하루 평균 (너무 많음 경고의 기준) */
  baseline: number;
  finished?: boolean;
}

export interface Tutor extends Stamp {
  id: Id;
  name: string;
  subjectId: Id;
  weekdays: number[];
  /** 수업 시각 HH:MM (선택) */
  time?: string;
  cancelled: DateStr[];
  extra: DateStr[];
}

export interface HwItem {
  id: Id;
  kind: 'pages' | 'text' | 'words';
  /** 내 문제집이면 그 id (풀면 문제집 진도에도 들어감) */
  bookId?: Id;
  bookName?: string;
  range?: Range;
  text?: string;
  wordListId?: Id;
  /** 페이지 숙제: 푼 페이지 (내 문제집이 아닐 때), 그 밖: 다 했는지 */
  doneRanges?: Range[];
  done?: boolean;
  /** 질문 메모 (다음 수업에서 물어볼 것) */
  question?: string;
  /** 고친 시각 (두 기기에서 따로 체크해도 합칠 수 있게) */
  at?: number;
}

export interface Homework extends Stamp {
  id: Id;
  tutorId: Id;
  given: DateStr;
  due: DateStr;
  dueManual: boolean;
  /** 마감 날(수업 날)까지 나눌지, 전날까지 나눌지 */
  includeDue: boolean;
  items: HwItem[];
  note: string;
}

export type WrongReason = 'concept' | 'calc' | 'misread' | 'time' | 'guess' | 'etc';

export interface Review {
  /** 0 = 아직 안 봄, 1~5 상자 */
  box: number;
  due: DateStr;
  wrong: number;
  learned?: boolean;
}

export interface WrongNote extends Stamp, Review {
  id: Id;
  subjectId: Id;
  bookId?: Id;
  page?: number;
  number?: string;
  question: string;
  photos: Id[];
  myAnswer: string;
  answer: string;
  reason: WrongReason | null;
  memo: string;
  /** 나에게 한마디 (실수 안 하려고 적어 두는 짧은 글, 오래된 것부터) */
  comments?: NoteComment[];
  /** 기출·모의고사 풀이에서 넣은 오답이면 그 풀이 */
  paperId?: Id;
  /** 다시 풀기에서 연달아 맞힌 횟수 (2번이면 졸업 = 해결됨) */
  okRun?: number;
  created: number;
}

/** AI 풀이 대화 (저장소에 모아 둔다. 사진은 R2 열쇠만) */
export interface SolvedProblem extends Stamp {
  id: Id;
  title: string;
  subjectId?: Id;
  at: number;
  /** 답에는 고른 서비스(engine) · 걸린 시간(ms) · 사진 문제였는지(img) */
  msgs: { role: 'user' | 'assistant'; text: string; model?: string; error?: boolean; imgKeys?: string[]; engine?: string; ms?: number; img?: boolean }[];
}

export interface NoteComment {
  id: Id;
  date: DateStr;
  text: string;
  at?: number;
}

/** 기출·모의고사 풀이 기록 (옛 수능·모의고사를 찾아 풀었거나 모의고사 모음집) */
export interface PastPaper extends Stamp {
  id: Id;
  subjectId: Id;
  /** csat: 수능, kice: 평가원 모의평가, edu: 교육청 학력평가, other: 사설·기타 */
  kind: 'csat' | 'kice' | 'edu' | 'other';
  /** 학년 (고2 · 고3 수능) */
  level?: '고1' | '고2' | '고3';
  /** 시험 이름 (예: 2025학년도 수능, 2024년 6월 모의평가) */
  title: string;
  /** 모의고사 모음 문제집이면 그 문제집 */
  bookId?: Id;
  /** 푼 날 */
  date: DateStr;
  score?: number;
  /** 만점 (없으면 100) */
  full?: number;
  grade?: number;
  /** 걸린 시간 (분) */
  minutes?: number;
  /** 틀린 문항 번호 */
  wrong: number[];
  memo?: string;
  created: number;
}

// ===== 공부 밖의 영역: 운동 · 돈 · 취미 =====

/** 운동 한 번 */
export interface Workout extends Stamp {
  id: Id;
  date: DateStr;
  /** 종류 (예: 달리기, 헬스, 홈트) */
  kind: string;
  minutes?: number;
  /** 거리 km */
  distance?: number;
  /** 근력 운동 내용 (예: 스쿼트 3×10 40kg) */
  detail?: string;
  /** 힘든 정도 1 가볍게 · 2 보통 · 3 힘들게 */
  effort?: number;
  memo?: string;
  /** 농구 기록 (종류가 농구일 때) */
  bb?: BasketballStat;
  created: number;
}

/** 농구 한 번의 기록 (경기면 내 기록, 연습이면 슈팅 수 등) */
export interface BasketballStat {
  mode: 'game' | 'practice';
  /** 경기 결과 */
  result?: 'win' | 'lose' | 'draw';
  pts?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  /** 2점슛 넣은 수 · 던진 수 */
  fgm?: number;
  fga?: number;
  /** 3점슛 */
  tpm?: number;
  tpa?: number;
  /** 자유투 */
  ftm?: number;
  fta?: number;
  /** 연습: 무엇을 연습했고 몇 개 중 몇 개 넣었는지 */
  items?: PracticeItem[];
  /** 코트 (어디서 했는지) */
  court?: string;
}

export interface PracticeItem {
  name: string;
  /** 어느 슛으로 셀지 (없으면 성공률만) */
  kind?: 'fg' | 'tp' | 'ft';
  made?: number;
  att?: number;
}

/** 몸무게·키 (id 는 날짜) */
export interface BodyLog extends Stamp {
  id: DateStr;
  weight?: number;
  /** 키 cm */
  height?: number;
}

/** 영화: 보고 싶은 것 · 본 것 (별점 · 한줄평) */
export interface Movie extends Stamp {
  id: Id;
  title: string;
  /** 개봉한 해 (같은 제목 구분용, 선택) */
  year?: number;
  status: 'want' | 'watched';
  /** 0.5 ~ 5 (0.5 단위) */
  rating?: number;
  comment?: string;
  /** 명대사 */
  quote?: string;
  /** 긴 리뷰 */
  review?: string;
  /** 영화 목록에서 골랐을 때 따라오는 정보 (시상식 요약용) */
  genre?: string;
  nation?: string;
  director?: string;
  /** 보고 싶은 이유 · 추천해 준 사람 (보기 전 메모) */
  why?: string;
  recBy?: string;
  /** 본 영화 중 또 보고 싶은 것 */
  rewish?: boolean;
  /** 태그 (혼자 · 울었다 …) */
  tags?: string[];
  /** 처음 본 뒤에 또 본 기록 */
  again?: { date: DateStr; where?: string }[];
  /** 본 날 */
  watched?: DateStr;
  /** 개봉일 (보고 싶은 영화) */
  release?: DateStr;
  /** 어디서 (극장 · 넷플릭스 …) */
  where?: string;
  created: number;
}

/** 돈: 쓴 것 · 들어온 것 */
export interface MoneyTx extends Stamp {
  id: Id;
  date: DateStr;
  type: 'out' | 'in';
  /** 원 */
  amount: number;
  category: string;
  memo?: string;
  /** 고정 지출·수입에서 자동으로 넣은 것이면 그 규칙 */
  ruleId?: Id;
  created: number;
}

/** 고정 지출·수입: 매일 · 매주 · 매달 · 매년 자동으로 넣는다 */
export interface MoneyRule extends Stamp {
  id: Id;
  /** 예: 넷플릭스, 용돈 */
  name: string;
  type: 'out' | 'in';
  amount: number;
  category: string;
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** 매주: 요일(0=일 … 6=토), 매달: 날짜(1~31, 그 달에 없으면 마지막 날) */
  day?: number;
  /** 이날부터 (매년이면 이 날짜의 월·일마다) */
  start: DateStr;
  /** 이날까지 (없으면 계속) */
  end?: DateStr;
  paused?: boolean;
  created: number;
}

/** 모으기 목표 */
export interface SavingGoal extends Stamp {
  id: Id;
  name: string;
  /** 목표 금액 (원) */
  target: number;
  /** 모은 기록 (빼면 음수) */
  deposits: { id: Id; date: DateStr; amount: number; at?: number }[];
  due?: DateStr;
  done?: boolean;
  /** 용돈이 들어오면 이 비율(%)만큼 저절로 모으기 · 이 날부터 들어온 용돈만 */
  autoPct?: number;
  autoSince?: DateStr;
  created: number;
}

export interface Hobby extends Stamp {
  id: Id;
  name: string;
  /** 일주일 목표 시간 (분) */
  weeklyGoal?: number;
  order: number;
}

/** 취미 한 번 */
export interface HobbyLog extends Stamp {
  id: Id;
  hobbyId: Id;
  date: DateStr;
  minutes?: number;
  memo?: string;
  created: number;
}

/** 하고 싶은 것 (책·영화·드라마·게임·장소·그 밖) */
export interface WishItem extends Stamp {
  id: Id;
  kind: 'book' | 'movie' | 'show' | 'game' | 'place' | 'other';
  title: string;
  status: 'want' | 'doing' | 'done';
  /** 별점 1~5 (끝낸 것) */
  rating?: number;
  note?: string;
  doneDate?: DateStr;
  created: number;
}

/** 일기 (id 는 날짜, 하루에 하나) */
export interface DiaryEntry extends Stamp {
  id: DateStr;
  /** 기분 1(나쁨)~5(좋음) */
  mood?: number;
  title?: string;
  text: string;
  /** 양식 칸마다 쓴 것 (오늘 한 것 · 좋았던 것 · 꿈 …) */
  parts?: Record<string, string>;
  /** 사진 (오답 사진처럼 기기에 저장, 최대 4장) */
  photos?: Id[];
}

/** 국어·영어 지문 (헷갈리는 지문을 다시 보려고 모아 둔다) */
export interface Passage extends Stamp {
  id: Id;
  lang: 'ko' | 'en';
  title: string;
  /** 출처: 교재·쪽·시험 */
  source?: string;
  text: string;
  /** 헷갈린 점 · 핵심 · 주제 */
  note?: string;
  /** 영어 지문 해석 */
  translation?: string;
  /** 헷갈려서 다시 볼 지문 */
  confusing: boolean;
  /** 다시 본 날들 */
  seen?: DateStr[];
  photos?: Id[];
  created: number;
}

/** 게임 (하는 중 · 하고 싶은 것 · 끝낸 것) */
export interface Game extends Stamp {
  id: Id;
  title: string;
  /** 기기: PC · 스위치 · 플스 · 폰 … */
  platform?: string;
  status: 'want' | 'playing' | 'done';
  /** 0.5 ~ 5 */
  rating?: number;
  /** 한 시간 (대략) */
  hours?: number;
  note?: string;
  started?: DateStr;
  finished?: DateStr;
  created: number;
}

/** 음반 (LP 등): 가진 것 · 사고 싶은 것 */
export interface MusicRecord extends Stamp {
  id: Id;
  /** 앨범 이름 */
  title: string;
  artist: string;
  format: 'lp' | 'cd' | 'tape' | 'digital';
  status: 'have' | 'want';
  year?: number;
  /** 산 값 (원) · 산 날 · 산 곳 */
  price?: number;
  bought?: DateStr;
  shop?: string;
  /** 판 상태 (민트 · 좋음 …) */
  condition?: string;
  rating?: number;
  note?: string;
  /** 들은 날들 */
  listens?: DateStr[];
  created: number;
}

/** 여행 · 가 볼 곳 (맛집 · 관광지 · 카페 …) */
export interface TravelPlace extends Stamp {
  id: Id;
  name: string;
  kind: 'food' | 'cafe' | 'sight' | 'stay' | 'etc';
  /** 지역 (예: 부산 해운대) */
  region?: string;
  status: 'want' | 'visited';
  visited?: DateStr;
  rating?: number;
  /** 메뉴 · 가격 · 팁 */
  note?: string;
  /** 지도 위치 */
  lat?: number;
  lon?: number;
  created: number;
}

/** 반복 할 일: 정한 요일마다 그날 할 일이 생긴다 */
export interface TodoRule extends Stamp {
  id: Id;
  title: string;
  /** 0 일 ~ 6 토 (비면 매일) */
  weekdays: number[];
  start: DateStr;
  paused?: boolean;
  created: number;
}

/** 농구 혼자 연습 드릴 한 번 (드릴 목록은 life/drills.ts) */
export interface DrillLog extends Stamp {
  id: Id;
  date: DateStr;
  drillId: string;
  /** 슛 연습이면 넣은 수 · 던진 수 */
  made?: number;
  shots?: number;
  minutes?: number;
  created: number;
}

/** 읽은 책 · 읽는 중 · 읽고 싶은 책 */
export interface Reading extends Stamp {
  id: Id;
  title: string;
  author?: string;
  status: 'want' | 'reading' | 'done';
  /** 전체 쪽수 · 지금 읽은 곳(쪽) */
  pages?: number;
  read?: number;
  /** 읽은 곳을 고친 날과 그때 쪽 (날마다 마지막 것) */
  log?: { date: DateStr; read: number }[];
  /** 0.5 ~ 5 */
  rating?: number;
  comment?: string;
  review?: string;
  /** 밑줄 친 문장 (쪽) */
  quotes?: { text: string; page?: number }[];
  started?: DateStr;
  finished?: DateStr;
  created: number;
}

export interface CardDeck extends Stamp {
  id: Id;
  name: string;
  subjectId: Id;
}

export interface MemoCard extends Stamp, Review {
  id: Id;
  deckId: Id;
  front: string;
  back: string;
  /** 넣은 시각 (새 카드 순서) */
  created?: number;
  /** 처음 본 날 (하루 새 카드 수 세기) */
  firstSeen?: DateStr;
}

export interface WordList extends Stamp {
  id: Id;
  name: string;
  /** book: 단어장 (Day), test: 단어 시험, inbox: 모르는 단어 모음 */
  kind: 'book' | 'test' | 'inbox';
  /** 국어 단어장이면 'ko' (없으면 영어) */
  lang?: 'ko';
  subjectId: Id;
  /** 단어장의 Day 수 */
  days?: number;
  done: Mark[];
  undone: Mark[];
  testDate?: DateStr;
  /** 단어 시험: 오늘 새로 익힐 단어 (오늘 동안 고정) */
  todayLock?: { date: DateStr; ids: Id[] };
}

export interface Word extends Stamp, Review {
  id: Id;
  listId: Id;
  term: string;
  meaning: string;
  day?: number;
  /** 넣은 순서 */
  order: number;
  /** 처음 익힌 날 */
  firstSeen?: DateStr;
  /** 예문: 문장 안의 그 단어(활용형)를 [ ] 로 감싼다. 예: They [abandoned] the car. */
  example?: { s: string; ko: string };
  /** 어디서 만난 단어인지 (예: 지문 제목) */
  from?: string;
}

export interface StudySession extends Stamp {
  id: Id;
  subjectId?: Id;
  bookId?: Id;
  start: number;
  end: number;
  minutes: number;
  date: DateStr;
  kind: 'pomo' | 'watch' | 'manual';
  /** 공부한 곳 (집 · 독서실 …) */
  place?: string;
  /** 무엇을 했는지 한 줄 (타이머를 멈출 때) */
  memo?: string;
}

export interface Todo extends Stamp {
  id: Id;
  title: string;
  due?: DateStr;
  done: boolean;
  doneAt?: number;
  /** 오늘 꼭 할 것 ⭐ */
  star?: boolean;
  /** 「숙제 나누기」로 만든 할 일이면 같은 숙제끼리 묶는 id */
  group?: string;
  /** 나눈 숙제 한 몫: 이름 · 단위 · 번호 범위 (다시 나눌 때 씀) */
  split?: { base: string; unit: string; from: number; to: number };
  created: number;
}

export interface Habit extends Stamp {
  id: Id;
  name: string;
  icon: string;
  /** 하는 요일 (비면 매일) */
  weekdays: number[];
  checks: DateStr[];
  /** 날짜마다 마지막으로 체크(+시각)·해제(-시각)한 때: 두 기기에서 다른 날을 체크해도 합칠 수 있게 */
  log?: Record<DateStr, number>;
  created: DateStr;
  archived?: boolean;
  /** 아침 루틴에 넣은 습관 */
  morning?: boolean;
}

export interface StudyData {
  v: 1;
  settings: StudySettings & Stamp;
  subjects: Record<Id, Subject>;
  exams: Record<Id, Exam>;
  books: Record<Id, Book>;
  plans: Record<Id, Plan>;
  tutors: Record<Id, Tutor>;
  homework: Record<Id, Homework>;
  notes: Record<Id, WrongNote>;
  decks: Record<Id, CardDeck>;
  cards: Record<Id, MemoCard>;
  wordLists: Record<Id, WordList>;
  sessions: Record<Id, StudySession>;
  todos: Record<Id, Todo>;
  habits: Record<Id, Habit>;
  grades: Record<Id, GradeRecord>;
  previews: Record<Id, PreviewItem>;
  assessments: Record<Id, Assessment>;
  blanks: Record<Id, BlankSheet>;
  conditions: Record<Id, DayCondition>;
  weekNotes: Record<Id, WeekNote>;
  papers: Record<Id, PastPaper>;
  workouts: Record<Id, Workout>;
  bodyLogs: Record<Id, BodyLog>;
  moneyTx: Record<Id, MoneyTx>;
  savings: Record<Id, SavingGoal>;
  hobbies: Record<Id, Hobby>;
  hobbyLogs: Record<Id, HobbyLog>;
  wishes: Record<Id, WishItem>;
  diary: Record<Id, DiaryEntry>;
  moneyRules: Record<Id, MoneyRule>;
  movies: Record<Id, Movie>;
  reads: Record<Id, Reading>;
  drillLogs: Record<Id, DrillLog>;
  todoRules: Record<Id, TodoRule>;
  passages: Record<Id, Passage>;
  games: Record<Id, Game>;
  records: Record<Id, MusicRecord>;
  places: Record<Id, TravelPlace>;
  problems: Record<Id, SolvedProblem>;
}

/** 단어는 많아질 수 있어 따로 묶는다 */
export type WordsData = Record<Id, Word>;

export const COLLECTIONS = [
  'subjects',
  'exams',
  'books',
  'plans',
  'tutors',
  'homework',
  'notes',
  'decks',
  'cards',
  'wordLists',
  'sessions',
  'todos',
  'habits',
  'grades',
  'previews',
  'assessments',
  'blanks',
  'conditions',
  'weekNotes',
  'papers',
  'workouts',
  'bodyLogs',
  'moneyTx',
  'savings',
  'hobbies',
  'hobbyLogs',
  'wishes',
  'diary',
  'moneyRules',
  'movies',
  'reads',
  'drillLogs',
  'todoRules',
  'passages',
  'games',
  'records',
  'places',
  'problems',
] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const DEFAULT_SETTINGS: StudySettings = {
  dayStart: 4,
  restDays: [],
  offDates: [],
  tutorRatio: 0.5,
  dailyMax: null,
  intervals: [1, 3, 7, 14, 30],
  quizMaxBox: 3,
  inboxPerDay: 10,
  wordsUseTutorRatio: false,
  pomo: { work: 25, short: 5, long: 15, every: 4 },
};

export function emptyStudy(): StudyData {
  return {
    v: 1,
    settings: { ...DEFAULT_SETTINGS, updatedAt: 0 },
    subjects: {},
    exams: {},
    books: {},
    plans: {},
    tutors: {},
    homework: {},
    notes: {},
    decks: {},
    cards: {},
    wordLists: {},
    sessions: {},
    todos: {},
    habits: {},
    grades: {},
    previews: {},
    assessments: {},
    blanks: {},
    conditions: {},
    weekNotes: {},
    papers: {},
    workouts: {},
    bodyLogs: {},
    moneyTx: {},
    savings: {},
    hobbies: {},
    hobbyLogs: {},
    wishes: {},
    diary: {},
    moneyRules: {},
    movies: {},
    reads: {},
    drillLogs: {},
    todoRules: {},
    passages: {},
    games: {},
    records: {},
    places: {},
    problems: {},
  };
}

export const REASONS: Record<WrongReason, string> = {
  concept: '개념 모름',
  calc: '계산 실수',
  misread: '문제 잘못 읽음',
  time: '시간 부족',
  guess: '찍음',
  etc: '기타',
};

/** 과목 색: 흑백 화면에서 점·막대로만 조금 보이게, 채도를 낮춘 색 */
export const SUBJECT_COLORS = ['#3f3f46', '#b4533c', '#4d7c5f', '#4a6a8f', '#8a6d3b', '#6b5b8c', '#3f7f7f', '#8c5a6e', '#71717a', '#a16207'];

export function newId(): Id {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}

/** 지우지 않은 항목만 */
export function alive<T extends Stamp>(rec: Record<Id, T>): T[] {
  return Object.values(rec).filter((x) => !x.deleted);
}
