// 화면에서 자주 하는 고치기 (체크·진도·숙제·기록)
import { addDays } from './dates';
import { alive, newId, type DateStr, type Homework, type HwItem, type Id, type Mark, type Range, type StudySession, type Word, type WordsData } from './model';
import { compactMarks, compress, expand } from './pages';
import { firstAnswer, type Mode } from './wordSession';
import type { Via } from './review';
import { getStudy, put, putMany, putWords, remove } from './store';
import { planDue } from './plan';
import { listWords } from './select';

function marks(prev: { done: Mark[]; undone: Mark[] }, items: number[], on: boolean) {
  const at = Date.now();
  const add = compress(items).map(([a, b]) => [a, b, at] as Mark);
  return compactMarks(on ? [...prev.done, ...add] : prev.done, on ? prev.undone : [...prev.undone, ...add]);
}

/** 문제집 페이지 체크·해제 */
export function markBook(bookId: Id, pages: number[], on: boolean) {
  const b = getStudy().books[bookId];
  if (!b || !pages.length) return;
  put('books', { ...b, ...marks(b, pages, on) });
}

/** 단어장 Day 체크·해제 */
export function markDays(listId: Id, days: number[], on: boolean) {
  const l = getStudy().wordLists[listId];
  if (!l || !days.length) return;
  put('wordLists', { ...l, ...marks(l, days, on) });
}

/** 「p.__ 까지 풀었어요」: 오늘 분량 중 그 페이지까지를 체크 */
export function doneUpTo(bookId: Id, todayItems: number[], upTo: number) {
  markBook(
    bookId,
    todayItems.filter((p) => p <= upTo),
    true,
  );
}

export function patchHwItem(hwId: Id, itemId: Id, patch: Partial<HwItem>) {
  const hw = getStudy().homework[hwId];
  if (!hw) return;
  put('homework', { ...hw, items: hw.items.map((i) => (i.id === itemId ? { ...i, ...patch, at: Date.now() } : i)) });
}

/** 숙제 페이지 체크: 내 문제집이면 그 진도에, 아니면 숙제에 */
export function markHwPages(hw: Homework, item: HwItem, pages: number[], on: boolean) {
  if (item.bookId && getStudy().books[item.bookId] && !getStudy().books[item.bookId].deleted) return markBook(item.bookId, pages, on);
  const cur = new Set(expand(item.doneRanges ?? []));
  for (const p of pages) on ? cur.add(p) : cur.delete(p);
  patchHwItem(hw.id, item.id, { doneRanges: compress(cur) as Range[] });
}

export function addSession(s: Omit<StudySession, 'id' | 'updatedAt'>) {
  if (s.minutes <= 0) return;
  put('sessions', { ...s, id: newId() });
}

/** 단어 첫 답 저장 (상자) */
export function answerWord(w: Word, correct: boolean, via: Via, mode: Mode, today: DateStr) {
  putWords([firstAnswer(w, correct, via, mode, today, getStudy().settings)]);
}

/** 새 단어 넣기 (순서는 그 목록의 끝에 이어서) */
export function addWords(listId: Id, rows: { term: string; meaning: string; day?: number }[], existing: Word[], today: DateStr) {
  let order = existing.reduce((m, w) => Math.max(m, w.order), 0);
  putWords(rows.map((r) => ({ id: newId(), updatedAt: 0, listId, term: r.term.trim(), meaning: r.meaning.trim(), day: r.day, order: ++order, box: 0, due: today, wrong: 0 })));
}

/** 모르는 단어 모음에 한 단어 넣기 (모음이 없으면 만든다) */
export function addToInbox(term: string, meaning: string, words: WordsData, today: DateStr) {
  const d = getStudy();
  let inbox = alive(d.wordLists).find((l) => l.kind === 'inbox');
  if (!inbox) {
    inbox = { id: newId(), updatedAt: 0, name: '모르는 단어 모음', kind: 'inbox', subjectId: alive(d.subjects).find((s) => /영어/.test(s.name))?.id ?? '', done: [], undone: [] };
    put('wordLists', inbox);
  }
  addWords(inbox.id, [{ term, meaning }], listWords(words, inbox.id), today);
}

/** 오답 빨리 넣기: 「틀린 번호: 3, 7, 12」 · 「p.37 5번 p.38 2번」 (한 번에 저장) */
export function quickWrongNotes(subjectId: Id, bookId: Id | undefined, items: { page?: number; number: string }[], today: DateStr) {
  const now = Date.now();
  putMany(
    items.map(({ page, number }, i) => ({
      c: 'notes' as const,
      item: {
      id: newId(),
      subjectId,
      bookId,
      page,
      number,
      question: '',
      photos: [],
      myAnswer: '',
      answer: '',
      reason: null,
      memo: '',
      created: now + i,
      box: 1,
      due: addDays(today, 1),
      wrong: 1,
      } as never,
    })),
  );
}

/**
 * 「3, 7, 12」 「3 7 12」 「p.37 5번 6번 p.38 2」 → 쪽·번호들.
 * 쪽은 「p.37」「p37」「37쪽」으로 쓰면 그 뒤 번호들에 붙는다. 쪽을 쓰지 않으면 쪽 없이 (짐작해서 틀린 쪽을 넣지 않는다).
 */
export function parseWrong(s: string): { page?: number; number: string }[] {
  const out: { page?: number; number: string }[] = [];
  let page: number | undefined;
  let pageNext = false;
  for (const tok of s.split(/[,\s/]+/).filter(Boolean)) {
    if (/^p\.?$/i.test(tok)) {
      pageNext = true;
      continue;
    }
    const pm = tok.match(/^p\.?(\d{1,4})$/i) ?? tok.match(/^(\d{1,4})쪽$/) ?? (pageNext ? tok.match(/^(\d{1,4})$/) : null);
    pageNext = false;
    if (pm) {
      page = Number(pm[1]);
      continue;
    }
    const n = tok.replace(/번$/, '').trim();
    if (n) out.push({ page, number: n.slice(0, 20) });
  }
  return out;
}

/**
 * 시험 지우기. 그 시험에 맞춘 계획은 시험 날짜를 마감으로 옮겨 둔다
 * (안 그러면 마감이 사라져 남은 분량이 매일 한꺼번에 나온다).
 */
export function removeExam(examId: Id) {
  const d = getStudy();
  const plans = Object.values(d.plans).filter((p) => !p.deleted && p.examId === examId && !p.due);
  if (plans.length)
    putMany(
      plans.map((p) => {
        const owner = p.target === 'book' ? d.books[p.targetId] : d.wordLists[p.targetId];
        return { c: 'plans' as const, item: { ...p, due: planDue(p, d.exams, owner?.subjectId) ?? undefined } as never };
      }),
    );
  remove('exams', examId);
}

/** 계획 끝내기 (시험이 끝났거나 더 하지 않을 때). 진도는 그대로 남는다 */
export function finishPlan(planId: Id) {
  const p = getStudy().plans[planId];
  if (p) put('plans', { ...p, finished: true });
}
