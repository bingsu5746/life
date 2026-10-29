// 한 달 달력: 시험 · 수행평가 · 예습 · 할 일 · 영화 개봉 · 고정 지출 · 학교 일정을 날짜별로
import { daysBetween } from '../study/dates';
import { examEnd } from '../study/exams';
import { alive, type DateStr, type StudyData } from '../study/model';
import { daysInMonth, ruleDates, won } from './calc';

export type CalKind = 'exam' | 'task' | 'preview' | 'todo' | 'movie' | 'money' | 'school' | 'off';
export interface CalItem {
  kind: CalKind;
  label: string;
  /** 누르면 갈 곳 */
  to?: string;
}

export const CAL_KIND: Record<CalKind, string> = { exam: '시험', task: '수행', preview: '예습', todo: '할 일', movie: '개봉', money: '결제', school: '학교', off: '쉬는 날' };

/** month: YYYY-MM. school: 나이스 학사일정 (있으면) */
export function monthItems(d: StudyData, month: string, school: { date: DateStr; name: string; off: boolean }[] = []): Map<DateStr, CalItem[]> {
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
  for (const p of alive(d.previews)) if (!p.done) add(p.date, { kind: 'preview', label: `${d.subjects[p.subjectId]?.name ?? ''} ${p.text}`.trim(), to: '/preview' });
  for (const t of alive(d.todos)) if (!t.done && t.due) add(t.due, { kind: 'todo', label: t.title });
  for (const v of alive(d.movies)) if (v.status === 'want' && v.release) add(v.release, { kind: 'movie', label: v.title, to: '/movies/want' });
  for (const r of alive(d.moneyRules)) if (!r.paused && r.type === 'out') for (const day of ruleDates(r, from, to)) if (r.freq !== 'daily') add(day, { kind: 'money', label: `${r.name} ${won(r.amount)}`, to: '/money/fixed' });
  for (const s of school) add(s.date, { kind: s.off ? 'off' : 'school', label: s.name });
  for (const off of d.settings.offDates) if (!school.some((s) => s.date === off && s.off)) add(off, { kind: 'off', label: '빼는 날' });
  const order: CalKind[] = ['exam', 'off', 'school', 'task', 'preview', 'todo', 'money', 'movie'];
  for (const [k, v] of m)
    m.set(
      k,
      v.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)),
    );
  return m;
}
