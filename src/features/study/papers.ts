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
