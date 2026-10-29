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
  const passedMin = Math.max(0, (now - s.startedAt) / 60_000);
  const clockMin = Math.min(end, start + passedMin);
  const part = subject.parts.find((p) => clockMin < p.to) ?? subject.parts[subject.parts.length - 1];
  return { subject, part, clockMin, leftMs: Math.max(0, (end - clockMin) * 60_000), done: clockMin >= end };
}
