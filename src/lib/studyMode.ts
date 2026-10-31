// 공부 모드: 켜면 공부 · AI 만 남기고 취미 · 돈 · 일기 같은 것은 숨긴다 (이 기기에만, 바로 바뀌게 이벤트로 알림)
import { useSyncExternalStore } from 'react';

const KEY = 'my-study.study-mode';
const EVT = 'my-study-mode';
export const STUDY_MODE_AREAS = ['home', 'study', 'ai'];

export function isStudyMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
export function setStudyMode(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
  window.dispatchEvent(new Event(EVT));
}
const subscribe = (f: () => void) => {
  window.addEventListener(EVT, f);
  window.addEventListener('storage', f);
  return () => {
    window.removeEventListener(EVT, f);
    window.removeEventListener('storage', f);
  };
};
export const useStudyMode = () => useSyncExternalStore(subscribe, isStudyMode, () => false);
