// 로그인했을 때 공부 자료를 서버와 맞춘다: 항목마다 늦게 고친 쪽, 진도는 합집합 (src/features/study/merge.ts)
import { onChange, type SyncName } from '../../lib/dataSync';
import { mergeStudy, mergeWords, sameJson } from '../study/merge';
import type { StudyData, WordsData } from '../study/model';
import { getStudy, getWords, normalize, replaceStudy, replaceWords } from '../study/store';
import { getStore, getToken, putStore } from './api';

export type SyncStatus = 'local' | 'syncing' | 'saved' | 'error';
let status: SyncStatus = getToken() ? 'syncing' : 'local';
const listeners = new Set<(s: SyncStatus) => void>();
const set = (s: SyncStatus) => {
  status = s;
  listeners.forEach((f) => f(s));
};
export const getSyncStatus = () => status;
export function onSyncStatus(f: (s: SyncStatus) => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

async function syncStudy() {
  const remote = await getStore<StudyData>('study');
  const merged = mergeStudy(getStudy(), remote ? normalize(remote) : null);
  replaceStudy(merged);
  if (!remote || !sameJson(merged, normalize(remote))) await putStore('study', merged);
}
async function syncWords() {
  const remote = await getStore<WordsData>('words');
  const merged = mergeWords(getWords(), remote);
  replaceWords(merged);
  if (!remote || !sameJson(merged, remote)) await putStore('words', merged);
}

const SYNCERS: Record<SyncName, () => Promise<void>> = { study: syncStudy, words: syncWords };

async function run(names: SyncName[]) {
  if (!getToken()) return set('local');
  set('syncing');
  try {
    for (const n of names) await SYNCERS[n]();
    set('saved');
  } catch {
    set('error');
  }
}

// 이 기기에서 바뀌면 잠시 뒤 계정과 맞춘다
const timers: Partial<Record<SyncName, number>> = {};
if (typeof window !== 'undefined')
  onChange((name) => {
    if (!getToken()) return;
    clearTimeout(timers[name]);
    timers[name] = window.setTimeout(() => void run([name]), 1500);
  });

// 다른 기기에서 바꾼 것을 받아 오기: 이 창으로 돌아올 때마다 (30초에 한 번까지)
let lastPull = 0;
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !getToken() || Date.now() - lastPull < 30_000) return;
    lastPull = Date.now();
    void run(['study', 'words']);
  });

/** 로그인 직후·처음 열 때 */
export function syncAll() {
  lastPull = Date.now();
  return run(['study', 'words']);
}
