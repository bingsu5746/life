// 저장소 칸들: 공부 메뉴(가볍게 먼저 받는 코드)와 저장소 화면이 같이 쓴다
import { alive, type StudyData } from './model';
import { dueToday } from './review';
import { blanksToday, cardsToday } from './select';
import { useStudy } from './store';
import { dueAgain } from './passages';
import { subjectsOf, useToday } from './ui';

/** 저장소 칸들 (옆 메뉴) */
export const VAULT_ITEMS = [
  { key: 'notes', label: '오답 노트', short: '오답', to: '/review', icon: 'review' },
  { key: 'cards', label: '암기 카드', short: '카드', to: '/review/cards', icon: 'words' },
  { key: 'blank', label: '백지 복습', short: '백지', to: '/review/blank', icon: 'books' },
  { key: 'passages', label: '지문', short: '지문', to: '/review/passages', icon: 'translate' },
  { key: 'ai', label: 'AI 풀이', short: 'AI', to: '/review/ai', icon: 'area-ai' },
] as const;
export type VaultKey = (typeof VAULT_ITEMS)[number]['key'];

/** 주소 → 켜진 저장소 칸 */
export const vaultItem = (sub?: string): VaultKey =>
  sub === 'ai' ? 'ai' : sub === 'cards' || sub === 'new-deck' || sub?.startsWith('deck-') ? 'cards' : sub === 'blank' || sub === 'new-blank' ? 'blank' : sub === 'passages' || sub === 'new-passage' || sub?.startsWith('passage-') ? 'passages' : 'notes';

/** 칸마다 오늘 다시 볼 수 */
export function useVaultCounts(): Record<VaultKey, number> {
  const d = useStudy();
  const today = useToday();
  return { notes: dueToday(alive(d.notes), today).length, cards: cardsToday(d, today).length, blank: blanksToday(d, today).length, passages: alive(d.passages).filter((x) => dueAgain(x, today)).length, ai: 0 };
}

// ===== AI 풀이 (AI 화면 옆 메뉴 · 저장소) =====
export const NO_SUBJECT = 'none';

/** 지우지 않은 AI 풀이, 최근 것부터 */
export const aliveProblems = (d: StudyData) =>
  Object.values(d.problems)
    .filter((p) => !p.deleted)
    .sort((a, b) => b.at - a.at);

/** 한 번이라도 물어본 과목 (과목 순서대로) + 과목 없는 것이 있으면 마지막에 「과목 없음」 */
export function askedSubjects(d: StudyData): { id: string; name: string; n: number }[] {
  const all = aliveProblems(d);
  const out = subjectsOf(d)
    .map((s) => ({ id: s.id, name: s.name, n: all.filter((p) => p.subjectId === s.id).length }))
    .filter((s) => s.n > 0);
  const none = all.filter((p) => !p.subjectId || !d.subjects[p.subjectId] || d.subjects[p.subjectId].deleted).length;
  if (none) out.push({ id: NO_SUBJECT, name: '과목 없음', n: none });
  return out;
}
