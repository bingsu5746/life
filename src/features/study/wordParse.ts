// 영단어 붙여넣기 읽기 (설계 §9.5 ①). PDF·사진에서 읽은 글도 이 규칙으로 표를 만든다.

export interface ParsedWord {
  term: string;
  meaning: string;
  day?: number;
  line: string;
  problem?: string;
}

/** Day 3 · DAY 03 · 3일차 · Unit 3 · Lesson 3 */
export function dayHeader(line: string): number | null {
  const s = line.trim();
  const m = s.match(/^(?:day|unit|lesson|week|chapter)\s*0*(\d{1,3})\b\s*[.:)\-]?\s*(.*)$/i) ?? s.match(/^0*(\d{1,3})\s*(?:일차|일째|강|과)\s*(.*)$/);
  if (!m) return null;
  // 「Day 3 apple 사과」처럼 뒤에 단어가 붙어 있으면 머리줄이 아니다
  if (/[a-z]{2,}.*[가-힣]/i.test(m[2])) return null;
  return Number(m[1]);
}

const TERM_OK = /^[A-Za-z][A-Za-z '’\-./()]*$/;

/** 한 줄 → 단어 / 뜻 */
export function splitWordLine(raw: string): { term: string; meaning: string } | null {
  let s = raw.replace(/ /g, ' ').trim();
  if (!s) return null;
  // 앞 번호 (1. / 001 / ① / 1) / □ / ☐)
  s = s.replace(/^(?:[□☐■○●◯▢\-*•]\s*)+/, '').replace(/^(?:\d{1,4}\s*[.)\]:]?|[①-⑳])\s+/, '').trim();
  let term = '';
  let meaning = '';
  const tab = s.split(/\t+/).map((x) => x.trim()).filter(Boolean);
  if (tab.length >= 2) {
    // 엑셀·시트에서 복사: 앞 번호 칸이 따로 있으면 건너뛴다
    const cells = /^\d+$/.test(tab[0]) ? tab.slice(1) : tab;
    term = cells[0];
    meaning = cells.slice(1).join(' ');
  } else {
    const sep = s.match(/^(.+?)\s*(?:\s[-–—]\s|:|\|)\s*(.+)$/);
    if (sep && /^[A-Za-z]/.test(sep[1]) && !/[가-힣]/.test(sep[1])) {
      term = sep[1];
      meaning = sep[2];
    } else {
      // 처음 나오는 한글, 또는 품사 표시·괄호 앞에서 나눈다
      const m = s.match(/^([A-Za-z][A-Za-z '’\-./]*?)\s*((?:\(|\[|〔|<|\b(?:n|v|adj|adv|prep|conj|pron|int|a|ad|vt|vi)\.\s|[가-힣①-⑳]).*)$/);
      if (m) {
        term = m[1];
        meaning = m[2];
      } else {
        term = s;
      }
    }
  }
  // 단어 쪽에 붙은 발음기호 [ǽpl] / /ǽpl/ 은 지운다
  term = term
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .replace(/\s*\/[^/]*\/\s*$/, '')
    .replace(/[\s,;]+$/, '')
    .trim();
  meaning = meaning
    .replace(/^[\s:|\-–—]+/, '')
    // 뜻 앞의 발음기호 [ǽpl] · /ǽpl/ (한글이 없는 괄호) 는 지운다
    .replace(/^(?:\[[^\]가-힣]*\]|\/[^/가-힣]*\/)\s*/, '')
    .trim();
  if (!term) return null;
  return { term, meaning };
}

/** 여러 줄 → 단어 표. 이미 있는 단어(소문자 비교)는 「중복」 표시 */
export function parseWords(text: string, existing: Iterable<string> = []): ParsedWord[] {
  const seen = new Set([...existing].map((t) => t.toLowerCase()));
  const out: ParsedWord[] = [];
  let day: number | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const d = dayHeader(line);
    if (d !== null) {
      day = d;
      continue;
    }
    const w = splitWordLine(line);
    if (!w) continue;
    let problem: string | undefined;
    if (!TERM_OK.test(w.term)) problem = '영어 단어가 아닌 것 같아요';
    else if (w.term.length > 40) problem = '너무 길어요';
    else if (!w.meaning) problem = '뜻이 비어 있어요';
    const key = w.term.toLowerCase();
    if (!problem && seen.has(key)) problem = '중복';
    seen.add(key);
    out.push({ ...w, day, line, problem });
  }
  return out;
}

/** 단어 목록을 다시 붙여 넣을 수 있는 글로 (Day 머리줄 + 단어<탭>뜻) */
export function wordsText(words: { term: string; meaning: string; day?: number }[]): string {
  const lines: string[] = [];
  let day: number | undefined;
  for (const w of words) {
    if (w.day !== undefined && w.day !== day) {
      day = w.day;
      lines.push(`Day ${day}`);
    }
    lines.push(`${w.term}\t${w.meaning}`);
  }
  return lines.join('\n');
}
