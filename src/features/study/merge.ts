// 두 기기의 공부 자료 합치기 (설계 §8.2). 합치기는 기기에서, 서버는 저장만 한다.
import { COLLECTIONS, type Id, type Mark, type Stamp, type StudyData, type WordsData } from './model';
import { compactMarks } from './pages';

const DAY = 86_400_000;
export const TOMBSTONE_DAYS = 60;

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
    const merger = c === 'books' || c === 'wordLists' ? (mergeMarked as never) : pick;
    (out as unknown as Record<string, unknown>)[c] = mergeRecords((local[c] ?? {}) as Record<Id, Stamp>, (remote[c] ?? {}) as Record<Id, Stamp>, merger, now);
  }
  return out;
}

export function mergeWords(local: WordsData, remote: WordsData | null, now = Date.now()): WordsData {
  return remote ? mergeRecords(local, remote, pick, now) : local;
}

/** 두 자료가 같은지 (올릴 필요가 있는지) */
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
