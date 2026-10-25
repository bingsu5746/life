// 영단어 시험지 · 연습 문제 만들기 (뜻 쓰기 · 단어 쓰기 · 예문 빈칸)
import type { Word } from './model';
import { choicesFor } from './wordSession';

export type QKind = 'meaning' | 'term' | 'blank' | 'blankChoice';
export const QKIND_NAME: Record<QKind, string> = { meaning: '뜻 쓰기', term: '단어 쓰기', blank: '예문 빈칸 (쓰기)', blankChoice: '예문 빈칸 (고르기)' };

/** 예문 「They [abandoned] the car.」 → 앞 · 빈칸 답(활용형) · 뒤. 괄호가 없으면 단어를 찾아서 */
export function splitExample(s: string, term: string): { before: string; answer: string; after: string } | null {
  const m = s.match(/^(.*?)\[([^\]]+)\](.*)$/s);
  if (m) return { before: m[1], answer: m[2].trim(), after: m[3] };
  const i = s.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return null;
  return { before: s.slice(0, i), answer: s.slice(i, i + term.length), after: s.slice(i + term.length) };
}

/** 빈칸 문장 (괄호 없이 보여 줄 때) */
export const plainExample = (s: string) => s.replace(/\[([^\]]+)\]/g, '$1');

export interface Question {
  n: number;
  kind: QKind;
  word: Word;
  /** 문제 글 */
  ask: string;
  /** 예문 해석 (빈칸 문제) */
  hint?: string;
  /** 정답 */
  answer: string;
  choices?: string[];
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 시험 문제: 단어마다 고른 종류를 돌아가며. 예문이 없는 단어의 빈칸 문제는 뜻 쓰기로 바꾼다.
 * pool: 객관식 틀린 보기를 고를 단어들
 */
export function makeQuestions(words: Word[], kinds: QKind[], count: number, pool: Word[], rand: () => number = Math.random, mix = true): Question[] {
  const picked = (mix ? shuffle(words, rand) : words).slice(0, count);
  const ks = kinds.length ? kinds : (['meaning'] as QKind[]);
  return picked.map((w, i) => {
    let kind = ks[i % ks.length];
    const ex = w.example ? splitExample(w.example.s, w.term) : null;
    if ((kind === 'blank' || kind === 'blankChoice') && !ex) kind = w.meaning ? 'meaning' : 'term';
    if (kind === 'term' && !w.meaning) kind = 'meaning';
    const base = { n: i + 1, kind, word: w };
    if (kind === 'meaning') return { ...base, ask: w.term, answer: w.meaning };
    if (kind === 'term') return { ...base, ask: w.meaning, answer: w.term };
    const ask = `${ex!.before}______${ex!.after}`.trim();
    if (kind === 'blankChoice') {
      const choices = choicesFor(w, pool, rand, 'term');
      if (choices) return { ...base, ask, hint: w.example!.ko, answer: w.term, choices };
      return { ...base, kind: 'blank' as QKind, ask, hint: w.example!.ko, answer: ex!.answer };
    }
    return { ...base, ask, hint: w.example!.ko, answer: ex!.answer };
  });
}

/** 쓴 답이 맞는지 (영어: 대소문자·앞뒤 공백·끝 문장부호 무시) */
export function sameAnswer(given: string, answer: string): boolean {
  const n = (s: string) => s.trim().toLowerCase().replace(/[.!?,;]+$/, '').replace(/\s+/g, ' ');
  return !!n(given) && n(given) === n(answer);
}
