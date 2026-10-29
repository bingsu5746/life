// 알림 글 만들기: 앞으로 7일 동안 날짜·시각마다 「오늘 할 것」「내일 준비」를 미리 계산해 서버에 맡긴다.
// (서버는 공부 자료를 열어 보지 않고, 정한 시각에 이 글을 그대로 보낸다)
import { addDays, diffDays, weekday, weekStart } from './dates';
import { upcomingExams, timetable } from './exams';
import { buildExamPlan } from './examPlan';
import { alive, type DateStr, type StudyData, type WordsData } from './model';
import { planViews, homeworkViews } from './select';
import { classesOn } from './timetable';
import { ruleDates, weekSpent } from '../life/calc';
import { backupDue } from './backup';
import { lifeWeek } from '../life/lifeWeek';

export interface DigestEntry {
  date: DateStr;
  slot: number;
  title: string;
  body: string;
  /** 눌렀을 때 열 화면 (앱 안 주소) */
  url?: string;
}

const names = (d: StudyData, ids: string[]) => ids.map((id) => d.subjects[id]?.name ?? '과목').join('·');

/** 그날 다시 볼 것 수 (오답·카드·단어·백지 복습, 상자에 든 것 중 그날까지 볼 것) */
function reviewCount(d: StudyData, words: WordsData, date: DateStr): number {
  const due = (r: { box: number; due: DateStr; learned?: boolean }) => r.box > 0 && !r.learned && r.due <= date;
  return alive(d.notes).filter(due).length + alive(d.cards).filter(due).length + alive(words).filter(due).length + alive(d.blanks).filter(due).length;
}

/** 자주 틀린 단어 중 그날 낼 세 개 (날짜마다 바뀐다) */
export function weakQuiz(words: WordsData, date: DateStr, n = 3): string[] {
  const weak = alive(words)
    .filter((w) => w.wrong > 0 && w.meaning)
    .sort((a, b) => b.wrong - a.wrong || a.term.localeCompare(b.term))
    .slice(0, 12);
  if (!weak.length) return [];
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const start = (day * n) % weak.length;
  return Array.from({ length: Math.min(n, weak.length) }, (_, i) => weak[(start + i) % weak.length].term);
}

/** 일요일 저녁: 이번 주 한 줄 요약 */
export function weekBody(d: StudyData, date: DateStr, today: DateStr): string {
  const w = lifeWeek(d, date, today);
  const hm = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}시간` : `${m}분`);
  const parts = [`공부 ${hm(w.study.now)}`, `운동 ${w.workout.days}일`, `쓴 돈 ${w.spent.now.toLocaleString('ko-KR')}원`];
  if (w.movies.length) parts.push(`영화 ${w.movies.length}편`);
  if (w.pages) parts.push(`책 ${w.pages}쪽`);
  return `이번 주 ${parts.join(' · ')} (눌러서 돌아보기)`;
}

/** 1월 1일이면 지난해 (본 영화가 있을 때만) */
export function awardsYear(d: StudyData, date: DateStr): number | null {
  if (date.slice(5) !== '01-01') return null;
  const y = Number(date.slice(0, 4)) - 1;
  return alive(d.movies).some((m) => m.status === 'watched' && m.watched?.startsWith(String(y))) ? y : null;
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
  const opens = alive(d.movies).filter((m) => m.status === 'want' && m.release === date);
  if (opens.length) parts.push(`오늘 개봉: ${opens.map((m) => m.title).join('·')}`);
  for (const e of alive(d.exams)) {
    const day = buildExamPlan(d, e, today)?.days.find((x) => x.date === date);
    const left = day?.items.filter((i) => !i.done) ?? [];
    if (left.length) parts.push(`${e.name} 공부 ${left.length}개 (${left.reduce((n, i) => n + i.minutes, 0)}분)`);
  }
  const rv = reviewCount(d, words, date);
  if (rv) parts.push(`복습 ${rv}개`);
  if (backupDue(d.settings.lastBackup, today) === date && (d.settings.lastBackup || date === today)) parts.push('백업 파일을 내려받을 때예요 (설정 → 백업)');
  const q = weakQuiz(words, date);
  if (q.length) parts.push(`단어 퀴즈: ${q.join(' · ')} 뜻은?`);
  const y = awardsYear(d, date);
  if (y) parts.unshift(`${y}년 영화 시상식이 열렸어요`);
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
  const opens = alive(d.movies).filter((m) => m.status === 'want' && m.release === next);
  if (opens.length) parts.push(`내일 개봉: ${opens.map((m) => m.title).join('·')}`);
  const lim = d.settings.weeklyLimit;
  const spent = lim ? weekSpent(d, date < today ? date : today) : 0;
  if (lim && spent > lim && weekStart(date) === weekStart(today)) parts.push(`이번 주 쓴 돈 ${spent.toLocaleString('ko-KR')}원 · 한도 ${lim.toLocaleString('ko-KR')}원을 넘었어요`);
  const pay = alive(d.moneyRules).filter((r) => !r.paused && r.type === 'out' && ruleDates(r, next, next).length);
  if (pay.length) parts.push(`내일 빠져나가는 돈: ${pay[0].name} ${pay[0].amount.toLocaleString('ko-KR')}원${pay.length > 1 ? ` 외 ${pay.length - 1}건` : ''}`);
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
      const y = am ? awardsYear(d, date) : null;
      const weak = am && weakQuiz(words, date).length > 0;
      const checkin = d.settings.checkinTime === t;
      if (checkin) {
        out.push({ date, slot, title: '오늘 어땠어요?', body: '기분 · 공부 · 운동을 눌러서 하루를 마감해요', url: '/checkin' });
        return;
      }
      const sunday = !am && weekday(date) === 0;
      out.push({ date, slot, title: y ? '🏆 영화 시상식' : sunday ? '내일 준비 · 이번 주 돌아보기' : am ? '오늘 할 것' : '내일 준비', body: sunday ? `${evening(d, today, date)} · ${weekBody(d, date, today)}` : am ? morning(d, words, today, date) : evening(d, today, date), url: y ? '/movies/ceremony' : sunday ? '/week' : weak ? '/words' : undefined });
    });
  }
  return out.slice(0, 24);
}
