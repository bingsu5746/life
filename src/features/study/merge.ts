// 두 기기의 공부 자료 합치기 (설계 §8.2). 합치기는 기기에서, 서버는 저장만 한다.
import { COLLECTIONS, type Collection, type Assessment, type BlankSheet, type Exam, type ExamScope, type GradeRecord, type Habit, type Homework, type Id, type Mark, type Stamp, type StudyData, type Subject, type WordsData } from './model';
import { mergeHabitChecks } from './habits';
import { compactMarks } from './pages';

const DAY = 86_400_000;
// 오래 꺼 둔 기기가 있어도 지운 것이 되살아나지 않게 넉넉히 (반년)
export const TOMBSTONE_DAYS = 180;

/** 항목 하나: 늦게 고친 쪽, 같으면 지운 쪽, 그 밖엔 b(서버) */
export function pick<T extends Stamp>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (a.deleted && !b.deleted) return a;
  return b;
}

function unionMarks(a: Mark[] = [], b: Mark[] = []): Mark[] {
  const seen = new Set<string>();
  const out: Mark[] = [];
  for (const m of [...a, ...b]) {
    const k = m.join(',');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m);
    }
  }
  return out;
}

type WithMarks = Stamp & { done: Mark[]; undone: Mark[] };

/** 진도(체크 기록)가 있는 항목: 다른 칸은 늦게 고친 쪽, 체크 기록은 합집합 */
function mergeMarked<T extends WithMarks>(a: T | undefined, b: T | undefined): T | undefined {
  const w = pick(a, b);
  if (!w || !a || !b || w.deleted) return w;
  const { done, undone } = compactMarks(unionMarks(a.done, b.done), unionMarks(a.undone, b.undone));
  return { ...w, done, undone };
}

/**
 * 항목 안의 목록 합치기 (시험 범위 줄·숙제 줄·학교 진도).
 * 넣고 뺀 것은 늦게 고친 쪽(win)의 목록을 따르고, 두 쪽에 다 있는 것은 각자 고친 시각(at)이 늦은 것을 쓴다.
 * 그래서 한 기기에서 범위 줄을 체크하고 다른 기기에서 그 시험의 다른 곳을 고쳐도 체크가 사라지지 않는다.
 */
export function mergeList<T extends { at?: number }>(win: T[] | undefined, lose: T[] | undefined, key: (x: T) => string, inner?: (newer: T, older: T) => T): T[] | undefined {
  if (!win || !lose) return win;
  const other = new Map(lose.map((x) => [key(x), x]));
  return win.map((x) => {
    const y = other.get(key(x));
    if (!y) return x;
    const [newer, older] = (y.at ?? 0) > (x.at ?? 0) ? [y, x] : [x, y];
    return inner ? inner(newer, older) : newer;
  });
}

/** 늦게 고친 쪽(w)과 다른 쪽(o)을 나눠 준다. 한쪽만 있거나 지웠으면 null */
function sides<T extends Stamp>(a: T | undefined, b: T | undefined): [T, T] | null {
  const w = pick(a, b);
  if (!w || !a || !b || w.deleted) return null;
  return [w, w === a ? b : a];
}

const mergeScope = (newer: ExamScope, older: ExamScope): ExamScope => ({ ...newer, lines: mergeList(newer.lines, older.lines, (l) => l.id) ?? newer.lines });

function mergeExam(a?: Exam, b?: Exam): Exam | undefined {
  const s = sides(a, b);
  if (!s) return pick(a, b);
  const [w, o] = s;
  return { ...w, scopes: mergeList(w.scopes, o.scopes, (x) => x.id, mergeScope), days: mergeList(w.days, o.days, (x) => x.date) };
}

function mergeAssessment(a?: Assessment, b?: Assessment): Assessment | undefined {
  const s = sides(a, b);
  if (!s) return pick(a, b);
  const [w, o] = s;
  return { ...w, steps: mergeList(w.steps, o.steps, (x) => x.id) ?? w.steps };
}

function mergeBlank(a?: BlankSheet, b?: BlankSheet): BlankSheet | undefined {
  const s = sides(a, b);
  if (!s) return pick(a, b);
  const [w, o] = s;
  // 떠올려 본 기록은 두 기기 것을 모두 (같은 id 는 하나)
  const tries = [...w.tries, ...o.tries.filter((t) => !w.tries.some((x) => x.id === t.id))].sort((x, y) => x.date.localeCompare(y.date) || (x.at ?? 0) - (y.at ?? 0)).slice(-10);
  return { ...w, tries };
}

function mergeGrade(a?: GradeRecord, b?: GradeRecord): GradeRecord | undefined {
  const s = sides(a, b);
  if (!s) return pick(a, b);
  const [w, o] = s;
  return { ...w, scores: mergeList(w.scores, o.scores, (x) => x.id) ?? w.scores };
}

function mergeHomework(a?: Homework, b?: Homework): Homework | undefined {
  const s = sides(a, b);
  if (!s) return pick(a, b);
  const [w, o] = s;
  return { ...w, items: mergeList(w.items, o.items, (x) => x.id) ?? w.items };
}

function mergeHabit(a?: Habit, b?: Habit): Habit | undefined {
  const s = sides(a, b);
  if (!s) return pick(a, b);
  const [w, o] = s;
  return { ...w, ...mergeHabitChecks(w, o) };
}

function mergeSubject(a?: Subject, b?: Subject): Subject | undefined {
  const s = sides(a, b);
  if (!s) return pick(a, b);
  const [w, o] = s;
  return w.progress ? { ...w, progress: mergeList(w.progress, o.progress, (p) => p.date) } : w;
}

const MERGERS: Partial<Record<Collection, (a?: never, b?: never) => unknown>> = {
  books: mergeMarked as never,
  wordLists: mergeMarked as never,
  exams: mergeExam as never,
  homework: mergeHomework as never,
  habits: mergeHabit as never,
  subjects: mergeSubject as never,
  grades: mergeGrade as never,
  assessments: mergeAssessment as never,
  blanks: mergeBlank as never,
};

export function mergeRecords<T extends Stamp>(a: Record<Id, T>, b: Record<Id, T>, merge: (x?: T, y?: T) => T | undefined = pick, now = Date.now()): Record<Id, T> {
  const out: Record<Id, T> = {};
  for (const id of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const v = merge(a?.[id], b?.[id]);
    // 오래된 지운 표시는 정리 (그동안 모든 기기가 한 번은 맞췄다고 봄)
    if (!v || (v.deleted && now - v.updatedAt > TOMBSTONE_DAYS * DAY)) continue;
    out[id] = v;
  }
  return out;
}

export function mergeStudy(local: StudyData, remote: StudyData | null, now = Date.now()): StudyData {
  if (!remote) return local;
  const out = { ...local, v: 1 } as StudyData;
  out.settings = pick(local.settings, remote.settings) ?? local.settings;
  for (const c of COLLECTIONS) {
    const merger = (MERGERS[c] ?? pick) as never;
    (out as unknown as Record<string, unknown>)[c] = mergeRecords((local[c] ?? {}) as Record<Id, Stamp>, (remote[c] ?? {}) as Record<Id, Stamp>, merger, now);
  }
  return out;
}

export function mergeWords(local: WordsData, remote: WordsData | null, now = Date.now()): WordsData {
  return remote ? mergeRecords(local, remote, pick, now) : local;
}

/** 두 자료가 같은지 (올릴 필요가 있는지) */
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
