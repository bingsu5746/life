// AI 학습 코치: 지난 7일 공부 · 과목별 목표 · 다가오는 시험(범위 진도) · 남은 오답 · 숙제를 모은 글 (서버 AI 가 이걸 보고 다음 주 계획을 짠다)
import { addDays, diffDays, shortDate, weekday, weekStart, WEEKDAYS } from './dates';
import { eventsBetween } from '../life/events';
import { hasClass } from './tutor';
import { examDates } from './exams';
import { examProgress, upcomingExams } from './exams';
import { alive, type StudyData } from './model';
import { homeworkViews } from './select';

const h = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

/** AI 코치가 계획할 주: 금 · 토 · 일에는 다음 주, 아니면 이번 주 (월요일 날짜) */
export const coachWeek = (today: string) => (weekday(today) === 0 || weekday(today) >= 5 ? addDays(weekStart(today), 7) : weekStart(today));

export interface BusyDay {
  date: string;
  /** 그날 일정 · 시험 이름 */
  labels: string[];
  /** 일정에 쓰는 시간 (분, 하루 종일은 4시간으로) */
  busy: number;
  exam: boolean;
  /** 공부 시간을 얼마나 남길지 (1 = 그대로) */
  keep: number;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** 그 주(월~일) 날마다 일정 · 시험 · 과외 → 바쁜 정도 */
export function busyDays(d: StudyData, start: string): BusyDay[] {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const evs = eventsBetween(d, dates[0], dates[6]);
  const examOn = new Map<string, string[]>();
  for (const e of alive(d.exams)) for (const x of examDates(e)) if (dates.includes(x)) examOn.set(x, [...(examOn.get(x) ?? []), e.name]);
  return dates.map((date) => {
    const labels: string[] = [];
    let busy = 0;
    for (const { e } of evs.get(date) ?? []) {
      // 공부로 기록하는 일정(학원 · 과외)도 그 시간엔 따로 공부를 못 한다
      const m = e.allDay ? 240 : e.start && e.end ? Math.max(0, toMin(e.end) - toMin(e.start)) : 60;
      busy += m;
      labels.push(`${e.title}${e.allDay ? ' (하루 종일)' : e.start ? ` ${e.start}${e.end ? `~${e.end}` : ''}` : ''}`);
    }
    for (const t of alive(d.tutors))
      if (hasClass(t, date)) {
        busy += t.minutes ?? 90;
        labels.push(`${t.name} 과외${t.time ? ` ${t.time}` : ''}`);
      }
    const ex = examOn.get(date) ?? [];
    for (const n of ex) labels.push(`시험: ${n}`);
    const exam = ex.length > 0;
    const keep = exam || busy >= 240 ? 0.5 : busy >= 120 ? 0.7 : busy >= 60 ? 0.85 : 1;
    return { date, labels, busy, exam, keep };
  });
}

/**
 * AI 가 짠 요일별 계획을 바쁜 날에 맞춰 줄인다: 그날 공부 합이 「바쁘지 않은 날 평균 × keep」을 넘으면 그만큼 비율로 깎는다 (5분 단위).
 * 줄인 요일은 cut 에 표시
 */
export function fitToBusy<T extends { day: string; items: { minutes: number }[] }>(plan: T[], busy: BusyDay[]): (T & { cut?: number })[] {
  const byDay = (p: T) => busy.find((b) => WEEKDAYS[weekday(b.date)] === p.day);
  const sum = (p: T) => p.items.reduce((a, x) => a + x.minutes, 0);
  const calm = plan.filter((p) => (byDay(p)?.keep ?? 1) === 1 && sum(p) > 0);
  const base = calm.length ? calm.reduce((a, p) => a + sum(p), 0) / calm.length : Math.max(0, ...plan.map(sum));
  return plan.map((p) => {
    const b = byDay(p);
    const total = sum(p);
    if (!b || b.keep === 1 || !total) return p;
    const cap = Math.round(base * b.keep);
    if (total <= cap) return p;
    const r = cap / total;
    return { ...p, cut: total - cap, items: p.items.map((x) => ({ ...x, minutes: Math.max(5, Math.round((x.minutes * r) / 5) * 5) })) };
  });
}

export function coachRecord(d: StudyData, today: string): string {
  const from = addDays(today, -6);
  const ses = alive(d.sessions).filter((s) => s.date >= from && s.date <= today);
  const subs = alive(d.subjects);
  const by = subs
    .map((s) => ({ s, min: ses.filter((x) => x.subjectId === s.id).reduce((a, x) => a + x.minutes, 0) }))
    .filter((x) => x.min || x.s.weeklyGoal)
    .map((x) => `- ${x.s.name}: ${h(x.min)}${x.s.weeklyGoal ? ` (주간 목표 ${x.s.weeklyGoal}시간)` : ''}`);
  const days = new Set(ses.map((s) => s.date)).size;
  const total = ses.reduce((a, s) => a + s.minutes, 0);
  const exams = upcomingExams(d, today)
    .filter((e) => diffDays(today, e.date) <= 45)
    .map((e) => {
      const p = examProgress(e);
      const scopes = (e.scopes ?? []).map((sc) => `${d.subjects[sc.subjectId]?.name ?? '과목'} ${sc.lines.filter((l) => l.done).length}/${sc.lines.length}`).join(', ');
      return `- ${e.name} D-${diffDays(today, e.date)} (범위 진도 ${p.done}/${p.total}${scopes ? `: ${scopes}` : ''})`;
    });
  const notes = subs.map((s) => ({ s, n: alive(d.notes).filter((x) => x.subjectId === s.id && !x.learned).length })).filter((x) => x.n);
  const hw = homeworkViews(d, today).filter((x) => !x.finished).length;
  return [
    `[과목] ${subs.map((s) => s.name).join(', ') || '없음'}`,
    `[지난 7일] 모두 ${h(total)} · 공부한 날 ${days}일`,
    ...(by.length ? by : ['- (과목별 기록 없음)']),
    '',
    `[다가오는 시험]`,
    ...(exams.length ? exams : ['- 45일 안에 시험 없음']),
    '',
    `[남은 오답] ${notes.length ? notes.map((x) => `${x.s.name} ${x.n}개`).join(', ') : '없음'}`,
    `[안 끝낸 숙제] ${hw}개`,
    '',
    `[계획할 주] ${shortDate(coachWeek(today))} ~ ${shortDate(addDays(coachWeek(today), 6))}`,
    `[그 주 일정 · 시험] (바쁜 날은 공부 시간을 줄여서)`,
    ...busyDays(d, coachWeek(today)).map((b) => `- ${WEEKDAYS[weekday(b.date)]}: ${b.labels.length ? `${b.labels.join(', ')}${b.keep < 1 ? ` → 평소의 ${Math.round(b.keep * 100)}%만` : ''}` : '일정 없음'}`),
  ].join('\n');
}
