// 영단어 외우기 (설계 §9.6~9.7): 오늘 새 단어 · 세션 순서 · 객관식 보기 · 상자
import { apportion } from './allocate';
import { addDays, daysBetween, diffDays } from './dates';
import type { DateStr, Id, StudySettings, Word, WordList } from './model';
import { answer, isDue, type Via } from './review';

const byOrder = (a: Word, b: Word) => (a.day ?? 0) - (b.day ?? 0) || a.order - b.order;

/** 단어 시험: 새 단어는 시험 이틀 전까지 나눠 익히고, 전날은 전체 복습 */
export function testNewToday(list: WordList, words: Word[], today: DateStr): Word[] {
  if (!list.testDate) return [];
  const unseen = words.filter((w) => w.box === 0).sort(byOrder);
  const seenToday = words.filter((w) => w.firstSeen === today).length;
  const lastNew = addDays(list.testDate, -2);
  // 남은 날이 이틀이 안 되면 남은 것을 오늘 다
  if (today > lastNew) return unseen;
  const n = daysBetween(today, lastNew).length;
  const quota = apportion(unseen.length + seenToday, Array(n).fill(1))[0];
  return unseen.slice(0, Math.max(0, quota - seenToday));
}

/** 모르는 단어 모음: 하루 새 단어 수 안에서 들어온 순서대로 */
export function inboxNewToday(words: Word[], today: DateStr, perDay: number): Word[] {
  const seenToday = words.filter((w) => w.firstSeen === today).length;
  return words
    .filter((w) => w.box === 0)
    .sort(byOrder)
    .slice(0, Math.max(0, perDay - seenToday));
}

/** 단어장: 오늘 Day 들의 새 단어 */
export function bookNewToday(words: Word[], days: number[]): Word[] {
  const set = new Set(days);
  return words.filter((w) => w.box === 0 && w.day !== undefined && set.has(w.day)).sort(byOrder);
}

/** 오늘이 단어 시험 대비 날인지 (전날·당일) */
export function isTestPrepDay(list: WordList, today: DateStr): boolean {
  if (list.kind !== 'test' || !list.testDate) return false;
  const n = diffDays(today, list.testDate);
  return n === 0 || n === 1;
}

export const dueWords = (words: Word[], today: DateStr) => words.filter((w) => isDue(w, today));

// ===== 세션 =====

export type Mode = 'learn' | 'prep';

/**
 * 한 단어의 첫 답 (세션 안에서 두 번째부터는 상자를 바꾸지 않는다).
 * - learn: 상자 규칙(§9.7). 처음 익힌 단어는 맞히면 1번 상자.
 * - prep(시험 대비): 상자를 올리지 않고, 틀린 것만 1번 상자로.
 */
export function firstAnswer(w: Word, correct: boolean, via: Via, mode: Mode, today: DateStr, s: Pick<StudySettings, 'intervals' | 'quizMaxBox'>): Word {
  const firstSeen = w.firstSeen ?? today;
  if (mode === 'prep') return correct ? { ...w, firstSeen } : { ...answer(w, false, via, today, s.intervals, s.quizMaxBox), firstSeen };
  return { ...answer(w, correct, via, today, s.intervals, s.quizMaxBox), firstSeen };
}

/** 틀린 단어는 gap 장 뒤에 다시 (한 번 맞혀야 세션이 끝난다) */
export function requeue(queue: Id[], correct: boolean, gap = 3): Id[] {
  const [head, ...rest] = queue;
  if (correct || head === undefined) return rest;
  const at = Math.min(gap, rest.length);
  return [...rest.slice(0, at), head, ...rest.slice(at)];
}

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[.,;·]/g, '').toLowerCase();
const POS = /^(?:\(|\[)?\s*(n|v|vt|vi|adj|a|adv|ad|prep|conj|pron|명|동|형|부|전|접)\b/i;
const posOf = (m: string) => m.match(POS)?.[1].toLowerCase() ?? null;

/**
 * 객관식 보기 4개 (정답 포함, 섞음). 틀린 보기는 사용자가 넣은 다른 단어의 뜻에서만 고른다.
 * 같은 목록 → 다른 목록 순, 품사 표시가 같으면 먼저. 정답과 같은 뜻·같은 단어는 뺀다.
 * 후보가 모자라면 null (그 단어는 카드로만).
 */
export function choicesFor(w: Word, pool: Word[], rand: () => number = Math.random, field: 'meaning' | 'term' = 'meaning'): string[] | null {
  const right = w[field];
  if (!right) return null;
  const used = new Set([norm(right)]);
  const pos = posOf(w.meaning);
  const cands = pool.filter((x) => x.id !== w.id && x[field] && x.term.toLowerCase() !== w.term.toLowerCase());
  const score = (x: Word) => (x.listId === w.listId ? 0 : 2) + (pos && posOf(x.meaning) === pos ? 0 : 1) + rand();
  const sorted = cands.map((x) => [score(x), x] as const).sort((a, b) => a[0] - b[0]);
  const wrong: string[] = [];
  for (const [, x] of sorted) {
    const k = norm(x[field]);
    if (used.has(k)) continue;
    used.add(k);
    wrong.push(x[field]);
    if (wrong.length === 3) break;
  }
  if (wrong.length < 3) return null;
  const all = [right, ...wrong];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** 단어장의 Day 가 끝났는지 (그 Day 의 단어를 모두 한 번 이상 익힘) */
export function finishedDays(words: Word[]): number[] {
  const byDay = new Map<number, Word[]>();
  for (const w of words) if (w.day !== undefined) byDay.set(w.day, [...(byDay.get(w.day) ?? []), w]);
  return [...byDay].filter(([, ws]) => ws.every((w) => w.box > 0)).map(([d]) => d);
}
