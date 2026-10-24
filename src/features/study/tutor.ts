// 과외: 수업일 · 다음 수업일 · 숙제 마감 (설계 §6)
import { addDays, weekday } from './dates';
import type { DateStr, Homework, Tutor } from './model';

/** 그날 수업이 있는지 (휴강은 빼고, 보강은 넣음) */
export function hasClass(t: Pick<Tutor, 'weekdays' | 'cancelled' | 'extra'>, date: DateStr): boolean {
  if (t.extra.includes(date)) return true;
  return t.weekdays.includes(weekday(date)) && !t.cancelled.includes(date);
}

/**
 * from 다음 날부터 찾은 첫 수업일. includeFrom 이면 from 당일도 본다.
 * 요일도 보강도 없으면 null (최대 1년 앞까지 찾음).
 */
export function nextClass(t: Pick<Tutor, 'weekdays' | 'cancelled' | 'extra'>, from: DateStr, includeFrom = false): DateStr | null {
  for (let i = includeFrom ? 0 : 1; i <= 366; i++) {
    const d = addDays(from, i);
    if (hasClass(t, d)) return d;
  }
  return null;
}

/** 숙제 마감: 직접 정했으면 그대로, 아니면 받은 날 다음 수업일 (휴강을 나중에 넣어도 따라 바뀜) */
export function homeworkDue(hw: Pick<Homework, 'due' | 'dueManual' | 'given'>, tutor: Tutor | undefined): DateStr {
  if (hw.dueManual || !tutor) return hw.due;
  return nextClass(tutor, hw.given) ?? hw.due;
}

/** 오늘 수업이 있는 과외들 */
export function classesOn(tutors: Tutor[], date: DateStr): Tutor[] {
  return tutors.filter((t) => hasClass(t, date));
}
