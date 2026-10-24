// 화면에서 자주 하는 고치기 (체크·진도·숙제·기록)
import { addDays } from './dates';
import { newId, type DateStr, type Homework, type HwItem, type Id, type Mark, type Range, type StudySession, type Word } from './model';
import { compactMarks, compress, expand } from './pages';
import { firstAnswer, type Mode } from './wordSession';
import type { Via } from './review';
import { getStudy, put, putWords } from './store';

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
  put('homework', { ...hw, items: hw.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
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

/** 오답 빨리 넣기: 「틀린 번호: 3, 7, 12」 */
export function quickWrongNotes(subjectId: Id, bookId: Id | undefined, page: number | undefined, numbers: string[], today: DateStr) {
  for (const n of numbers)
    put('notes', {
      id: newId(),
      subjectId,
      bookId,
      page,
      number: n,
      question: '',
      photos: [],
      myAnswer: '',
      answer: '',
      reason: null,
      memo: '',
      created: Date.now(),
      box: 1,
      due: addDays(today, 1),
      wrong: 1,
    });
}

/** 「3, 7, 12」 「3 7 12」 「p.37 5번」 → 번호들 */
export const splitNumbers = (s: string) =>
  s
    .split(/[,\s/]+/)
    .map((x) => x.replace(/번$/, '').trim())
    .filter(Boolean);
