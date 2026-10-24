// 목차 글자 → 단원 표 (설계 §4.2). 붙여 넣은 글이든, 사진에서 읽은 글이든 같은 규칙으로 읽는다.
import type { Unit } from './model';

export interface TocRow extends Unit {
  /** 원래 줄 */
  line: string;
  /** 끝 페이지를 다음 줄에서 짐작했는지 */
  guessedEnd?: boolean;
  problem?: string;
}

const DASH = /\s*[-~–—―〜～‐]\s*/;

/** 한 줄 → 이름 + 페이지 (못 읽으면 null) */
function parseLine(raw: string): { name: string; from: number; to: number | null } | null {
  const line = raw
    .replace(/[.·•…‥・_]{2,}/g, ' ') // 점선
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return null;
  // 끝에 「a-b」 범위
  const range = line.match(new RegExp(`^(.*?)\\s*(?:p\\.?|쪽|페이지)?\\s*(\\d{1,4})${DASH.source}(\\d{1,4})\\s*(?:쪽|p)?$`, 'i'));
  if (range) {
    const name = range[1].replace(/[\s:|,]+$/, '').trim();
    return { name, from: Number(range[2]), to: Number(range[3]) };
  }
  // 끝에 숫자 하나 (시작 페이지). 이름에 붙은 단원 번호(「1. 집합」)와 헷갈리지 않게 앞에 띄어쓰기나 점선이 있어야 한다
  const single = line.match(/^(.*\S)\s+(?:p\.?\s*)?(\d{1,4})\s*(?:쪽|p)?$/i);
  if (single) return { name: single[1].replace(/[\s:|,]+$/, '').trim(), from: Number(single[2]), to: null };
  return null;
}

/**
 * 여러 줄 → 단원 표.
 * - 숫자가 하나뿐인 줄은 시작 페이지로 보고, 끝은 다음 줄 시작 - 1 (마지막 줄은 lastPage).
 * - 이름 없이 「1-240」만 있으면 단원 없이 전체 범위 하나.
 */
export function parseToc(text: string, lastPage?: number): TocRow[] {
  const rows: (TocRow & { open: boolean })[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const p = parseLine(raw);
    if (!p) {
      if (raw.trim()) rows.push({ name: raw.trim(), from: 0, to: 0, line: raw, open: false, problem: '페이지를 못 찾았어요' });
      continue;
    }
    rows.push({ name: p.name || '전체', from: p.from, to: p.to ?? 0, line: raw, open: p.to === null });
  }
  const ok = rows.filter((r) => !r.problem);
  ok.forEach((r, i) => {
    if (!r.open) return;
    const next = ok[i + 1];
    if (next) r.to = next.from - 1;
    else if (lastPage) r.to = lastPage;
    else r.to = r.from;
    r.guessedEnd = true;
    if (!next && !lastPage) r.problem = '끝 페이지를 알려 주세요';
  });
  let prevTo = 0;
  for (const r of ok) {
    if (r.to < r.from) r.problem ??= '끝이 시작보다 앞이에요';
    else if (r.from <= prevTo) r.problem ??= '앞 단원과 페이지가 겹쳐요';
    prevTo = Math.max(prevTo, r.to);
  }
  return rows.map(({ open: _open, ...r }) => r);
}

/** 단원 표 → 다시 고칠 수 있는 글 */
export function tocText(units: Unit[]): string {
  return units.map((u) => `${u.name} ${u.from}-${u.to}`).join('\n');
}

/** 그 페이지가 속한 단원 */
export function unitOf(units: Unit[], page: number): Unit | undefined {
  return units.find((u) => page >= u.from && page <= u.to);
}
