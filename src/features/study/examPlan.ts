// 시험 공부 자동 계획: 시험 범위(과목마다 줄)를 시험 날까지 날마다 나눠 담는다.
//
// 원칙
//  - 계획은 저장하지 않고 언제나 「지금 남은 것 ÷ 지금부터 남은 날」로 새로 계산한다 (밀리면 남은 날에 다시 나뉜다).
//  - 오늘 할 것만 오늘 처음 볼 때 고정(lock)해서 오늘 동안 바뀌지 않게 한다.
//  - 하루에 쓸 수 있는 시간(평일·주말)을 정해 두고, 쉬는 날 0 · 과외 날 비율 · 시험 보는 날 60% 로 줄인다.
//  - 과목마다 「시험 전날」까지만 공부한다 (그 과목 시험 날은 그 과목 공부 없음). 시험 날이 다른 과목은 각자 마감.
//  - 과목마다 순서: 처음 공부(범위의 줄마다) → 오답 다시 보기 → 복습 → 시험 전날 훑어보기. 마감 직전 이틀쯤(공부할 날이 4일 이상이면)은 새 공부 없이 복습만.
//  - 하루 시간을 과목들에 나누는 방법: 과목마다 「남은 시간 ÷ 마감까지 쓸 수 있는 시간」(급한 정도)에 비례해서.
//  - 최근 성적이 낮은 과목은 한 줄에 드는 시간을 조금 늘리고(최대 +40%), 높으면 조금 줄인다(최소 -10%). 과목별 배수는 직접 바꿀 수 있다.
//  - 시간이 모자라면 숨기지 않고 「하루 몇 분 더 필요해요」로 알린다.
import { addDays, daysBetween, weekday } from './dates';
import { examDates, scopeDate } from './exams';
import { alive, type DateStr, type Exam, type ExamPlanSettings, type Id, type StudyData } from './model';
import { hasClass } from './tutor';

export const DEFAULT_PLAN: Omit<ExamPlanSettings, 'on'> = { weekday: 150, weekend: 240, perLine: 40, review: 0.35 };

export interface PlanItem {
  id: string;
  kind: 'learn' | 'notes' | 'review' | 'skim';
  subjectId: Id;
  text: string;
  minutes: number;
  done: boolean;
  doneDate?: DateStr;
}

export interface PlanDay {
  date: DateStr;
  /** 그날 쓸 수 있는 시간 (분) */
  capacity: number;
  items: PlanItem[];
  minutes: number;
}

export interface SubjectPlan {
  subjectId: Id;
  examDate: DateStr;
  /** 마지막으로 공부하는 날 (시험 전날) */
  lastStudy: DateStr;
  studyDays: number;
  /** 남은 시간 (분) */
  need: number;
  mult: number;
  why: string;
}

