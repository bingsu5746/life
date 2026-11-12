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

// ===== 일기 속 사람 =====

/** 그 사람이 나온 일기 (이름이나 다르게 부르는 말 중 하나라도) */
export function personEntries(entries: DiaryEntry[], names: string[]): DiaryEntry[] {
  const ns = names.map(norm).filter((x) => x.length >= 1);
  if (!ns.length) return [];
  return entries.filter((e) => {
    const t = norm(entryText(e));
    return ns.some((n) => t.includes(n));
  });
}

/** 사람 이름일 것 같은 말: 「민수랑」 「지민이한테」처럼 랑 · 한테 · 에게 · 하고 · 이랑 앞에 두 번 이상 나온 2~4글자 */
export function nameCandidates(entries: DiaryEntry[], known: string[] = []): { name: string; n: number }[] {
  const m = new Map<string, number>();
  const skip = new Set(['친구', '엄마', '아빠', '동생', '언니', '오빠', '누나', '형', '선생님', '쌤', '가족', '사람', '애들', '우리', '다같이', '혼자', '같이', ...known.map(norm)]);
  for (const e of entries) {
    const seen = new Set<string>();
    for (const r of entryText(e).matchAll(/([가-힣]{2,4}?)(?:이)?(?:랑|한테|에게|하고|이하고|와 같이|과 같이)(?=[\s,.!?])/g)) {
      const w = r[1];
      if (skip.has(w) || seen.has(w)) continue;
      seen.add(w);
      m.set(w, (m.get(w) ?? 0) + 1);
    }
  }
  return [...m]
    .filter(([, n]) => n >= 2)
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
}

// ===== 기분별 자주 쓴 말 =====

const PARTICLES = ['했는데', '했었다', '했다', '했고', '해서', '하기', '하는', '했어', '한다', '하다', '에서는', '에게서', '한테서', '으로는', '이랑은', '에서', '에게', '한테', '으로', '이랑', '까지', '부터', '보다', '처럼', '이나', '하고', '은', '는', '이', '가', '을', '를', '에', '도', '랑', '와', '과', '로', '의', '만'];
const WORD_STOP = new Set(['오늘', '그냥', '진짜', '너무', '근데', '그래서', '그리고', '하지만', '그런데', '정말', '많이', '조금', '좀', '내가', '나는', '나도', '했다', '했는데', '있었다', '없었다', '같다', '같은', '것', '거', '것도', '거의', '그거', '이거', '저거', '하루', '오늘은', '내일', '어제', '다시', '계속', '아주', '완전', '되게', '약간', '이제', '아직', '한번', '생각', '때문에', '그때', '했고', '하고', '해서', '해야', '하는', '하기', '있는', '없는', '있다', '없다', '됐다', '된다', '한다', '이다', '였다', '이었다', '것이다', '거다']);

/** 일기 글 → 낱말들 (조사 떼고, 2글자 이상, 흔한 말 빼고, 한 편에 한 번씩) */
export function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (let w of norm(text).split(/[^0-9a-z가-힣]+/)) {
    if (w.length < 2 || /^\d+$/.test(w)) continue;
    for (const p of PARTICLES)
      if (w.length - p.length >= 2 && w.endsWith(p)) {
        w = w.slice(0, -p.length);
        break;
      }
    if (w.length >= 2 && !WORD_STOP.has(w)) out.add(w);
  }
  return out;
}

/**
 * 기분이 좋은 날(좋음 · 최고)과 나쁜 날(나쁨 · 별로)에 자주 쓴 말.
 * 두 쪽 모두에 고르게 나온 말은 빼고, 한쪽에 치우친 말이 위 (각 쪽 2편 이상 나온 말만)
 */
export function moodWords(entries: DiaryEntry[], n = 15): { good: { w: string; g: number; b: number }[]; bad: { w: string; g: number; b: number }[]; goodDays: number; badDays: number } {
  const good = entries.filter((e) => (e.mood ?? 0) >= 4);
  const bad = entries.filter((e) => e.mood && e.mood <= 2);
  const count = (es: DiaryEntry[]) => {
    const m = new Map<string, number>();
    for (const e of es) for (const w of wordsOf(entryText(e))) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const G = count(good);
  const B = count(bad);
  const side = (mine: Map<string, number>, other: Map<string, number>, a: number, b: number) =>
    [...mine]
      .filter(([, c]) => c >= 2)
      .map(([w, c]) => {
        const o = other.get(w) ?? 0;
        // 그 쪽 일기 중 나온 비율 ÷ 다른 쪽 비율 (0 으로 나누지 않게 1을 더함)
        const lift = (c / Math.max(1, a)) / ((o + 1) / Math.max(1, b + 1));
        return { w, c, o, lift };
      })
      .filter((x) => x.lift > 1.2)
      .sort((x, y) => y.lift * Math.log(1 + y.c) - x.lift * Math.log(1 + x.c))
      .slice(0, n);
  return {
    good: side(G, B, good.length, bad.length).map((x) => ({ w: x.w, g: x.c, b: x.o })),
    bad: side(B, G, bad.length, good.length).map((x) => ({ w: x.w, g: x.o, b: x.c })),
    goodDays: good.length,
    badDays: bad.length,
  };
}

// ===== 미래의 나에게 편지 =====

/** 편지 상태: 열 수 있는지 · 남은 날 */
export const letterState = (openOn: DateStr, today: DateStr) => (openOn <= today ? 'open' : 'locked');
