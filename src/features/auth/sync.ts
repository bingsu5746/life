// 로그인했을 때 공부 자료를 서버와 맞춘다: 항목마다 늦게 고친 쪽, 진도는 합집합 (src/features/study/merge.ts)
import { onChange, type SyncName } from '../../lib/dataSync';
import { mergeStudy, mergeWords, sameJson } from '../study/merge';
import type { StudyData, WordsData } from '../study/model';
import { getStudy, getWords, normalize, replaceStudy, replaceWords, resetLocal } from '../study/store';
import { getStore, isLoggedIn, loggedInUserId, putStore } from './api';

/** 이 기기 자료가 어느 계정 것인지 (다른 계정 자료가 섞이지 않게) */
const OWNER_KEY = 'my-study.owner.v1';
const getOwner = () => {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
};
const setOwner = (id: string | null) => {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // 무시
  }
};

export type SyncStatus = 'local' | 'syncing' | 'saved' | 'error';
let status: SyncStatus = isLoggedIn() ? 'syncing' : 'local';
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
  const userId = loggedInUserId();
  if (!userId) return set('local');
  set('syncing');
  try {
    // 이 기기에 다른 계정의 자료가 남아 있으면 지우고 이 계정 자료를 받는다 (그 자료는 그 계정 서버에 있음)
    const owner = getOwner();
    if (owner && owner !== userId) await resetLocal();
    for (const n of names) await SYNCERS[n]();
    // 로그인 전에 이 기기에서 쓰던 자료는 처음 로그인한 계정에 합쳐진다
    setOwner(userId);
    set('saved');
  } catch {
    set('error');
  }
}

// 이 기기에서 바뀌면 잠시 뒤 계정과 맞춘다
const timers: Partial<Record<SyncName, number>> = {};
if (typeof window !== 'undefined')
  onChange((name) => {
    if (!isLoggedIn()) return;
    clearTimeout(timers[name]);
    timers[name] = window.setTimeout(() => void run([name]), 1500);
  });

// 다른 기기에서 바꾼 것을 받아 오기: 이 창으로 돌아올 때마다 (30초에 한 번까지)
let lastPull = 0;
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isLoggedIn() || Date.now() - lastPull < 30_000) return;
    lastPull = Date.now();
    void run(['study', 'words']);
  });

/** 로그아웃: 이 기기 자료를 지울지 고른다 */
export async function forgetDevice(wipe: boolean) {
  if (wipe) {
    await resetLocal();
    setOwner(null);
  }
  set('local');
}

/** 로그인 직후·처음 열 때 */
export function syncAll() {
  lastPull = Date.now();
  return run(['study', 'words']);
}
