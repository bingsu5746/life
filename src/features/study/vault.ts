// 저장소 칸들: 공부 메뉴(가볍게 먼저 받는 코드)와 저장소 화면이 같이 쓴다
import { alive } from './model';
import { dueToday } from './review';
import { blanksToday, cardsToday } from './select';
import { useStudy } from './store';
import { dueAgain } from './passages';
import { useToday } from './ui';

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
