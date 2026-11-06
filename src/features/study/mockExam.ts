// 모의고사 보기: 수능과 같은 시각 · 같은 시간으로 (평가원 수능 시간표 기준)
export interface ExamPart {
  label: string;
  /** 하루 0시부터 분 */
  from: number;
  to: number;
  /** 답안지 회수처럼 문제를 푸는 시간이 아닌 것 */
  rest?: boolean;
}
export interface MockSubject {
  key: string;
  name: string;
  parts: ExamPart[];
}

const hm = (h: number, m: number) => h * 60 + m;

export const MOCK_SUBJECTS: MockSubject[] = [
  { key: 'korean', name: '국어', parts: [{ label: '국어 영역', from: hm(8, 40), to: hm(10, 0) }] },
  { key: 'math', name: '수학', parts: [{ label: '수학 영역', from: hm(10, 30), to: hm(12, 10) }] },
  { key: 'english', name: '영어', parts: [{ label: '영어 영역', from: hm(13, 10), to: hm(14, 20) }] },
  { key: 'history', name: '한국사', parts: [{ label: '한국사 영역', from: hm(14, 50), to: hm(15, 20) }] },
  { key: 'inquiry1', name: '탐구 1과목', parts: [{ label: '탐구 영역 · 제1선택', from: hm(15, 35), to: hm(16, 5) }] },
  {
    key: 'inquiry2',
    name: '탐구 2과목',
    parts: [
      { label: '탐구 영역 · 제1선택', from: hm(15, 35), to: hm(16, 5) },
      { label: '제1선택 답안지 회수', from: hm(16, 5), to: hm(16, 7), rest: true },
      { label: '탐구 영역 · 제2선택', from: hm(16, 7), to: hm(16, 37) },
    ],
  },
];

/** 성적 칸의 과목 이름 */
export const GRADE_NAME: Record<string, string> = { korean: '국어', math: '수학', english: '영어', history: '한국사', inquiry1: '탐구1', inquiry2: '탐구1' };

export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

export interface MockState {
  key: string;
  /** 탐구 이름 (과학탐구 · 사회탐구) */
  title?: string;
  startedAt: number;
  /** 시간 전에 「다 풀었어요」를 누른 때 (그때 시계가 멈춘다) */
  finishedAt?: number;
  /** 문항별 시간 재기: 지금 푸는 번호 · 그 번호를 잡은 때 · 번호마다 쌓인 ms */
  perQ?: { cur: number; since: number; acc: Record<number, number> };
}

/** 과목마다 문항 수 (수능 기준: 국어 45 · 수학 30 · 영어 45 · 한국사 20 · 탐구 과목당 20) */
export const QUESTION_COUNT: Record<string, number> = { korean: 45, math: 30, english: 45, history: 20, inquiry1: 20, inquiry2: 40 };

/** 문항별 시간 재기 시작 (1번부터) */
export const startPerQ = (now: number): NonNullable<MockState['perQ']> => ({ cur: 1, since: now, acc: {} });

/** 다른 번호로 옮기기: 지금 번호에 지난 시간을 더하고 새 번호를 잡는다 (같은 번호면 그대로) */
export function switchQ(p: NonNullable<MockState['perQ']>, to: number, now: number): NonNullable<MockState['perQ']> {
  if (to === p.cur) return p;
  return { cur: to, since: now, acc: { ...p.acc, [p.cur]: (p.acc[p.cur] ?? 0) + Math.max(0, now - p.since) } };
}

/** 번호마다 걸린 초 (지금 번호는 end 까지 더해서). 0 인 번호는 빼고 */
export function qSeconds(p: NonNullable<MockState['perQ']>, end: number): Record<number, number> {
  const acc = { ...p.acc, [p.cur]: (p.acc[p.cur] ?? 0) + Math.max(0, end - p.since) };
  return Object.fromEntries(
    Object.entries(acc)
      .map(([k, v]) => [Number(k), Math.round(v / 1000)] as const)
      .filter(([, v]) => v > 0),
  );
}

/** 오래 걸린 번호 (초가 큰 순서) */
export const slowest = (sec: Record<number, number>, n = 5) =>
  Object.entries(sec)
    .map(([k, v]) => ({ q: Number(k), sec: v }))
    .sort((a, b) => b.sec - a.sec || a.q - b.q)
    .slice(0, n);

/** 「12:95,13:40」 처럼 주소에 담기 · 읽기 */
export const encodeQ = (sec: Record<number, number>) =>
  Object.entries(sec)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
export function decodeQ(s: string): Record<number, number> {
  const out: Record<number, number> = {};
  for (const m of s.matchAll(/(\d{1,3}):(\d{1,5})/g)) {
    const q = Number(m[1]),
      v = Number(m[2]);
    if (q >= 1 && q <= 200 && v > 0 && v <= 36_000) out[q] = v;
  }
  return out;
}

export interface MockView {
  subject: MockSubject;
  part: ExamPart;
  /** 시험장 시각 (하루 0시부터 분, 소수) */
  clockMin: number;
  /** 이 과목 끝까지 남은 ms */
  leftMs: number;
  done: boolean;
}

export function mockView(s: MockState, now: number): MockView | null {
  const subject = MOCK_SUBJECTS.find((x) => x.key === s.key);
  if (!subject) return null;
  const start = subject.parts[0].from;
  const end = subject.parts[subject.parts.length - 1].to;
  const passedMin = Math.max(0, ((s.finishedAt ?? now) - s.startedAt) / 60_000);
  const clockMin = Math.min(end, start + passedMin);
  const part = subject.parts.find((p) => clockMin < p.to) ?? subject.parts[subject.parts.length - 1];
  return { subject, part, clockMin, leftMs: Math.max(0, (end - clockMin) * 60_000), done: clockMin >= end || !!s.finishedAt };
}

/** 모의고사 보기 과목 → 수능 영역 이름 (풀이 기록 칸) */
export const mockSection = (s: Pick<MockState, 'key' | 'title'>) => ({ korean: '국어', math: '수학', english: '영어', history: '한국사' })[s.key as 'korean'] ?? (s.title === '사회탐구' ? '사회탐구' : '과학탐구');
/** 실제로 푼 시간 (분): 다 풀었어요를 눌렀으면 그때까지, 아니면 정해진 시간 */
export function mockMinutes(s: MockState): number {
  const subject = MOCK_SUBJECTS.find((x) => x.key === s.key);
  const total = subject ? subject.parts[subject.parts.length - 1].to - subject.parts[0].from : 0;
  return s.finishedAt ? Math.max(1, Math.min(total, Math.round((s.finishedAt - s.startedAt) / 60_000))) : total;
}
