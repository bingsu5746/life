// 시험 직전 「내 약점 한 장」: 한 과목의 자주 틀린 이유 · 많이 틀린 곳 · 아직 못 푼 오답 · 빠뜨린 핵심 · 헷갈린 지문 · 자주 틀린 단어
import { mistakePatterns, type SubjectPattern } from './mistakes';
import { alive, type Id, type StudyData, type WordsData, type WrongNote } from './model';

export interface WeakSheet {
  pattern: SubjectPattern | null;
  notes: WrongNote[];
  /** 나에게 한마디 (최근 것부터) */
  comments: string[];
  /** 백지 복습에서 마지막에 빠뜨린 핵심 */
  missed: { title: string; points: string[] }[];
  passages: { id: Id; title: string; note?: string }[];
  words: { term: string; meaning: string; wrong: number }[];
}

export function weakSheet(d: StudyData, words: WordsData, subjectId: Id): WeakSheet {
  const name = d.subjects[subjectId]?.name ?? '';
  const open = alive(d.notes).filter((n) => n.subjectId === subjectId && !n.learned);
  const notes = [...open].sort((a, b) => b.wrong - a.wrong || b.created - a.created).slice(0, 12);
  const comments = alive(d.notes)
    .filter((n) => n.subjectId === subjectId)
    .flatMap((n) => n.comments ?? [])
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((c) => c.text)
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 6);
  const missed = alive(d.blanks)
    .filter((b) => b.subjectId === subjectId && b.tries.length)
    .map((b) => {
      const last = b.tries[b.tries.length - 1];
      return { title: b.title, points: b.points.filter((p) => last.missed.includes(p.id)).map((p) => p.text) };
    })
    .filter((x) => x.points.length);
  const lang = /국어|문학|독서|화법|언어/.test(name) ? 'ko' : /영어|english/i.test(name) ? 'en' : null;
  const passages = lang
    ? alive(d.passages)
        .filter((p) => p.lang === lang && p.confusing)
        .map((p) => ({ id: p.id, title: p.title, note: p.note }))
    : [];
  const listIds = new Set(alive(d.wordLists).filter((l) => l.subjectId === subjectId).map((l) => l.id));
  const ws =
    lang === 'en'
      ? alive(words)
          .filter((w) => w.wrong > 0 && !w.learned && (listIds.size === 0 || listIds.has(w.listId)))
          .sort((a, b) => b.wrong - a.wrong)
          .slice(0, 20)
          .map((w) => ({ term: w.term, meaning: w.meaning, wrong: w.wrong }))
      : [];
  return { pattern: mistakePatterns({ notes: d.notes, books: d.books }).find((p) => p.subjectId === subjectId) ?? null, notes, comments, missed, passages, words: ws };
}

export const isEmptySheet = (s: WeakSheet) => !s.notes.length && !s.comments.length && !s.missed.length && !s.passages.length && !s.words.length && !s.pattern;
