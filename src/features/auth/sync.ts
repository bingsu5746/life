// 로그인했을 때 공부 자료를 서버와 맞춘다: 항목마다 늦게 고친 쪽, 진도는 합집합 (src/features/study/merge.ts)
import { onChange, type SyncName } from '../../lib/dataSync';
import { exportBackup } from '../study/backup';
import { mergeStudy, mergeWords, sameJson } from '../study/merge';
import type { StudyData } from '../study/model';
import { uploadPendingPhotos } from '../study/photos';
import { sanitizeWords } from '../study/sanitize';
import { getStudy, getWords, normalize, replaceStudy, replaceWords, resetLocal } from '../study/store';
import { getStore, isLoggedIn, loggedInUserId, putStore } from './api';

/** 이 기기 자료가 어느 계정 것인지 (다른 계정 자료가 섞이지 않게) */
const OWNER_KEY = 'my-study.owner.v1';
/** 로그아웃한 뒤(자료는 남김) 이 기기에서 고친 것이 있는지: 다른 계정으로 로그인할 때 그냥 지우지 않으려고 */
const DIRTY_KEY = 'my-study.logged-in.dirty-after-logout';

function getKey(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function setKey(k: string, v: string | null) {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    // 무시
  }
}
const getOwner = () => getKey(OWNER_KEY);
const setOwner = (id: string | null) => setKey(OWNER_KEY, id);

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
  const raw = await getStore<StudyData>('study');
  const remote = raw ? normalize(raw) : null;
  const merged = mergeStudy(getStudy(), remote);
  replaceStudy(merged);
  if (!remote || !sameJson(merged, remote)) await putStore('study', merged);
}
async function syncWords() {
  const raw = await getStore<unknown>('words');
  const remote = raw ? sanitizeWords(raw) : null;
  const merged = mergeWords(getWords(), remote);
  replaceWords(merged);
  if (!remote || !sameJson(merged, remote)) await putStore('words', merged);
}

const SYNCERS: Record<SyncName, () => Promise<void>> = { study: syncStudy, words: syncWords };

/** 이 기기에 다른 계정의 자료가 남아 있으면 지운다. 로그아웃한 뒤 고친 것이 있으면 먼저 백업 파일로 받을지 묻는다 */
async function switchOwner() {
  if (getKey(DIRTY_KEY)) {
    const keep = window.confirm('이 기기에 전에 로그인했던 계정의 공부 자료가 남아 있어요 (로그아웃한 뒤 고친 것 포함).\n이 계정으로 바꾸면서 지우기 전에 백업 파일로 내려받을까요?\n(내려받은 파일은 설정 → 백업에서 가져오기로 이 계정에 합칠 수 있어요)');
    if (keep) exportBackup();
  }
  await resetLocal();
  setKey(DIRTY_KEY, null);
}

// 실패하면 점점 길게 기다렸다가 다시 (5초 → 15초 → 1분 → 5분)
const RETRY = [5_000, 15_000, 60_000, 300_000];
let fails = 0;
let retryTimer = 0;

async function doRun(names: SyncName[]) {
  const userId = loggedInUserId();
  if (!userId) return set('local');
  set('syncing');
  clearTimeout(retryTimer);
  try {
    const owner = getOwner();
    if (owner && owner !== userId) await switchOwner();
    for (const n of names) await SYNCERS[n]();
    // 로그인 전에 이 기기에서 쓰던 자료는 처음 로그인한 계정에 합쳐진다
    setOwner(userId);
    setKey(DIRTY_KEY, null);
    fails = 0;
    set('saved');
    // 올리지 못한 오답 사진 (로그인 전에 넣었거나 올리다 실패한 것)
    void uploadPendingPhotos();
  } catch {
    if (!isLoggedIn()) return set('local');
    set('error');
    retryTimer = window.setTimeout(() => void run(['study', 'words']), RETRY[Math.min(fails, RETRY.length - 1)]);
    fails++;
  }
}

// 한 번에 하나씩 (두 번이 겹쳐 같은 자료를 동시에 받아 합치지 않게)
let chain: Promise<void> = Promise.resolve();
function run(names: SyncName[]): Promise<void> {
  const next = chain.then(() => doRun(names));
  chain = next.catch(() => undefined);
  return next;
}

// 이 기기에서 바뀌면 잠시 뒤 계정과 맞춘다
const timers: Partial<Record<SyncName, number>> = {};
if (typeof window !== 'undefined') {
  onChange((name) => {
    if (!isLoggedIn()) {
      // 로그아웃했지만 자료를 남긴 기기에서 고침
      if (getOwner()) setKey(DIRTY_KEY, '1');
      return;
    }
    clearTimeout(timers[name]);
    timers[name] = window.setTimeout(() => void run([name]), 1500);
  });
  // 인터넷이 다시 되면 바로
  window.addEventListener('online', () => {
    if (isLoggedIn() && status === 'error') void run(['study', 'words']);
  });
}

// 다른 기기에서 바꾼 것을 받아 오기: 이 창으로 돌아올 때마다 (30초에 한 번까지, 실패한 뒤면 바로)
let lastPull = 0;
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isLoggedIn()) return;
    if (status !== 'error' && Date.now() - lastPull < 30_000) return;
    lastPull = Date.now();
    void run(['study', 'words']);
  });

/** 로그아웃: 이 기기 자료를 지울지 고른다 */
export async function forgetDevice(wipe: boolean) {
  clearTimeout(retryTimer);
  if (wipe) {
    await resetLocal();
    setOwner(null);
  }
  setKey(DIRTY_KEY, null);
  set('local');
}

/** 로그인 직후·처음 열 때 */
export function syncAll() {
  lastPull = Date.now();
  return run(['study', 'words']);
}
