// 다시 보기 상자 (설계 §9.1, §9.7). 오답·암기 카드·영단어가 함께 쓴다.
import { addDays, diffDays } from './dates';
import type { DateStr, Review } from './model';

export type Via = 'card' | 'quiz' | 'redo';

/**
 * 맞혔는지에 따라 다음 상자와 날짜.
 * - 맞히면 다음 상자, 5번 상자에서 맞히면 익힘.
 * - 객관식(quiz)으로는 quizMaxBox 까지만 오른다 (보기에서 고르기는 떠올리기보다 쉬움).
 * - 틀리면 1번 상자, 내일.
 */
export function answer<T extends Review>(item: T, correct: boolean, via: Via, today: DateStr, intervals: number[], quizMaxBox = 3): T {
  if (!correct) return { ...item, box: 1, due: addDays(today, intervals[0] ?? 1), wrong: item.wrong + 1, learned: false };
  let box = item.box + 1;
  if (via === 'quiz') box = Math.min(box, Math.max(item.box, quizMaxBox));
  if (box > intervals.length) return { ...item, box: intervals.length, due: addDays(today, intervals[intervals.length - 1]), learned: true };
  return { ...item, box, due: addDays(today, intervals[box - 1]), learned: false };
}

/** 오늘 다시 볼 것인지 */
export const isDue = (r: Review, today: DateStr) => r.box > 0 && !r.learned && r.due <= today;

/**
 * 오늘 복습 목록: 오래 밀린 것부터, 하루 50개까지 (나머지는 내일).
 * (예전에는 100개까지는 다 보여 주고 101개부터 50개로 줄여서, 하나 늘면 오히려 줄어드는 일이 있었다)
 */
export function dueToday<T extends Review>(items: T[], today: DateStr, cap = 50): T[] {
  const due = items.filter((r) => isDue(r, today)).sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box);
  return due.slice(0, cap);
}

/** 암기 카드: 하루에 새로 볼 카드 수 */
export const NEW_CARDS_PER_DAY = 20;

/** 오늘 처음 볼 새 카드 (아직 안 본 카드를 넣은 순서대로, 오늘 이미 처음 본 만큼 빼고) */
export function newToday<T extends Review & { firstSeen?: DateStr; created?: number; updatedAt: number }>(items: T[], today: DateStr, perDay = NEW_CARDS_PER_DAY): T[] {
  const seenToday = items.filter((x) => x.firstSeen === today).length;
  return items
    .filter((x) => x.box === 0 && !x.learned)
    .sort((a, b) => (a.created ?? a.updatedAt) - (b.created ?? b.updatedAt))
    .slice(0, Math.max(0, perDay - seenToday));
}

/** 상자 이름: 0 → 새 단어, 그 밖엔 「2번 상자 · 3일」 (간격은 설정에서 바꿀 수 있다) */
export const boxLabel = (box: number, intervals: number[]) => (box === 0 ? '새 단어' : `${box}단계 · ${intervals[box - 1] ?? '?'}일 간격`);

/** 3일 뒤 · 내일 · 오늘 */
export function dueText(r: Review, today: DateStr): string {
  if (r.learned) return '외움';
  if (r.box === 0) return '새 단어';
  const n = diffDays(today, r.due);
  return n <= 0 ? '오늘' : n === 1 ? '내일' : `${n}일 뒤`;
}
