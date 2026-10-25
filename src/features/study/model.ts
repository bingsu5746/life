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

export interface Exam extends Stamp {
  id: Id;
  name: string;
  /** 시험 시작 날 (과목마다 다르면 첫날) */
  date: DateStr;
  scopes?: ExamScope[];
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
}

export interface Todo extends Stamp {
  id: Id;
  title: string;
  due?: DateStr;
  done: boolean;
  doneAt?: number;
  /** 오늘 꼭 할 것 ⭐ */
  star?: boolean;
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
}

/** 단어는 많아질 수 있어 따로 묶는다 */
export type WordsData = Record<Id, Word>;

export const COLLECTIONS = ['subjects', 'exams', 'books', 'plans', 'tutors', 'homework', 'notes', 'decks', 'cards', 'wordLists', 'sessions', 'todos', 'habits'] as const;
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
