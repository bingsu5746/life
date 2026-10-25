// 알림 글 만들기: 앞으로 7일 동안 날짜·시각마다 「오늘 할 것」「내일 준비」를 미리 계산해 서버에 맡긴다.
// (서버는 공부 자료를 열어 보지 않고, 정한 시각에 이 글을 그대로 보낸다)
import { addDays, diffDays } from './dates';
import { upcomingExams, timetable } from './exams';
import { alive, type DateStr, type StudyData, type WordsData } from './model';
import { planViews, homeworkViews } from './select';
import { classesOn } from './timetable';

export interface DigestEntry {
  date: DateStr;
  slot: number;
  title: string;
  body: string;
}

const names = (d: StudyData, ids: string[]) => ids.map((id) => d.subjects[id]?.name ?? '과목').join('·');

/** 그날 다시 볼 것 수 (오답·카드·단어·백지 복습, 상자에 든 것 중 그날까지 볼 것) */
function reviewCount(d: StudyData, words: WordsData, date: DateStr): number {
  const due = (r: { box: number; due: DateStr; learned?: boolean }) => r.box > 0 && !r.learned && r.due <= date;
  return alive(d.notes).filter(due).length + alive(d.cards).filter(due).length + alive(words).filter(due).length + alive(d.blanks).filter(due).length;
}

/** 그날 아침: 오늘 할 것 */
export function morning(d: StudyData, words: WordsData, today: DateStr, date: DateStr): string {
  const parts: string[] = [];
  for (const e of upcomingExams(d, today)) {
    const t = timetable(e).find((x) => x.date === date);
    if (t?.subjectIds.length) parts.push(`오늘 시험: ${names(d, t.subjectIds)}`);
    else if (e.date > date && diffDays(date, e.date) <= 14) parts.push(`${e.name} D-${diffDays(date, e.date)}`);
    if (parts.length) break;
  }
  const tasks = alive(d.assessments).filter((a) => !a.done && a.due >= date && diffDays(date, a.due) <= 2);
  for (const a of tasks) parts.push(`수행평가 ${a.due === date ? '오늘' : `D-${diffDays(date, a.due)}`}: ${d.subjects[a.subjectId]?.name ?? ''} ${a.title}`.replace(/\s+/g, ' '));
  const hw = homeworkViews(d, today).filter((h) => !h.finished && h.due === date);
  if (hw.length) parts.push(`오늘 마감 숙제 ${hw.length}개`);
  const plans = planViews(d, words, today);
  const items = plans.reduce((n, p) => n + (date === today ? p.sched.today.length : p.sched.days.find((x) => x.date === date)?.items.length ?? 0), 0);
  const books = plans.filter((p) => (date === today ? p.sched.today.length : p.sched.days.find((x) => x.date === date)?.items.length)).length;
  if (books) parts.push(`문제집·단어장 ${books}개 (${items}쪽·Day)`);
  const pv = alive(d.previews).filter((p) => !p.done && p.date === date);
  if (pv.length) parts.push(`오늘 수업 예습 ${pv.length}개`);
  const rv = reviewCount(d, words, date);
  if (rv) parts.push(`복습 ${rv}개`);
  return parts.length ? parts.join(' · ') : '오늘 정해 둔 것이 없어요. 공부 기록을 남겨 보세요';
}

/** 그날 저녁: 내일 준비 */
export function evening(d: StudyData, today: DateStr, date: DateStr): string {
  const next = addDays(date, 1);
  const parts: string[] = [];
  for (const e of upcomingExams(d, today)) {
    const t = timetable(e).find((x) => x.date === next);
    if (t?.subjectIds.length) {
      parts.push(`내일 시험: ${names(d, t.subjectIds)}`);
      break;
    }
    if (e.date === next) {
      parts.push(`내일 ${e.name}`);
      break;
    }
  }
  for (const a of alive(d.assessments).filter((a) => !a.done && a.due === next)) parts.push(`내일 수행평가: ${d.subjects[a.subjectId]?.name ?? ''} ${a.title}`.replace(/\s+/g, ' '));
  const hw = homeworkViews(d, today).filter((h) => !h.finished && h.due === next);
  if (hw.length) parts.push(`내일 마감 숙제 ${hw.length}개`);
  const pv = alive(d.previews).filter((p) => !p.done && p.date === next);
  if (pv.length) parts.push(`내일 수업 예습 ${pv.length}개`);
  else {
    const cls = classesOn(d.settings.schoolTimetable, next);
    if (cls.length) parts.push(`내일 수업: ${names(d, cls)}`);
  }
  return parts.length ? parts.join(' · ') : '내일 정해 둔 것이 없어요. 오늘 공부 시간을 기록했는지 확인해 보세요';
}

/** times: 알림 시각들 (오후 3시 전은 「오늘 할 것」, 뒤는 「내일 준비」) */
export function buildDigest(d: StudyData, words: WordsData, today: DateStr, times: string[], days = 7): DigestEntry[] {
  const out: DigestEntry[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    times.forEach((t, slot) => {
      const am = Number(t.slice(0, 2)) < 15;
      out.push({ date, slot, title: am ? '오늘 할 것' : '내일 준비', body: am ? morning(d, words, today, date) : evening(d, today, date) });
    });
  }
  return out.slice(0, 24);
}
