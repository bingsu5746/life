// 기출·모의고사 풀이 기록 (계산)
import { addDays } from './dates';
import { alive, newId, type DateStr, type PastPaper, type StudyData, type WrongNote } from './model';

export const PAPER_KIND: Record<PastPaper['kind'], string> = { csat: '수능', kice: '평가원 모의평가', edu: '교육청 학력평가', other: '사설·기타' };

/** 종류·해·달로 시험 이름 짓기 (사람이 고칠 수 있다) */
export function paperTitle(kind: PastPaper['kind'], year: string, month: string): string {
  const y = year.trim();
  const m = month.trim();
  if (kind === 'csat') return `${y ? `${y}학년도 ` : ''}수능`;
  if (kind === 'kice') return `${y ? `${y}학년도 ` : ''}${m ? `${m}월 ` : ''}모의평가`;
  if (kind === 'edu') return `${y ? `${y}년 ` : ''}${m ? `${m}월 ` : ''}학력평가`;
  return [y, m && `${m}월`].filter(Boolean).join(' ');
}

/** 번호마다 틀린 횟수 */
export function numberFrequency(lists: number[][]): { counts: Map<number, number>; max: number } {
  const counts = new Map<number, number>();
  let max = 0;
  for (const l of lists)
    for (const q of new Set(l)) {
      counts.set(q, (counts.get(q) ?? 0) + 1);
      if (q > max) max = q;
    }
  return { counts, max };
}

/** 점수 비율 (0~100, 만점 기준) */
export const percent = (p: PastPaper) => (p.score === undefined ? null : Math.round((p.score / (p.full || 100)) * 1000) / 10);

/** 과목의 풀이들 (푼 날 순) */
export const papersOf = (d: StudyData, subjectId?: string) =>
  alive(d.papers)
    .filter((p) => !subjectId || p.subjectId === subjectId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);

/** 틀린 번호들 → 오답 노트 (이미 그 풀이에서 넣은 번호는 빼고) */
export function notesFromPaper(d: StudyData, p: PastPaper, today: DateStr, now = Date.now()): WrongNote[] {
  const have = new Set(alive(d.notes).filter((n) => n.paperId === p.id).map((n) => n.number));
  return p.wrong
    .filter((q) => !have.has(String(q)))
    .map((q, i) => ({
      id: newId(),
      updatedAt: 0,
      subjectId: p.subjectId,
      paperId: p.id,
      number: String(q),
      question: '',
      photos: [],
      myAnswer: '',
      answer: '',
      reason: null,
      memo: '',
      created: now + i,
      box: 1,
      due: addDays(today, 1),
      wrong: 1,
    }));
}

/** 수능 · 모의고사 영역 (과목이 정해져 있다): 이름 · 만점 · 시간(분) */
export const CSAT_SECTIONS: { name: string; full: number; min: number; match: RegExp }[] = [
  { name: '국어', full: 100, min: 80, match: /국어/ },
  { name: '수학', full: 100, min: 100, match: /수학/ },
  { name: '영어', full: 100, min: 70, match: /영어/ },
  { name: '한국사', full: 50, min: 30, match: /한국사/ },
  { name: '사회탐구', full: 50, min: 30, match: /사회|사탐|윤리|지리|정치|경제|역사|법/ },
  { name: '과학탐구', full: 50, min: 30, match: /과학|과탐|물리|화학|생명|생물|지구/ },
  { name: '제2외국어·한문', full: 50, min: 40, match: /외국어|한문|일본어|중국어|독일어|프랑스어|스페인어/ },
];
/** 영역 → 내 과목 (이름이 맞는 것이 있으면 그 과목, 없으면 영역 이름 그대로 「csat:국어」) */
export const sectionSubject = (d: { subjects: Record<string, { name: string; deleted?: boolean }> }, section: string) => {
  const sec = CSAT_SECTIONS.find((s) => s.name === section);
  const mine = Object.entries(d.subjects).find(([, s]) => !s.deleted && sec?.match.test(s.name));
  return mine ? mine[0] : `csat:${section}`;
};
