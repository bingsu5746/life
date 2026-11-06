// 시험 회고: 끝난 시험마다 과목별 점수 · 시험 전 2주 공부 시간 · 범위 진도 · 그동안 생긴 오답, 지난 같은 종류 시험과 비교
import { addDays } from './dates';
import { examEnd, examSubjectIds, scopeDate, timetableDate } from './exams';
import { alive, type DateStr, type Exam, type GradeRecord, type StudyData } from './model';

export interface RetroRow {
  subjectId?: string;
  name: string;
  /** 100점으로 바꾼 점수 (없으면 null) */
  score: number | null;
  scoreText: string;
  /** 지난 같은 종류 시험의 같은 과목 점수 (100점으로) */
  prev: number | null;
  /** 그 과목 시험 날 앞 14일 공부 (분) */
  minutes: number;
  /** 시험 범위 끝낸 줄 / 모든 줄 */
  done: number;
  lines: number;
  /** 그 14일에 생긴 오답 */
  notes: number;
}

const pct = (s: { raw?: number; full?: number }) => (s.raw !== undefined ? Math.round((s.raw / (s.full || 100)) * 100) : null);

export function examRetro(d: StudyData, exam: Exam): { rows: RetroRow[]; grade?: GradeRecord; prevName?: string; total: number; days: number } {
  const grades = alive(d.grades);
  const grade = grades.find((g) => g.examId === exam.id);
  // 지난 같은 종류 시험 (이 시험보다 앞 날짜)
  const prev = grades.filter((g) => g !== grade && g.kind === (exam.kind === 'mock' ? 'mock' : 'school') && g.date < exam.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const ids = [...new Set([...examSubjectIds(exam), ...(exam.scopes ?? []).map((s) => s.subjectId)])].filter((id) => d.subjects[id] && !d.subjects[id].deleted);
  const sessions = alive(d.sessions);
  const notes = alive(d.notes);
  const window = (end: DateStr) => ({ from: addDays(end, -14), to: addDays(end, -1) });
  const kst = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
  const rowFor = (name: string, subjectId?: string): RetroRow => {
    const sc = exam.scopes?.find((s) => s.subjectId === subjectId);
    const day = subjectId ? (timetableDate(exam, subjectId) ?? (sc ? scopeDate(exam, sc) : exam.date)) : exam.date;
    const w = window(day);
    const g = grade?.scores.find((x) => x.subject === name);
    const p = prev?.scores.find((x) => x.subject === name);
    return {
      subjectId,
      name,
      score: g ? pct(g) : null,
      scoreText: g ? [g.raw !== undefined ? `${g.raw}${g.full && g.full !== 100 ? `/${g.full}` : ''}점` : '', g.grade ? `${g.grade}등급` : ''].filter(Boolean).join(' · ') || '—' : '점수 없음',
      prev: p ? pct(p) : null,
      minutes: subjectId ? sessions.filter((s) => s.subjectId === subjectId && s.date >= w.from && s.date <= w.to).reduce((a, s) => a + s.minutes, 0) : 0,
      done: sc ? sc.lines.filter((l) => l.done).length : 0,
      lines: sc?.lines.length ?? 0,
      notes: subjectId ? notes.filter((n) => n.subjectId === subjectId && kst(n.created) >= w.from && kst(n.created) <= w.to).length : 0,
    };
  };
  const rows = ids.map((id) => rowFor(d.subjects[id].name, id));
  // 성적에만 있는 과목 (모의고사 영역 등)
  for (const s of grade?.scores ?? []) if (!rows.some((r) => r.name === s.subject)) rows.push(rowFor(s.subject));
  const w = window(exam.date);
  const total = sessions.filter((s) => s.date >= w.from && s.date <= addDays(examEnd(exam), -1)).reduce((a, s) => a + s.minutes, 0);
  return { rows, grade, prevName: prev?.name, total, days: 14 };
}
