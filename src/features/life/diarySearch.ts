// 일기 찾기 · N년 전 오늘 · 고민과 비슷한 지난 일기 (모두 이 기기에서 계산, 지어내는 것 없음)
import { addDays } from '../study/dates';
import type { DateStr, DiaryEntry } from '../study/model';

/** 일기 한 편의 글 전부 (제목 · 본문 · 양식 칸) */
export const entryText = (e: Pick<DiaryEntry, 'title' | 'text' | 'parts'>) => [e.title ?? '', e.text ?? '', ...Object.values(e.parts ?? {})].filter(Boolean).join('\n');

const norm = (s: string) => s.toLowerCase().normalize('NFC');

/** 찾는 말: 띄어 쓴 말은 모두 들어 있어야 하고, "따옴표"는 그대로 한 덩어리, -말 은 빼기 */
export function parseQuery(q: string): { must: string[]; not: string[] } {
  const must: string[] = [];
  const not: string[] = [];
  for (const m of norm(q).matchAll(/(-?)"([^"]+)"|(-?)(\S+)/g)) {
    const neg = m[1] || m[3];
    const w = (m[2] ?? m[4] ?? '').trim();
    if (!w || w === '-') continue;
    (neg ? not : must).push(w);
  }
  return { must, not };
}

export interface Hit {
  e: DiaryEntry;
  /** 찾은 말이 나온 횟수 (많을수록 위) */
  count: number;
  /** 찾은 말 둘레 글 (앞뒤 몇 글자) */
  snippet: string;
  inTitle: boolean;
}

/** 찾은 말 둘레를 잘라 보여 준다 */
export function snippetOf(text: string, word: string, around = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const i = norm(flat).indexOf(norm(word));
  if (i < 0) return flat.slice(0, around * 2);
  const from = Math.max(0, i - around);
  const to = Math.min(flat.length, i + word.length + around);
  return `${from > 0 ? '…' : ''}${flat.slice(from, to)}${to < flat.length ? '…' : ''}`;
}

export function searchDiary(entries: DiaryEntry[], q: string): Hit[] {
  const { must, not } = parseQuery(q);
  if (!must.length && !not.length) return [];
  const out: Hit[] = [];
  for (const e of entries) {
    const text = entryText(e);
    const t = norm(text);
    if (!must.every((w) => t.includes(w)) || not.some((w) => t.includes(w))) continue;
    const count = must.reduce((a, w) => a + t.split(w).length - 1, 0);
    // 둘레 글은 본문에서 (본문에 없으면 제목에서만 나온 것이라 본문 앞부분)
    const body = [e.text ?? '', ...Object.values(e.parts ?? {})].filter(Boolean).join('\n');
    const w = must.find((x) => norm(body).includes(x));
    out.push({ e, count, snippet: snippetOf(body, w ?? ''), inTitle: must.some((x) => norm(e.title ?? '').includes(x)) });
  }
  return out;
}

/** 일기에 쓴 #태그 (많이 쓴 순) */
export function diaryTags(entries: DiaryEntry[]): { tag: string; n: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) for (const t of new Set(entryText(e).match(/#[^\s#.,!?)\]]{1,20}/g) ?? [])) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}

/**
 * N년 전 오늘: 같은 날(월-일)의 지난해 일기. 그날이 없으면 앞뒤 3일 안의 가장 가까운 날.
 * 2월 29일은 평년엔 28일로 본다
 */
export function onThisDay(diary: Record<string, DiaryEntry>, today: DateStr, years = 10): { years: number; e: DiaryEntry; exact: boolean }[] {
  const out: { years: number; e: DiaryEntry; exact: boolean }[] = [];
  const live = (k: string) => (diary[k] && !diary[k].deleted && !diary[k].auto ? diary[k] : undefined);
  for (let y = 1; y <= years; y++) {
    const yy = Number(today.slice(0, 4)) - y;
    let md = today.slice(5);
    if (md === '02-29' && !(yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0))) md = '02-28';
    const day = `${yy}-${md}`;
    const e = live(day);
    if (e) {
      out.push({ years: y, e, exact: true });
      continue;
    }
    for (const k of [1, -1, 2, -2, 3, -3]) {
      const near = live(addDays(day, k));
      if (near) {
        out.push({ years: y, e: near, exact: false });
        break;
      }
    }
  }
  return out;
}

/** 글자 두 개씩 (띄어쓰기 · 문장부호 빼고): 한국어는 낱말 끝이 잘 바뀌어서 두 글자 묶음으로 비슷함을 본다 */
function grams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(s).split(/[^0-9a-z가-힣]+/)) {
    if (w.length === 1) continue;
    for (let i = 0; i + 1 < w.length; i++) out.add(w.slice(i, i + 2));
  }
  return out;
}

/** 흔해서 뜻이 없는 두 글자 묶음 */
const STOP = new Set(['오늘', '그냥', '진짜', '너무', '근데', '그래', '해서', '하고', '했다', '했는', '는데', '었다', '았다', '있었', '없었', '었는', '같다', '같은', '어서', '아서', '하는', '해야', '하기', '지만', '그리', '리고', '그런', '이런', '저런', '것같', '거같', '정말', '많이']);

/**
 * 고민과 비슷한 지난 일기: 고민 글의 두 글자 묶음이 일기에 얼마나 있는지(드문 묶음일수록 크게).
 * 점수가 0 인 것은 빼고, 많아야 n 편
 */
export function similarEntries(entries: DiaryEntry[], worry: string, n = 8): { e: DiaryEntry; score: number; words: string[] }[] {
  const q = [...grams(worry)].filter((g) => !STOP.has(g));
  if (!q.length) return [];
  const docs = entries.map((e) => ({ e, g: grams(entryText(e)) }));
  // 드문 묶음일수록 무게를 크게 (모든 일기에 있는 말은 거의 0)
  const df = new Map(q.map((g) => [g, docs.filter((x) => x.g.has(g)).length]));
  const N = Math.max(1, docs.length);
  return docs
    .map(({ e, g }) => {
      const hit = q.filter((x) => g.has(x));
      const score = hit.reduce((a, x) => a + Math.log(1 + N / (df.get(x) ?? 1)), 0) / Math.sqrt(q.length);
      return { e, score: Math.round(score * 100) / 100, words: hit };
    })
    .filter((x) => x.words.length >= Math.min(2, q.length))
    .sort((a, b) => b.score - a.score || b.e.id.localeCompare(a.e.id))
    .slice(0, n);
}
