// 과외: 수업일 · 다음 수업일 · 숙제 마감 (설계 §6)
import { addDays, weekday } from './dates';
import type { DateStr, Homework, StudyData, StudySession, Tutor } from './model';

/**
 * 끝난 과외 수업을 공부 기록으로 (최근 14일, 시각 · 길이가 있는 과외만).
 * 같은 과외 · 같은 날은 늘 같은 id 라 여러 기기에서 만들어도 하나, 이미 있거나 지운 것은 다시 만들지 않는다
 */
export function tutorSessions(d: Pick<StudyData, 'tutors' | 'sessions'>, today: DateStr, now = Date.now()): StudySession[] {
  const out: StudySession[] = [];
  for (const t of Object.values(d.tutors)) {
    if (t.deleted || !t.time || !t.minutes) continue;
    const created = (t as { created?: number }).created ?? 0;
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, -i);
      if (!hasClass(t, date)) continue;
      const id = `tut-${t.id}-${date}`;
      if (d.sessions[id]) continue;
      // 한국 시각 → 기기 시각과 상관없이 같은 값
      const start = Date.parse(`${date}T${t.time}:00+09:00`);
      const end = start + t.minutes * 60_000;
      if (Number.isNaN(start) || end > now || (created && start < created - 86_400_000)) continue;
      out.push({ id, subjectId: t.subjectId, start, end, minutes: t.minutes, date, kind: 'manual', place: t.place || '과외', memo: `${t.name} 수업` } as StudySession);
    }
  }
  return out;
}

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
