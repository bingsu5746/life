// 학교 시간표 (요일마다 수업 과목): 다음 수업 날 찾기
import { addDays, weekday } from './dates';
import type { DateStr, Id, StudySettings } from './model';

type TT = StudySettings['schoolTimetable'];

/** 그날 수업 과목 (시간표 순) */
export const classesOn = (tt: TT, date: DateStr): Id[] => tt?.[String(weekday(date))] ?? [];

/** from 다음 날부터(includeFrom 이면 그날부터) 그 과목 수업이 있는 첫날. 2주 안에 없으면 null */
export function nextClassDate(tt: TT, subjectId: Id, from: DateStr, includeFrom = false, offDates: DateStr[] = []): DateStr | null {
  for (let i = includeFrom ? 0 : 1; i <= 14; i++) {
    const d = addDays(from, i);
    if (!offDates.includes(d) && classesOn(tt, d).includes(subjectId)) return d;
  }
  return null;
}

/** 시간표에 있는 과목인지 */
export const inTimetable = (tt: TT, subjectId: Id) => Object.values(tt ?? {}).some((ids) => ids.includes(subjectId));

/** 내일부터 7일 안에서 수업이 있는 첫날 (빼는 날 제외) */
export function nextSchoolDay(tt: TT, today: DateStr, offDates: DateStr[] = []): DateStr | null {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    if (!offDates.includes(d) && classesOn(tt, d).length) return d;
  }
  return null;
}
