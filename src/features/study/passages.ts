// 지문: 다시 볼 때가 된 것 · 번역할 때 길이에 맞게 나누기
import { addDays } from './dates';
import type { DateStr, Passage } from './model';

/** 헷갈린 지문을 다시 볼 때: 한 번도 안 봤거나, 마지막으로 본 지 gap 일이 지났으면 */
export function dueAgain(p: Pick<Passage, 'confusing' | 'seen'>, today: DateStr, gap = 3): boolean {
  if (!p.confusing) return false;
  const last = p.seen?.length ? [...p.seen].sort().at(-1)! : null;
  return !last || last <= addDays(today, -gap);
}

/** 문단을 지키며 max 글자 아래로 나눈다 (한 문단이 너무 길면 문장 끝에서) */
export function chunkText(text: string, max = 1800): string[] {
  const out: string[] = [];
  let cur = '';
  const push = (s: string) => {
    if (cur && cur.length + s.length + 2 > max) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${s}` : s;
  };
  for (const para of text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    if (para.length <= max) push(para);
    else for (const s of para.match(new RegExp(`[^.!?]{1,${max - 1}}[.!?]*`, 'g')) ?? [para]) push(s.trim());
  }
  if (cur) out.push(cur);
  return out;
}
