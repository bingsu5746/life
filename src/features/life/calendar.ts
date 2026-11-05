// 한 달 달력: 시험 · 수행평가 · 예습 · 할 일 · 영화 개봉 · 고정 지출 · 학교 일정을 날짜별로
import { daysBetween, weekday } from '../study/dates';
import { examEnd } from '../study/exams';
import { hasClass } from '../study/tutor';
import { alive, type DateStr, type StudyData } from '../study/model';
import { daysInMonth, ruleDates, won } from './calc';

export type CalKind = 'tutor' | 'exam' | 'task' | 'preview' | 'todo' | 'movie' | 'money' | 'school' | 'off' | 'holiday' | 'anniv';
export interface CalItem {
  kind: CalKind;
  label: string;
  /** 누르면 갈 곳 */
  to?: string;
  /** 과외 수업 (달력에서 「이날 수업 없음」으로 뺄 수 있게) · 뺀 날인지 */
  tutorId?: string;
  cancelled?: boolean;
}

export const CAL_KIND: Record<CalKind, string> = { tutor: '과외', exam: '시험', task: '수행', preview: '예습', todo: '할 일', movie: '개봉', money: '결제', school: '학교', off: '쉬는 날', holiday: '공휴일', anniv: '기념일' };

/** month: YYYY-MM. school: 나이스 학사일정 (있으면). special: 공휴일 · 기념일 (있으면) */
export function monthItems(d: StudyData, month: string, school: { date: DateStr; name: string; off: boolean }[] = [], special: { date: DateStr; name: string; holiday: boolean }[] = []): Map<DateStr, CalItem[]> {
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const m = new Map<DateStr, CalItem[]>();
  const add = (date: DateStr, it: CalItem) => {
    if (date < from || date > to) return;
    m.set(date, [...(m.get(date) ?? []), it]);
  };
  for (const e of alive(d.exams)) {
    const end = examEnd(e);
    if (end < from || e.date > to) continue;
    for (const day of daysBetween(e.date > from ? e.date : from, end < to ? end : to)) add(day, { kind: 'exam', label: e.name, to: `/exams/${e.id}` });
  }
  for (const a of alive(d.assessments)) if (!a.done) add(a.due, { kind: 'task', label: `${d.subjects[a.subjectId]?.name ?? ''} ${a.title}`.trim(), to: '/exams/tasks' });
  for (const t of alive(d.todos)) if (!t.done && t.due) add(t.due, { kind: 'todo', label: t.title });
  for (const v of alive(d.movies)) if (v.status === 'want' && v.release) add(v.release, { kind: 'movie', label: v.title, to: '/movies/want' });
  for (const r of alive(d.moneyRules)) if (!r.paused && r.type === 'out') for (const day of ruleDates(r, from, to)) if (r.freq !== 'daily') add(day, { kind: 'money', label: `${r.name} ${won(r.amount)}`, to: '/money/fixed' });
  for (const t of alive(d.tutors))
    for (const day of daysBetween(from, to)) {
      if (hasClass(t, day)) add(day, { kind: 'tutor', label: `${t.name}${t.time ? ` ${t.time}` : ''}`, tutorId: t.id });
      else if (t.cancelled.includes(day) && t.weekdays.includes(weekday(day))) add(day, { kind: 'tutor', label: `${t.name} (수업 없음)`, tutorId: t.id, cancelled: true });
    }
  for (const x of special) add(x.date, { kind: x.holiday ? 'holiday' : 'anniv', label: x.name });
  for (const s of school) if (!(s.off && special.some((x) => x.holiday && x.date === s.date && x.name === s.name))) add(s.date, { kind: s.off ? 'off' : 'school', label: s.name });
  for (const off of d.settings.offDates) if (!school.some((s) => s.date === off && s.off)) add(off, { kind: 'off', label: '빼는 날' });
  const order: CalKind[] = ['holiday', 'exam', 'off', 'school', 'tutor', 'task', 'preview', 'todo', 'money', 'movie', 'anniv'];
  for (const [k, v] of m)
    m.set(
      k,
      v.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)),
    );
  return m;
}