export interface ExamPlanResult {
  days: PlanDay[];
  subjects: SubjectPlan[];
  /** 마감 안에 못 넣은 것 */
  overflow: PlanItem[];
  needTotal: number;
  capacityTotal: number;
  /** 모자라는 시간 (분) */
  short: number;
  /** 모자라지 않으려면 공부하는 날마다 더 필요한 시간 (분, 10분 단위) */
  extraPerDay: number;
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** 시각(ms) → 한국 날짜 */
export const kstDate = (ms: number): DateStr => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** 평소 공부한 시간으로 정한 하루 시간 제안 (최근 28일, 하루 평균 × 1.15 · 10분 단위). 기록이 적으면 기본값 */
export function suggestedMinutes(d: Pick<StudyData, 'sessions'>, today: DateStr): { weekday: number; weekend: number } {
  const from = addDays(today, -27);
  const by = new Map<DateStr, number>();
  for (const s of alive(d.sessions)) if (s.date >= from && s.date <= today) by.set(s.date, (by.get(s.date) ?? 0) + s.minutes);
  const avg = (weekend: boolean) => {
    const days = daysBetween(from, today).filter((x) => [0, 6].includes(weekday(x)) === weekend);
    const studied = days.filter((x) => by.has(x));
    if (studied.length < 3) return null;
    return Math.round(clamp((studied.reduce((a, x) => a + by.get(x)!, 0) / studied.length) * 1.15, 60, 420) / 10) * 10;
  };
  return { weekday: avg(false) ?? DEFAULT_PLAN.weekday, weekend: avg(true) ?? DEFAULT_PLAN.weekend };
}

/** 과목 이름의 최근 학교 성적(최대 3번)의 평균 백분율 (없으면 null) */
function recentScore(d: StudyData, subjectName: string): number | null {
  const scores: number[] = [];
  for (const g of alive(d.grades)
    .filter((x) => x.kind === 'school')
    .sort((a, b) => b.date.localeCompare(a.date))) {
    const s = g.scores.find((x) => x.subject === subjectName);
    if (!s) continue;
    if (s.raw !== undefined) scores.push((s.raw / (s.full || 100)) * 100);
    else if (s.grade !== undefined) scores.push(clamp(100 - (s.grade - 1) * 11, 0, 100));
    if (scores.length >= 3) break;
  }
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/** 과목 시간 배수: 최근 성적 75점이면 ×1, 낮을수록 늘리고(최대 1.4) 높을수록 줄인다(최소 0.9). 직접 정한 배수를 곱한다 */
export function subjectMult(d: StudyData, subjectId: Id, user = 1): { mult: number; why: string } {
  const name = d.subjects[subjectId]?.name ?? '';
  const sc = recentScore(d, name);
  const auto = sc === null ? 1 : 1 + 0.4 * clamp((75 - sc) / 40, -0.25, 1);
  const mult = Math.round(auto * user * 100) / 100;
  const parts: string[] = [];
  if (sc !== null) parts.push(`최근 점수 ${Math.round(sc)}점${auto > 1.02 ? ` → 시간 +${Math.round((auto - 1) * 100)}%` : auto < 0.98 ? ` → 시간 ${Math.round((auto - 1) * 100)}%` : ''}`);
  if (user !== 1) parts.push(`내가 정한 ×${user}`);
  return { mult, why: parts.join(' · ') || '기록 없음 (보통)' };
}

/** 한 날에 쓸 수 있는 시간 (분) */
function dayCapacity(d: StudyData, plan: ExamPlanSettings, date: DateStr, examDaySet: Set<DateStr>, today: DateStr, studiedToday: number): number {
  const s = d.settings;
  if (s.offDates.includes(date) || s.restDays.includes(weekday(date))) return 0;
  const weekend = [0, 6].includes(weekday(date));
  let c = weekend ? plan.weekend : plan.weekday;
  if (!weekend && alive(d.tutors).some((t) => hasClass(t, date))) c *= s.tutorRatio;
  if (examDaySet.has(date)) c *= 0.6;
  if (date === today) c = Math.max(c * 0.3, c - studiedToday);
  return Math.round(c);
}

interface Queued extends PlanItem {
  minDay: DateStr;
  /** 새 공부(처음 공부)의 마감 */
  learn: boolean;
}

/** 시험 하나의 날짜별 계획. 계획이 꺼져 있거나 범위가 없으면 null */
export function buildExamPlan(d: StudyData, exam: Exam, today: DateStr): ExamPlanResult | null {
  const plan = exam.plan;
  if (!plan?.on) return null;
  const scopes = (exam.scopes ?? []).filter((s) => s.lines.length > 0);
  if (!scopes.length) return null;
  const examDaySet = new Set(examDates(exam));
  const studiedToday = alive(d.sessions)
    .filter((s) => s.date === today)
    .reduce((a, s) => a + s.minutes, 0);
  const lastExam = scopes.reduce((m, s) => (scopeDate(exam, s) > m ? scopeDate(exam, s) : m), exam.date);
  const horizon = addDays(lastExam, -1);
  const allDays = horizon >= today ? daysBetween(today, horizon) : [];
  const cap = new Map(allDays.map((x) => [x, dayCapacity(d, plan, x, examDaySet, today, studiedToday)]));
  const lockIds = plan.lock?.date === today ? new Set(plan.lock.ids) : null;

  interface Sub {
    sp: SubjectPlan;
    queue: Queued[];
    days: DateStr[];
    learnEnd: DateStr;
    /** 새 공부를 이 날까지 끝내는 것을 목표로 (마감 전에 여유를 둔다) */
    learnGoal: DateStr;
    acc: number;
    skimDay: DateStr;
    /** 이 과목을 마지막으로 공부하는 날 (시험 전날이 쉬는 날이면 그 앞) */
    lastDay: DateStr;
  }
  const subs: Sub[] = [];
  const day0: PlanItem[] = [];
  const done = plan.done ?? {};

  for (const sc of scopes) {
    const examDate = scopeDate(exam, sc);
    const lastStudy = addDays(examDate, -1);
    if (lastStudy < today) continue; // 그 과목 시험이 시작됐거나 지났다
    const days = allDays.filter((x) => x <= lastStudy && (cap.get(x) ?? 0) > 0);
    // 오늘이 쉬는 날이어도 이미 한 것은 보여 준다. 공부할 날이 하나도 없으면 오늘을 넣는다
    const studyDays = days.length ? days : [lastStudy >= today ? today : lastStudy];
    const um = plan.weights?.[sc.subjectId] ?? 1;
    const { mult, why } = subjectMult(d, sc.subjectId, um);
    const name = d.subjects[sc.subjectId]?.name ?? '과목';
    const queue: Queued[] = [];
    const minLearn = round5(plan.perLine * mult);
    let learnTotal = 0;
    // 새 공부 마감: 공부할 날이 4일 이상이면 마지막 이틀(공부할 날의 1/3 이내)은 복습만
    const reviewDays = studyDays.length >= 4 ? Math.min(2, Math.floor(studyDays.length / 3)) : 0;
    const learnEnd = studyDays[studyDays.length - 1 - reviewDays];
    for (const l of sc.lines) {
      learnTotal += minLearn;
      const doneDate = l.done && l.at ? kstDate(l.at) : undefined;
      queue.push({ id: `L:${l.id}`, kind: 'learn', subjectId: sc.subjectId, text: l.text, minutes: minLearn, done: l.done, doneDate, minDay: today, learn: true });
    }
    const wrongN = alive(d.notes).filter((n) => n.subjectId === sc.subjectId && !n.learned).length;
    if (wrongN > 0) queue.push({ id: `N:${sc.id}`, kind: 'notes', subjectId: sc.subjectId, text: `${name} 오답 ${wrongN}개 다시 보기`, minutes: round5(Math.min(40, wrongN * 3)), done: !!done[`N:${sc.id}`], doneDate: done[`N:${sc.id}`], minDay: today, learn: false });
    const revTotal = round5(learnTotal * plan.review);
    const chunks = Math.max(1, Math.round(revTotal / 30));
    for (let i = 1; i <= chunks; i++) {
      const id = `R:${sc.id}:${i}`;
      queue.push({ id, kind: 'review', subjectId: sc.subjectId, text: `${name} 범위 복습 ${i}/${chunks}`, minutes: round5(revTotal / chunks), done: !!done[id], doneDate: done[id], minDay: today, learn: false });
    }
    const skimId = `S:${sc.id}`;
    const skimDay = studyDays[studyDays.length - 1];
    queue.push({ id: skimId, kind: 'skim', subjectId: sc.subjectId, text: `${name} 시험 전날 훑어보기 (핵심·오답)`, minutes: 30, done: !!done[skimId], doneDate: done[skimId], minDay: skimDay, learn: false });
    subs.push({
      sp: { subjectId: sc.subjectId, examDate, lastStudy, studyDays: days.length, need: 0, mult, why },
      queue,
      days: studyDays,
      learnEnd,
      learnGoal: studyDays[Math.max(0, Math.floor((studyDays.indexOf(learnEnd) >= 0 ? studyDays.indexOf(learnEnd) : 0) * 0.7))],
      acc: 0,
      skimDay,
      lastDay: skimDay,
    });
  }

  const dayResults = new Map<DateStr, PlanItem[]>(allDays.map((x) => [x, []]));
  const strip = ({ minDay: _m, learn: _l, ...rest }: Queued): PlanItem => rest;

  // 1) 오늘 이미 끝낸 것은 오늘 한 것으로 (오늘 시간을 쓴 것). 오늘 이전에 끝낸 것은 뺀다
  // 2) 오늘 고정(lock)이 있으면 그 목록이 오늘 할 것
  for (const s of subs) {
    s.queue = s.queue.filter((it) => {
      if (lockIds?.has(it.id)) {
        day0.push(strip(it));
        return false;
      }
      if (it.done) {
        if (it.doneDate === today) day0.push(strip(it));
        return false;
      }
      return true;
    });
  }
  if (allDays.length) dayResults.get(today)?.push(...day0);

  const spent = (items: PlanItem[]) => items.reduce((a, x) => a + x.minutes, 0);
  const overflow: PlanItem[] = [];
  const start = lockIds ? 1 : 0;

  for (let t = start; t < allDays.length; t++) {
    const date = allDays[t];
    let c = cap.get(date) ?? 0;
    if (date === today) c = Math.max(0, c - spent(dayResults.get(today)!));
    const active = subs.filter((s) => date <= s.lastDay && s.queue.length);
    if (!active.length) continue;
    const pulled = new Map<Sub, Queued[]>();
    // 시험 전날 훑어보기는 그날 맨 먼저
    for (const s of active) {
      if (date !== s.skimDay) continue;
      const k = s.queue.findIndex((it) => it.kind === 'skim');
      if (k >= 0) {
        const [it] = s.queue.splice(k, 1);
        pulled.set(s, [...(pulled.get(s) ?? []), it]);
        c -= it.minutes;
      }
    }
    // 과목마다 급한 정도 = 남은 시간 ÷ 마감까지 쓸 수 있는 시간
    const rates = new Map<Sub, number>();
    for (const s of active) {
      const inLearn = date <= s.learnEnd && s.queue.some((it) => it.learn);
      const end = inLearn ? (date <= s.learnGoal ? s.learnGoal : s.learnEnd) : s.lastDay;
      const need = s.queue.filter((it) => (inLearn ? it.learn : true) && it.kind !== 'skim').reduce((a, it) => a + it.minutes, 0);
      const room = allDays.filter((x) => x >= date && x <= end).reduce((a, x) => a + (cap.get(x) ?? 0), 0);
      rates.set(s, need > 0 ? need / Math.max(room, 1) : 0);
    }
    // 과목마다 그날 쓸 시간 = 하루 시간 × 급한 정도 (합이 1을 넘으면 나눠서 줄인다) → 마감까지 고르게 퍼진다
    const total = Math.max(
      1,
      [...rates.values()].reduce((a, b) => a + b, 0),
    );
    for (const s of active) {
      const share = (Math.max(c, 0) * rates.get(s)!) / total;
      s.acc += share;
      const lastDay = date === s.lastDay;
      const got = pulled.get(s) ?? [];
      for (;;) {
        const next = s.queue.find((it) => it.kind !== 'skim' && it.minDay <= date);
        if (!next) break;
        if (!lastDay && s.acc < next.minutes * 0.5) break;
        if (!lastDay && next.kind !== 'learn' && date <= s.learnEnd && s.queue.some((it) => it.learn)) break;
        s.queue.splice(s.queue.indexOf(next), 1);
        s.acc -= next.minutes;
        got.push(next);
      }
      pulled.set(s, got);
    }
    // 하루 시간을 15% 넘게 쓰면 마감이 급하지 않은 과목의 마지막 것부터 다음 날로
    const tot = () => [...pulled.values()].flat().reduce((a, x) => a + x.minutes, 0);
    const limit = (cap.get(date) ?? 0) * 1.15;
    while (tot() > Math.max(limit, 1)) {
      const s = [...pulled.entries()].filter(([sb, items]) => date !== sb.lastDay && items.some((x) => x.kind !== 'skim')).sort((a, b) => b[0].acc - a[0].acc)[0]?.[0];
      if (!s) break;
      const items = pulled.get(s)!;
      const k = items.map((x) => x.kind).lastIndexOf('learn') >= 0 ? items.map((x) => x.kind).lastIndexOf('learn') : items.length - 1;
      const [back] = items.splice(k, 1);
      s.queue.unshift(back);
      s.acc += back.minutes;
    }
    dayResults.get(date)!.push(...[...pulled.values()].flat().map(strip));
  }
  for (const s of subs) overflow.push(...s.queue.map(strip));

  const days: PlanDay[] = allDays.map((date) => {
    const items = dayResults.get(date)!;
    return { date, capacity: cap.get(date) ?? 0, items, minutes: spent(items) };
  });
  for (const s of subs) s.sp.need = [...s.queue, ...days.flatMap((x) => x.items.filter((it) => it.subjectId === s.sp.subjectId && !it.done))].reduce((a, it) => a + it.minutes, 0);
  const needTotal = subs.reduce((a, s) => a + s.sp.need, 0);
  const capacityTotal = days.reduce((a, x) => a + x.capacity, 0);
  const over = days.reduce((a, x) => a + Math.max(0, Math.round(x.minutes - x.capacity * 1.15)), 0);
  const short = spent(overflow) + over;
  const studyDayCount = Math.max(1, days.filter((x) => x.capacity > 0).length);
  return { days, subjects: subs.map((s) => s.sp), overflow, needTotal, capacityTotal, short, extraPerDay: short > 0 ? Math.ceil(short / studyDayCount / 10) * 10 : 0 };
}

/** 오늘 계획을 오늘 처음 볼 때 고정할 시험들 (켜 둔 시험 중 오늘 고정이 없는 것) */
export function pendingExamLocks(d: StudyData, today: DateStr): Exam[] {
  const out: Exam[] = [];
  for (const e of alive(d.exams)) {
    if (!e.plan?.on || e.plan.lock?.date === today) continue;
    const r = buildExamPlan(d, e, today);
    const ids = r?.days.find((x) => x.date === today)?.items.map((x) => x.id) ?? [];
    out.push({ ...e, plan: { ...e.plan, lock: { date: today, ids } } });
  }
  return out;
}

/** 오늘 할 것 (켜 둔 시험 모두) */
export function todayExamItems(d: StudyData, today: DateStr): { exam: Exam; items: PlanItem[]; result: ExamPlanResult }[] {
  const out: { exam: Exam; items: PlanItem[]; result: ExamPlanResult }[] = [];
  for (const e of alive(d.exams)) {
    const r = buildExamPlan(d, e, today);
    if (!r) continue;
    out.push({ exam: e, items: r.days.find((x) => x.date === today)?.items ?? [], result: r });
  }
  return out;
}

/** 계획 한 줄 체크: 범위 줄이면 그 줄, 그 밖은 plan.done 에 */
export function toggleItem(exam: Exam, id: string, today: DateStr, now = Date.now()): Exam {
  if (id.startsWith('L:')) {
    const lineId = id.slice(2);
    return { ...exam, scopes: (exam.scopes ?? []).map((s) => ({ ...s, lines: s.lines.map((l) => (l.id === lineId ? { ...l, done: !l.done, at: now } : l)) })) };
  }
  const done = { ...(exam.plan?.done ?? {}) };
  if (done[id]) delete done[id];
  else done[id] = today;
  return { ...exam, plan: { ...(exam.plan as ExamPlanSettings), done } };
}

export interface SubjectReview {
  subjectId: Id;
  lines: number;
  /** 시험 날까지 끝낸 줄 */
  done: number;
  /** 계획에서 잡은 시간 · 실제로 적은 공부 시간 (분) */
  planned: number;
  actual: number;
  /** 실제 점수 (백분율, 성적을 넣었을 때) */
  score: number | null;
}

export interface PlanReview {
  subjects: SubjectReview[];
  /** 끝낸 줄 비율 0~1 */
  doneRate: number;
  /** 실제로 한 줄에 쓴 시간 (분, 자료가 모자라면 null) */
  perLine: number | null;
  /** 계획 기간에 실제로 공부한 하루 평균 (평일 · 주말, 분) */
  weekday: number | null;
  weekend: number | null;
  from: DateStr;
  to: DateStr;
}

/** 끝난 시험의 계획 돌아보기: 계획대로 한 비율 · 실제 공부 시간 · 점수 · 다음 계획에 쓸 값 */
export function reviewExamPlan(d: StudyData, exam: Exam): PlanReview | null {
  const plan = exam.plan;
  const scopes = (exam.scopes ?? []).filter((s) => s.lines.length);
  if (!plan || !scopes.length) return null;
  const from = plan.started ?? addDays(exam.date, -14);
  const to = addDays(exam.date, -1);
  const grade = alive(d.grades).find((g) => g.examId === exam.id);
  const subjects: SubjectReview[] = scopes.map((sc) => {
    const examDate = scopeDate(exam, sc);
    const done = sc.lines.filter((l) => l.done && (!l.at || kstDate(l.at) <= examDate)).length;
    const { mult } = subjectMult(d, sc.subjectId, plan.weights?.[sc.subjectId] ?? 1);
    const actual = alive(d.sessions)
      .filter((s) => s.subjectId === sc.subjectId && s.date >= from && s.date < examDate)
      .reduce((a, s) => a + s.minutes, 0);
    const sName = d.subjects[sc.subjectId]?.name;
    const sc2 = grade?.scores.find((x) => x.subject === sName);
    const score = sc2 ? (sc2.raw !== undefined ? Math.round((sc2.raw / (sc2.full || 100)) * 100) : null) : null;
    return { subjectId: sc.subjectId, lines: sc.lines.length, done, planned: round5(plan.perLine * mult) * sc.lines.length, actual, score };
  });
  const lines = subjects.reduce((a, s) => a + s.lines, 0);
  const done = subjects.reduce((a, s) => a + s.done, 0);
  const actual = subjects.reduce((a, s) => a + s.actual, 0);
  const perLine = done >= 3 && actual > 0 ? Math.min(180, Math.max(10, round5(actual / done))) : null;
  // 계획 기간의 날마다 공부 시간 (모든 과목)
  const by = new Map<DateStr, number>();
  for (const s of alive(d.sessions)) if (s.date >= from && s.date <= to) by.set(s.date, (by.get(s.date) ?? 0) + s.minutes);
  const avg = (weekend: boolean) => {
    const days = from <= to ? daysBetween(from, to).filter((x) => [0, 6].includes(weekday(x)) === weekend) : [];
    if (days.length < 2) return null;
    return Math.round(days.reduce((a, x) => a + (by.get(x) ?? 0), 0) / days.length / 10) * 10;
  };
  return { subjects, doneRate: lines ? done / lines : 0, perLine, weekday: avg(false), weekend: avg(true), from, to };
}
