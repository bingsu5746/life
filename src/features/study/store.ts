// 공부 자료를 이 기기에 저장하고 화면에 알린다. 바뀌면 notifyChange 로 계정 동기화에 알린다 (src/features/auth/accountSync.ts).
import { useSyncExternalStore } from 'react';
import { notifyChange } from '../../lib/dataSync';
import { idb } from '../../lib/idb';
import { emptyStudy, type Collection, type Id, type Stamp, type StudyData, type StudySettings, type Word, type WordsData } from './model';
import { sanitizeCollections, sanitizeSettings, sanitizeWords } from './sanitize';

const KEY = 'my-study.study.v1';
const WORDS_KEY = 'my-study.study-words.v1';

function read<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback();
  } catch {
    return fallback();
  }
}

/** 옛 자료나 다른 기기의 자료에 빠진 칸을 채우고, 모양이 틀린 항목은 버린다 (sanitize.ts) */
export function normalize(d: Partial<StudyData> | null | undefined): StudyData {
  const base = emptyStudy();
  if (!d || typeof d !== 'object' || Array.isArray(d)) return base;
  return { ...base, ...d, v: 1, settings: sanitizeSettings(d.settings), ...sanitizeCollections(d) } as StudyData;
}

let study: StudyData = normalize(read<StudyData | null>(KEY, () => null));
let words: WordsData = sanitizeWords(read<unknown>(WORDS_KEY, () => ({})));
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/** 이 기기에 저장하지 못했는지 (저장 공간이 꽉 참 등). 화면 위에 알린다 */
const failed = { study: false, words: false };
export const getSaveFailed = () => failed.study || failed.words;
export const useSaveFailed = () => useSyncExternalStore(subscribe, getSaveFailed);

function save(which: 'study' | 'words', quiet = false) {
  try {
    if (which === 'study') localStorage.setItem(KEY, JSON.stringify(study));
    else localStorage.setItem(WORDS_KEY, JSON.stringify(words));
    failed[which] = false;
  } catch {
    // 저장 공간이 꽉 찼거나 쓸 수 없는 환경: 화면에는 남지만 새로 고치면 사라지므로 알린다
    failed[which] = true;
  }
  emit();
  if (!quiet) notifyChange(which);
}

export const getStudy = () => study;
export const getWords = () => words;
export const useStudy = () => useSyncExternalStore(subscribe, getStudy);
export const useWords = () => useSyncExternalStore(subscribe, getWords);

/** 고친 시각은 늘 앞의 것보다 크게 (같은 밀리초에 두 번 고쳐도 순서가 맞게) */
const stamp = (prev?: Stamp) => Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);

/** 항목 저장 (새로 만들기·고치기) */
export function put<C extends Collection>(c: C, item: Omit<StudyData[C][Id], 'updatedAt'> & { id: Id }) {
  const prev = study[c][item.id] as Stamp | undefined;
  study = { ...study, [c]: { ...study[c], [item.id]: { ...item, updatedAt: stamp(prev), deleted: undefined } } };
  save('study');
}

/** 여러 항목을 한 번에 (한 번만 저장) */
export function putMany(items: { c: Collection; item: { id: Id } & Record<string, unknown> }[]) {
  if (!items.length) return;
  const next = { ...study } as unknown as Record<string, Record<Id, Stamp>>;
  for (const { c, item } of items) {
    next[c] = { ...next[c], [item.id]: { ...item, updatedAt: stamp(next[c][item.id]), deleted: undefined } as Stamp };
  }
  study = next as unknown as StudyData;
  save('study');
}

export function remove(c: Collection, id: Id) {
  const prev = study[c][id] as Stamp | undefined;
  if (!prev) return;
  study = { ...study, [c]: { ...study[c], [id]: { ...prev, deleted: true, updatedAt: stamp(prev) } } };
  save('study');
}

export function setSettings(patch: Partial<StudySettings>) {
  study = { ...study, settings: { ...study.settings, ...patch, updatedAt: stamp(study.settings) } };
  save('study');
}

export function putWords(list: Word[]) {
  if (!list.length) return;
  const next = { ...words };
  for (const w of list) next[w.id] = { ...w, updatedAt: stamp(next[w.id]), deleted: undefined };
  words = next;
  save('words');
}
export function removeWords(ids: Id[]) {
  if (!ids.length) return;
  const next = { ...words };
  for (const id of ids) if (next[id]) next[id] = { ...next[id], deleted: true, updatedAt: stamp(next[id]) };
  words = next;
  save('words');
}

/** 이 기기의 공부 자료를 모두 지운다 (로그아웃할 때 고르면, 다른 계정이 이 기기에서 로그인할 때) */
export async function resetLocal() {
  study = normalize(null);
  words = {};
  save('study', true);
  save('words', true);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('my-study.') && !k.startsWith('my-study.logged-in') && k !== 'my-study.theme') localStorage.removeItem(k);
  } catch {
    // 무시
  }
  await idb.clear('studyPhotos');
}

/** 계정 동기화가 합친 자료를 넣는다 (다시 올리지 않게 조용히) */
export function replaceStudy(d: StudyData) {
  study = normalize(d);
  save('study', true);
}
export function replaceWords(w: WordsData) {
  words = sanitizeWords(w);
  save('words', true);
}
