// 주간 돌아보기: 한 주(월~일)에 한 것과 다음 주 할 것
import { addDays, daysBetween } from './dates';
import { examEnd, upcomingExams } from './exams';
import { alive, type DateStr, type StudyData, type WordsData } from './model';
import { sleepMinutes } from './condition';
import { homeworkViews } from './select';

const inWeek = (date: DateStr | undefined, from: DateStr) => !!date && date >= from && date <= addDays(from, 6);
const tsInWeek = (t: number | undefined, from: DateStr) => {
  if (!t) return false;
  const start = new Date(`${from}T00:00:00`).getTime();
  return t >= start && t < start + 7 * 86_400_000;
};

export interface WeekSummary {
  from: DateStr;
  minutes: number;
  prevMinutes: number;
  studyDays: number;
  perDay: { date: DateStr; min: number }[];
  bySubject: { subjectId: string; min: number }[];
  previews: number;
  todos: number;
  habitChecks: number;
  habitPossible: number;
  newNotes: number;
  blankTries: number;
  newWords: number;
  sleepAvg: number | null;
  moodAvg: number | null;
  next: { date: DateStr; text: string }[];
}

export function weekSummary(d: StudyData, words: WordsData, from: DateStr, today: DateStr): WeekSummary {
  const days = daysBetween(from, addDays(from, 6));
  const sessions = alive(d.sessions);
  const perDay = days.map((date) => ({ date, min: sessions.filter((s) => s.date === date).reduce((a, s) => a + s.minutes, 0) }));
  const minutes = perDay.reduce((a, x) => a + x.min, 0);
  const prevMinutes = sessions.filter((s) => inWeek(s.date, addDays(from, -7))).reduce((a, s) => a + s.minutes, 0);
  const subj = new Map<string, number>();
  for (const s of sessions) if (inWeek(s.date, from)) subj.set(s.subjectId ?? '', (subj.get(s.subjectId ?? '') ?? 0) + s.minutes);
  const habits = alive(d.habits).filter((h) => !h.archived);
  let possible = 0;
  for (const h of habits) for (const date of days) if (date <= today && date >= h.created && (!h.weekdays.length || h.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()))) possible++;
  const conds = days.map((date) => d.conditions[date]).filter((c) => c && !c.deleted);
  const sl = conds.map((c) => sleepMinutes(c)).filter((x): x is number => x !== null);
  const md = conds.map((c) => c!.mood).filter((x): x is number => !!x);
  // 다음 주 (이 주가 끝난 뒤 7일): 시험 · 수행평가 · 숙제 마감
  const nFrom = addDays(from, 7);
  const next: { date: DateStr; text: string }[] = [];
  for (const e of upcomingExams(d, today)) if (inWeek(e.date, nFrom) || (e.date < nFrom && examEnd(e) >= nFrom)) next.push({ date: e.date, text: `시험: ${e.name}` });
  for (const a of alive(d.assessments)) if (!a.done && inWeek(a.due, nFrom)) next.push({ date: a.due, text: `수행평가: ${d.subjects[a.subjectId]?.name ?? ''} ${a.title}`.trim() });
  for (const h of homeworkViews(d, today)) if (!h.finished && inWeek(h.due, nFrom)) next.push({ date: h.due, text: `숙제: ${h.tutorName}` });
  next.sort((a, b) => a.date.localeCompare(b.date));
  return {
    from,
    minutes,
    prevMinutes,
    studyDays: perDay.filter((x) => x.min > 0).length,
    perDay,
    bySubject: [...subj.entries()].map(([subjectId, min]) => ({ subjectId, min })).sort((a, b) => b.min - a.min),
    previews: alive(d.previews).filter((p) => p.done && tsInWeek(p.doneAt, from)).length,
    todos: alive(d.todos).filter((t) => t.done && tsInWeek(t.doneAt, from)).length,
    habitChecks: habits.reduce((a, h) => a + h.checks.filter((c) => inWeek(c, from)).length, 0),
    habitPossible: possible,
    newNotes: alive(d.notes).filter((n) => tsInWeek(n.created, from)).length,
    blankTries: alive(d.blanks).reduce((a, b) => a + b.tries.filter((t) => inWeek(t.date, from)).length, 0),
    newWords: alive(words).filter((w) => inWeek(w.firstSeen, from)).length,
    sleepAvg: sl.length ? Math.round(sl.reduce((a, b) => a + b, 0) / sl.length) : null,
    moodAvg: md.length ? Math.round((md.reduce((a, b) => a + b, 0) / md.length) * 10) / 10 : null,
    next,
  };
}
