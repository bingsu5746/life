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
  const parsed = lines.map((l) => parseLine(l)).filter((x): x is NonNullable<typeof x> => !!x);
  const paged = parsed.length;
  // 「실전 모의고사 01 · 02 · 03 …」처럼 끝 숫자가 1씩 늘어나는 번호면 쪽이 아니라 회 번호 → 줄마다 한 칸
  const numbering = paged >= 3 && parsed.every((x, i) => x.to === null && (i === 0 ? x.from <= 1 : x.from === parsed[i - 1].from + 1));
  if (numbering) return unitRows(lines);
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
  // 쪽이 붙은 대단원(「Ⅰ. 수와 식 8」 다음 줄 「01 유리수 8」): 작은 단원과 쪽이 겹치면 대단원은 한 칸으로 세지 않는다
  const paged0 = rows.filter((r) => !r.problem);
  paged0.forEach((r, i) => {
    const next = paged0[i + 1];
    if (next && BIG.test(r.name) && !BIG.test(next.name) && next.from >= r.from && next.from <= (r.open ? r.from : r.to) + 1) Object.assign(r, { header: true, problem: HEADER_NOTE });
  });
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
  // 대단원 이름(「Ⅰ. 문학」 「[현대시]」 「1부」 「PART 2」 「제1장」)은 아래에 작은 단원이 있으면 한 칸으로 세지 않는다
  const head = lines.map((l) => BIG.test(l.trim()));
  let n = 0;
  return lines.map((l, i) => {
    const name = l.trim().replace(/^[·•\-\s]+/, '');
    if (head[i] && i + 1 < lines.length && !head[i + 1]) return { name, from: 0, to: 0, line: l, unitOnly: true, header: true, problem: HEADER_NOTE };
    n++;
    return { name, from: n, to: n, line: l, unitOnly: true };
  });
}
/** 대단원처럼 보이는 줄 */
const BIG = /^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.)]?|[IVX]{1,4}\s*[.)]|\[[^\]]+\]$|【[^】]+】$|〔[^〕]+〕$|<[^>]+>$|《[^》]+》$|제?\s*\d+\s*(?:부|편|장|단원|파트)(?:\s|[.:]|$)|part\s*\d+|chapter\s*\d+|대단원)/i;
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

/**
 * 이미 넣은 문제집에서 대단원 이름 같은 단원 (예전에 대단원도 한 칸으로 들어간 것): 몇 번째인지.
 * 쪽 없는 문제집은 대단원 모양이고 다음 단원이 대단원이 아닌 것, 쪽 있는 문제집은 거기에 더해 다음 단원과 쪽이 겹치는 것
 */
export function headerUnits(units: Unit[], unitOnly = false): number[] {
  const out: number[] = [];
  units.forEach((u, i) => {
    const next = units[i + 1];
    if (u.skip || !next || !BIG.test(u.name.trim()) || BIG.test(next.name.trim())) return;
    if (unitOnly || (next.from >= u.from && next.from <= u.to + 1)) out.push(i);
  });
  return out;
}

/** 쪽 없는 문제집을 세는 말: 단원 이름 반이 넘게 「n회」면 회 (모의고사 문제집), 아니면 단원 */
export const unitWord = (units: { name: string }[]) => (units.length && units.filter((u) => /\d+\s*회|회\s*\d+/.test(u.name)).length * 2 > units.length ? '회' : '단원');
