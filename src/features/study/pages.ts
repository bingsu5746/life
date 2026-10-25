// 페이지(또는 Day) 범위 다루기: 범위 ↔ 번호 목록, 체크 기록(Mark) → 푼 페이지
import type { Mark, Range } from './model';

/** 쪽(또는 Day) 번호로 쓸 수 있는 가장 큰 수. 잘못 넣은 큰 수(예: 1-30000000) 때문에 화면이 멈추지 않게 이 안에서만 다룬다 */
export const MAX_PAGE = 9999;
/** 단어장 Day 수의 최대 */
export const MAX_DAYS = 500;

/** 범위 하나를 0~MAX_PAGE 안으로 (숫자가 아니거나 완전히 밖이면 null) */
export function clampRange(a: number, b: number): Range | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = Math.round(Math.min(a, b));
  const hi = Math.round(Math.max(a, b));
  if (hi < 0 || lo > MAX_PAGE) return null;
  return [Math.max(0, lo), Math.min(MAX_PAGE, hi)];
}

/** 「12-30, 45」 「12~30 45」 → 범위 (쓸 수 없는 조각은 뺀다) */
export function parseRanges(s: string): Range[] {
  const out: Range[] = [];
  for (const part of s.split(/[,\s]+/)) {
    const m = part.match(/^(\d{1,12})(?:[-~](\d{1,12}))?$/);
    const r = m && clampRange(Number(m[1]), Number(m[2] ?? m[1]));
    if (r) out.push(r);
  }
  return out;
}

/** 범위들 → 번호 목록 (정렬, 겹침 없음) */
export function expand(ranges: Range[]): number[] {
  const set = new Set<number>();
  for (const [a, b] of ranges) {
    const r = clampRange(a, b);
    if (r) for (let p = r[0]; p <= r[1]; p++) set.add(p);
  }
  return [...set].sort((x, y) => x - y);
}

/** 번호 목록 → 이어진 범위 */
export function compress(nums: Iterable<number>): Range[] {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const out: Range[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

/** 34~41, 44 */
export function rangeText(ranges: Range[] | number[], unit = ''): string {
  const rs = typeof ranges[0] === 'number' ? compress(ranges as number[]) : (ranges as Range[]);
  return rs.map(([a, b]) => (a === b ? `${a}${unit}` : `${a}~${b}${unit}`)).join(', ');
}

export const countRanges = (ranges: Range[]) => expand(ranges).length;

/** 체크 기록으로 지금 「한」 번호들: 번호마다 가장 늦은 기록이 체크면 한 것 */
export function doneSet(done: Mark[], undone: Mark[]): Set<number> {
  const last = new Map<number, [number, boolean]>();
  const apply = (marks: Mark[], on: boolean) => {
    for (const [a, b, at] of marks) {
      const r = clampRange(a, b);
      if (!r) continue;
      for (let p = r[0]; p <= r[1]; p++) {
        const cur = last.get(p);
        // 같은 시각이면 해제가 이긴다
        if (!cur || at > cur[0] || (at === cur[0] && !on)) last.set(p, [at, on]);
      }
    }
  };
  apply(done, true);
  apply(undone, false);
  return new Set([...last].filter(([, [, on]]) => on).map(([p]) => p));
}

/** 체크 기록이 너무 길어지면 지금 상태 하나로 줄인다 (기기 사이 합치기에 쓸 시각은 가장 늦은 기록) */
export function compactMarks(done: Mark[], undone: Mark[], limit = 120): { done: Mark[]; undone: Mark[] } {
  if (done.length + undone.length <= limit) return { done, undone };
  const at = Math.max(0, ...done.map((m) => m[2]), ...undone.map((m) => m[2]));
  return { done: compress(doneSet(done, undone)).map(([a, b]) => [a, b, at] as Mark), undone: [] };
}
