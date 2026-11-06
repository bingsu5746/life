// 내일 챙길 것: 내일 시간표 과목 · 과목별 준비물 · 수행평가 · 과외 숙제 · 시험 · 일정 · 늘 챙길 것을 한 목록으로 (기록에서 모으기만)
import { eventsBetween } from '../life/events';
import { addDays } from './dates';
import { examDates } from './exams';
import { alive, type DateStr, type StudyData } from './model';
import { homeworkViews } from './select';
import { classesOn } from './timetable';
import { hasClass } from './tutor';

export interface PackItem {
  /** 날짜가 바뀌어도 같은 것은 같은 id (체크 기억) */
  id: string;
  text: string;
  why: string;
}

export function packList(d: StudyData, day: DateStr): PackItem[] {
  const out: PackItem[] = [];
  const add = (id: string, text: string, why: string) => !out.some((x) => x.id === id) && out.push({ id, text, why });
  const off = d.settings.offDates.includes(day);
  // 시간표 과목: 교과서 · 그 과목 준비물
  if (!off)
    for (const sid of [...new Set(classesOn(d.settings.schoolTimetable, day))]) {
      const s = d.subjects[sid];
      if (!s || s.deleted) continue;
      const extra = d.settings.packBySubject?.[sid];
      add(`sub-${sid}`, `${s.name} 교과서 · 노트${extra ? ` · ${extra}` : ''}`, '내일 수업');
    }
  // 수행평가 내는 날
  for (const a of alive(d.assessments)) if (!a.done && a.due === day) add(`as-${a.id}`, `「${a.title}」 낼 것`, `${d.subjects[a.subjectId]?.name ?? ''} 수행평가`.trim());
  // 과외 숙제 (내일 수업이 있는 과외)
  for (const h of homeworkViews(d, addDays(day, -1))) if (!h.finished && h.due === day) add(`hw-${h.hw.id}`, `${h.tutorName} 숙제`, '내일 과외');
  for (const t of alive(d.tutors)) if (hasClass(t, day)) add(`tu-${t.id}`, `${t.name} 교재`, `과외${t.time ? ` ${t.time}` : ''}`);
  // 시험
  for (const e of alive(d.exams)) if (examDates(e).includes(day)) add(`ex-${e.id}`, '필기구 · 시험 범위 정리 노트', `시험: ${e.name}`);
  // 장소가 있는 일정 · 학원
  for (const { e } of eventsBetween(d, day, day).get(day) ?? []) add(`ev-${e.id}`, `${e.title}${e.start ? ` ${e.start}` : ''} 준비`, e.place || '일정');
  // 늘 챙길 것
  if (!off && classesOn(d.settings.schoolTimetable, day).length) (d.settings.packAlways ?? []).forEach((x, i) => add(`al-${i}-${x}`, x, '늘'));
  return out;
}
