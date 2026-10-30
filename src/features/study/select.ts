// 저장된 자료 → 화면에 보일 것 (계획 대상, 오늘 할 것, 숙제 분량 …)
import { textAmount } from './splitHomework';
import { apportion } from './allocate';
import { addDays, daysBetween } from './dates';
import { habitOn } from './habits';
import { alive, type Book, type DateStr, type Homework, type HwItem, type Id, type MemoCard, type Plan, type StudyData, type Unit, type Word, type WordList, type WordsData } from './model';
import { doneSet, expand, MAX_DAYS } from './pages';
import { lockToday, schedule, type PlanCtx, type Schedule, type Target } from './plan';
import { dueToday, newToday } from './review';
import { homeworkDue } from './tutor';
import { bookNewToday, dueWords, finishedDays, inboxNewToday, isTestPrepDay, testNewToday } from './wordSession';

/** 오늘 볼 암기 카드: 복습할 카드 + 하루 정한 수만큼의 새 카드 */
export function cardsToday(d: StudyData, today: DateStr, deckId?: Id | null): MemoCard[] {
  const cs = alive(d.cards).filter((c) => !deckId || c.deckId === deckId);
  return [...dueToday(cs, today), ...newToday(cs, today)];
}

/** 오늘 복습 수 (오답 + 카드) */
/** 오늘 할 백지 복습: 한 번도 안 해 본 것 + 다시 볼 날이 된 것 */
export const blanksToday = (d: StudyData, today: DateStr) => alive(d.blanks).filter((b) => b.box === 0 || (!b.learned && b.due <= today));
export const reviewCountToday = (d: StudyData, today: DateStr) => dueToday(alive(d.notes), today).length + cardsToday(d, today).length + blanksToday(d, today).length;

export function planCtx(d: StudyData, today: DateStr): PlanCtx {
  return { today, settings: d.settings, tutors: alive(d.tutors), exams: d.exams };
}

/** 살아 있는 과외의 숙제만 (과외를 지우면 그 숙제도 오늘 화면·계획에서 빠진다) */
export const liveHomework = (d: StudyData): Homework[] => alive(d.homework).filter((hw) => d.tutors[hw.tutorId] && !d.tutors[hw.tutorId].deleted);

/** 과외 숙제로 잡힌 문제집 페이지 (문제집 계획에서 뺀다) */
export function reservedPages(d: StudyData, bookId: Id): Set<number> {
  const out = new Set<number>();
  for (const hw of liveHomework(d)) for (const it of hw.items) if (it.kind === 'pages' && it.bookId === bookId && it.range) for (const p of expand([it.range])) out.add(p);
  return out;
}

export const bookDone = (b: Book) => doneSet(b.done, b.undone);

export function listWords(words: WordsData, listId: Id): Word[] {
  return alive(words)
    .filter((w) => w.listId === listId)
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || a.order - b.order);
}

export const dayUnits = (n: number): Unit[] => Array.from({ length: Math.max(0, Math.min(MAX_DAYS, Math.floor(n) || 0)) }, (_, i) => ({ name: `Day ${i + 1}`, from: i + 1, to: i + 1 }));

/** 단어장에서 끝낸 Day: 직접 체크했거나, 그 Day 단어를 모두 한 번 이상 익힘 */
export function listDoneDays(list: WordList, ws: Word[]): Set<number> {
  const s = doneSet(list.done, list.undone);
  for (const d of finishedDays(ws)) s.add(d);
  return s;
}

export function targetOf(d: StudyData, words: WordsData, plan: Plan): Target | null {
  if (plan.target === 'book') {
    const b = d.books[plan.targetId];
    if (!b || b.deleted) return null;
    return { units: b.units, done: bookDone(b), reserved: reservedPages(d, b.id), subjectId: b.subjectId };
  }
  const l = d.wordLists[plan.targetId];
  if (!l || l.deleted) return null;
  return { units: dayUnits(l.days ?? 0), done: listDoneDays(l, listWords(words, l.id)), reserved: new Set(), subjectId: l.subjectId };
}

export interface PlanView {
  plan: Plan;
  name: string;
  subjectId: Id;
  sched: Schedule;
  target: Target;
}

export function planViews(d: StudyData, words: WordsData, today: DateStr): PlanView[] {
  const ctx = planCtx(d, today);
  const out: PlanView[] = [];
  for (const p of alive(d.plans)) {
    if (p.finished) continue;
    const t = targetOf(d, words, p);
    if (!t) continue;
    const owner = p.target === 'book' ? d.books[p.targetId] : d.wordLists[p.targetId];
    out.push({ plan: p, name: owner.name, subjectId: owner.subjectId, sched: schedule(p, t, ctx), target: t });
  }
  const order = (id: Id) => d.subjects[id]?.order ?? 99;
  return out.sort((a, b) => order(a.subjectId) - order(b.subjectId) || (a.sched.end ?? '').localeCompare(b.sched.end ?? ''));
}

/** 오늘 분량이 아직 고정되지 않은 계획들의 고정본 (저장은 부르는 쪽에서) */
export function pendingLocks(d: StudyData, words: WordsData, today: DateStr): Plan[] {
  const ctx = planCtx(d, today);
  const out: Plan[] = [];
  for (const p of alive(d.plans)) {
    const t = targetOf(d, words, p);
    if (!t) continue;
    const next = lockToday(p, t, ctx);
    if (next) out.push(next);
  }
  return out;
}

