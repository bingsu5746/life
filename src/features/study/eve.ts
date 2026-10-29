// 시험 전날 · 당일: 가장 가까운 시험 날(오늘 또는 내일)에 보는 과목들
import { addDays } from './dates';
import { examSubjectIds, subjectExamDate, upcomingExams } from './exams';
import type { DateStr, Exam, Id, StudyData } from './model';

export function eveTarget(d: StudyData, today: DateStr): { exam: Exam; date: DateStr; subjectIds: Id[] } | null {
  const tomorrow = addDays(today, 1);
  let best: { exam: Exam; date: DateStr; subjectIds: Id[] } | null = null;
  for (const exam of upcomingExams(d, today)) {
    for (const sid of examSubjectIds(exam)) {
      if (!d.subjects[sid] || d.subjects[sid].deleted) continue;
      const date = subjectExamDate(exam, sid);
      if (date !== today && date !== tomorrow) continue;
      if (!best || date < best.date) best = { exam, date, subjectIds: [sid] };
      else if (best.exam.id === exam.id && best.date === date && !best.subjectIds.includes(sid)) best.subjectIds.push(sid);
    }
  }
  return best;
}
