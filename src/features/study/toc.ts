// 목차 글자 → 단원 표 (설계 §4.2). 붙여 넣은 글이든, 사진에서 읽은 글이든 같은 규칙으로 읽는다.
import type { Unit } from './model';

export interface TocRow extends Unit {
  /** 원래 줄 */
  line: string;
  /** 끝 페이지를 다음 줄에서 짐작했는지 */
  guessedEnd?: boolean;
  /** 쪽 없는 목차의 단원 (순번이 쪽 자리에) */
  unitOnly?: boolean;
  problem?: string;
  /** 쪽이 붙은 목차 속 쪽 없는 큰 제목 (「Ⅰ. 다항식」): 단원으로 넣지 않는다 */
  header?: boolean;
}

/** 쪽 없는 큰 제목에 붙는 표시 */
export const HEADER_NOTE = '쪽 없는 큰 제목 (빼요)';

/** 쪽 번호 앞뒤에 붙는 말 · 괄호 (「p.12」 「12쪽」 「(12)」 「[12]」) */
const PRE = String.raw`(?:p\.?|pp\.?|page)?\s*[(\[〈<]?\s*`;
const POST = String.raw`\s*[)\]〉>]?\s*(?:쪽|p\.?|페이지)?`;

const DASH = /\s*[-~–—―〜～‐]\s*/;

/** 한 줄 → 이름 + 페이지 (못 읽으면 null) */
function parseLine(raw: string): { name: string; from: number; to: number | null } | null {
  const line = raw
    .replace(/[.·•…‥・_─━-]{2,}/g, ' ') // 점선
    .replace(/(?:[.·•…‥・]\s+){2,}/g, ' ') // 띄어 쓴 점선 (「. . . .」)
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return null;
  // 끝에 「a-b」 범위
  const range = line.match(new RegExp(`^(.*?)\\s*${PRE}(\\d{1,4})${DASH.source}(\\d{1,4})${POST}$`, 'i'));
  // 「현대시 01~11」 같은 번호 매기기는 쪽이 아니다 (0 으로 시작하는 두 자리 범위)
  if (range && /^0\d$/.test(range[2]) && /^\d{2}$/.test(range[3])) return null;
  if (range) {
    const name = range[1].replace(/[\s:|,.·•…]+$/, '').trim();
    return { name, from: Number(range[2]), to: Number(range[3]) };
  }
  // 끝에 숫자 하나 (시작 페이지). 이름에 붙은 단원 번호(「1. 집합」)와 헷갈리지 않게 앞에 띄어쓰기나 점선이 있어야 한다
  const single = line.match(new RegExp(`^(.*\\S)\\s+${PRE}(\\d{1,4})${POST}$`, 'i'));
  if (single) return { name: single[1].replace(/[\s:|,.·•…]+$/, '').trim(), from: Number(single[2]), to: null };
  return null;
}

/**
 * 여러 줄 → 단원 표.
 * - 숫자가 하나뿐인 줄은 시작 페이지로 보고, 끝은 다음 줄 시작 - 1 (마지막 줄은 lastPage).
 * - 이름 없이 「1-240」만 있으면 단원 없이 전체 범위 하나.
 */
export function parseToc(text: string, lastPage?: number): TocRow[] {
  // 쪽 번호만 다음 줄로 떨어진 목차(「01 유리수」 다음 줄 「6」)는 앞 줄에 붙인다
  const lines: string[] = [];
  for (const l of text.split(/\r?\n/)) {
    if (!l.trim()) continue;
    if (new RegExp(`^\\s*${PRE}\\d{1,4}(?:\\s*[-~–]\\s*\\d{1,4})?${POST}\\s*$`, 'i').test(l) && lines.length && !parseLine(lines[lines.length - 1])) lines[lines.length - 1] += ` ${l.trim()}`;
    else lines.push(l);
  }
  text = lines.join('\n');
  // 쪽이 거의 없는 목차(국어 작품별 · 강별 목차 등): 단원(줄)마다 한 칸으로 (쪽 대신 단원 수로 계획).
  // 쪽 붙은 줄이 조금이라도 모여 있으면(두 줄 넘게 · 네 줄에 한 줄 넘게) 쪽으로 읽고, 쪽 없는 줄은 큰 제목으로 뺀다
  const paged = lines.filter((l) => parseLine(l)).length;
  if (lines.length && (paged === 0 || (paged < 2 && lines.length > 2) || paged < lines.length * 0.25)) return unitRows(lines);
  const rows: (TocRow & { open: boolean })[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const p = parseLine(raw);
    if (!p) {
      if (raw.trim()) rows.push({ name: raw.trim(), from: 0, to: 0, line: raw, open: false, problem: HEADER_NOTE, header: true });
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

/** 쪽 없는 목차: 줄마다 단원 하나 (from = to = 순번). unitOnly 로 표시 */
export function unitRows(lines: string[]): TocRow[] {
  return lines.map((l, i) => ({ name: l.trim().replace(/^[·•\-\s]+/, ''), from: i + 1, to: i + 1, line: l, unitOnly: true }));
}
/** 쪽 없는 문제집인지 (단원 수로 계획) */
export const isUnitOnly = (rows: { unitOnly?: boolean }[]) => rows.length > 0 && rows.every((r) => r.unitOnly);

/** 단원 표 → 다시 고칠 수 있는 글 */
export function tocText(units: Unit[], unitOnly = false): string {
  return units.map((u) => (unitOnly ? u.name : `${u.name} ${u.from}-${u.to}`)).join('\n');
}

/** 그 페이지가 속한 단원 */
export function unitOf(units: Unit[], page: number): Unit | undefined {
  return units.find((u) => page >= u.from && page <= u.to);
}