// ===== 과외 숙제 =====

export interface HwItemView {
  item: HwItem;
  /** 페이지 숙제: 남은 페이지, 오늘 분량 */
  remaining: number[];
  today: number[];
  finished: boolean;
  /** 글 숙제에서 찾은 분량 단위 (번 · 문제 · 강 …): 있으면 날마다 나눈다 */
  unit?: string;
}

export interface HomeworkView {
  hw: Homework;
  due: DateStr;
  tutorName: string;
  subjectId: Id;
  items: HwItemView[];
  finished: boolean;
}

function hwItemPagesDone(d: StudyData, it: HwItem): Set<number> {
  if (it.bookId && d.books[it.bookId] && !d.books[it.bookId].deleted) return bookDone(d.books[it.bookId]);
  return new Set(expand(it.doneRanges ?? []));
}

/** 숙제 페이지를 오늘부터 마감 전날(또는 마감 날)까지 고르게 (빼는 날짜는 건너뜀) */
export function homeworkToday(remaining: number[], today: DateStr, due: DateStr, includeDue: boolean, offDates: DateStr[]): number[] {
  const end = includeDue ? due : addDays(due, -1);
  const dates = end >= today ? daysBetween(today, end).filter((x) => x === today || !offDates.includes(x)) : [today];
  return remaining.slice(
    0,
    apportion(
      remaining.length,
      dates.map(() => 1),
    )[0],
  );
}

export function homeworkViews(d: StudyData, today: DateStr): HomeworkView[] {
  return liveHomework(d)
    .map((hw) => {
      const tutor = d.tutors[hw.tutorId];
      const due = homeworkDue(hw, tutor && !tutor.deleted ? tutor : undefined);
      const items = hw.items.map((item): HwItemView => {
        if (item.kind === 'text') {
          // 글 숙제도 분량(1~40번 · 30문제 …)이 있으면 마감까지 나눈다. 한 번호는 doneRanges 에
          const amt = item.done ? null : textAmount(item.text ?? '');
          if (!amt) return { item, remaining: [], today: [], finished: !!item.done };
          const done = new Set(expand(item.doneRanges ?? []));
          const remaining = expand([[amt.from, amt.to]]).filter((p) => !done.has(p));
          return { item, remaining, today: homeworkToday(remaining, today, due, hw.includeDue, d.settings.offDates), finished: remaining.length === 0, unit: amt.unit };
        }
        if (item.kind !== 'pages' || !item.range) return { item, remaining: [], today: [], finished: !!item.done };
        const done = hwItemPagesDone(d, item);
        const remaining = expand([item.range]).filter((p) => !done.has(p));
        return { item, remaining, today: homeworkToday(remaining, today, due, hw.includeDue, d.settings.offDates), finished: remaining.length === 0 };
      });
      return { hw, due, tutorName: tutor?.name ?? '과외', subjectId: tutor?.subjectId ?? '', items, finished: items.every((i) => i.finished) };
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

// ===== 영단어 =====

export interface WordListView {
  list: WordList;
  words: Word[];
  /** 오늘 새로 익힐 단어 */
  fresh: Word[];
  /** 오늘 복습할 단어 */
  due: Word[];
  prep: boolean;
  /** 단어장 계획의 오늘 Day */
  todayDays: number[];
  plan?: PlanView;
}

export function wordListViews(d: StudyData, words: WordsData, today: DateStr, plans: PlanView[]): WordListView[] {
  return alive(d.wordLists).map((list) => {
    const ws = listWords(words, list.id);
    const plan = plans.find((p) => p.plan.target === 'words' && p.plan.targetId === list.id);
    const todayDays = plan?.sched.today ?? [];
    const fresh = list.kind === 'test' ? testNewToday(list, ws, today) : list.kind === 'inbox' ? inboxNewToday(ws, today, d.settings.inboxPerDay) : bookNewToday(ws, todayDays);
    return { list, words: ws, fresh, due: dueToday(dueWords(ws, today), today), prep: isTestPrepDay(list, today), todayDays, plan };
  });
}

// ===== 오늘 한 줄 요약 (홈 화면 카드) =====

export interface TodaySummary {
  left: number;
  total: number;
  nextExam?: { name: string; date: DateStr };
}

export function todaySummary(d: StudyData, words: WordsData, today: DateStr): TodaySummary {
  const plans = planViews(d, words, today);
  let total = 0;
  let left = 0;
  for (const p of plans) {
    if (!p.sched.today.length) continue;
    total++;
    if (p.sched.today.some((x) => !p.target.done.has(x))) left++;
  }
  for (const h of homeworkViews(d, today)) {
    if (h.finished && h.due < today) continue;
    for (const i of h.items) {
      if (i.item.kind === 'pages' ? !i.today.length && !i.finished : false) continue;
      total++;
      if (!i.finished) left++;
    }
  }
  const reviewCount = reviewCountToday(d, today);
  if (reviewCount) {
    total++;
    left++;
  }
  const wl = wordListViews(d, words, today, plans);
  if (wl.some((w) => w.fresh.length || w.due.length)) {
    total++;
    left++;
  }
  for (const h of alive(d.habits)) {
    if (h.archived || !habitOn(h, today)) continue;
    total++;
    if (!h.checks.includes(today)) left++;
  }
  const exam = alive(d.exams)
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return { left, total, nextExam: exam && { name: exam.name, date: exam.date } };
}
