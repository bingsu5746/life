// 시험 범위 · 학교 진도 (계산)
import { addDays, daysBetween, diffDays } from './dates';
import { alive, newId, type DateStr, type Exam, type ExamDay, type ExamScope, type Id, type ScopeLine, type StudyData } from './model';

/**
 * 범위 글(한 줄에 하나) → 체크 줄. 같은 글의 줄은 체크 상태를 그대로 둔다.
 * 같은 글의 줄이 여러 개면 예전 줄을 하나씩 짝지어 쓴다 (한 줄을 체크하면 다른 줄까지 체크되지 않게).
 */
export function scopeLines(text: string, prev: ScopeLine[] = [], now = Date.now()): ScopeLine[] {
  const old = new Map<string, ScopeLine[]>();
  for (const l of prev) old.set(l.text, [...(old.get(l.text) ?? []), l]);
  const out: ScopeLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim();
    if (!t) continue;
    const o = old.get(t)?.shift();
    out.push(o ? { ...o } : { id: newId(), text: t, done: false, at: now });
  }
  return out;
}

export const scopeText = (lines: ScopeLine[]) => lines.map((l) => l.text).join('\n');

/** 시간표에서 그 과목을 보는 날 */
export const timetableDate = (exam: Exam, subjectId: Id): DateStr | undefined => exam.days?.find((d) => d.subjectIds.includes(subjectId))?.date;

/** 그 과목 시험 날: 시간표 → 범위에 따로 정한 날 → 시험 첫날 */
export function subjectExamDate(exam: Exam, subjectId?: Id): DateStr {
  if (!subjectId) return exam.date;
  return timetableDate(exam, subjectId) ?? exam.scopes?.find((s) => s.subjectId === subjectId)?.date ?? exam.date;
}

export const scopeDate = (exam: Exam, s: ExamScope): DateStr => timetableDate(exam, s.subjectId) ?? s.date ?? exam.date;

/** 시험 기간은 길어야 이만큼 (잘못 넣은 날짜로 화면이 멈추지 않게) */
export const MAX_EXAM_DAYS = 31;

/** 시험 기간의 모든 날 (하루짜리면 하루) */
export function examDates(exam: Exam): DateStr[] {
  const end = exam.end && exam.end > exam.date ? exam.end : exam.date;
  const cap = addDays(exam.date, MAX_EXAM_DAYS - 1);
  return daysBetween(exam.date, end < cap ? end : cap);
}

/** 시간표: 기간의 날마다 그날 과목 (비어 있는 날도) */
export function timetable(exam: Exam): ExamDay[] {
  const map = new Map((exam.days ?? []).map((d) => [d.date, d]));
  return examDates(exam).map((date) => map.get(date) ?? { date, subjectIds: [] });
}

/** 시험에 나오는 과목들 (시간표 순, 그다음 범위만 넣은 과목) */
export function examSubjectIds(exam: Exam): Id[] {
  const out: Id[] = [];
  for (const d of timetable(exam)) for (const id of d.subjectIds) if (!out.includes(id)) out.push(id);
  for (const s of exam.scopes ?? []) if (!out.includes(s.subjectId)) out.push(s.subjectId);
  return out;
}

/** 시험 전체에서 체크한 범위 줄 / 전체 */
export function examProgress(exam: Exam): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const s of exam.scopes ?? [])
    for (const l of s.lines) {
      total++;
      if (l.done) done++;
    }
  return { done, total };
}

/** 시험이 끝나는 날 (과목 시험 날 중 가장 늦은 날) */
export function examEnd(exam: Exam): DateStr {
  let end = exam.end && exam.end > exam.date ? exam.end : exam.date;
  for (const s of exam.scopes ?? []) if (scopeDate(exam, s) > end) end = scopeDate(exam, s);
  for (const d of exam.days ?? []) if (d.subjectIds.length && d.date > end) end = d.date;
  return end;
}

/** 아직 끝나지 않은 시험 (가까운 순) */
export function upcomingExams(d: StudyData, today: DateStr): Exam[] {
  return alive(d.exams)
    .filter((e) => examEnd(e) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 그 시험에서 아직 보지 않은 과목들 (과목 시험 날 순) */
export function nextSubjects(exam: Exam, today: DateStr): ExamScope[] {
  return [...(exam.scopes ?? [])].filter((s) => scopeDate(exam, s) >= today).sort((a, b) => scopeDate(exam, a).localeCompare(scopeDate(exam, b)));
}

/** 학교 진도에 새 기록 (같은 날이면 고친다, 최근 30개) */
export function addProgress(list: { date: DateStr; text: string; at?: number }[] = [], date: DateStr, text: string, now = Date.now()) {
  const rest = list.filter((p) => p.date !== date);
  return [...rest, { date, text, at: now }].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
}

/** 진도 기록이 며칠 전인지 */
export const daysAgo = (today: DateStr, date: DateStr) => diffDays(date, today);
