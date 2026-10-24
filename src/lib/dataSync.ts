// 기기끼리 맞추는 자료가 바뀌었을 때 알리는 곳 (계정 동기화가 듣고 서버에 올린다).
// 다른 기기의 자료를 받아 합친 뒤에는 synced 를 알려 화면이 다시 읽게 한다.
export type SyncName = 'study' | 'words';

export function notifyChange(name: SyncName) {
  window.dispatchEvent(new CustomEvent('my-study-change', { detail: name }));
}
export function onChange(fn: (name: SyncName) => void) {
  const h = (e: Event) => fn((e as CustomEvent<SyncName>).detail);
  window.addEventListener('my-study-change', h);
  return () => window.removeEventListener('my-study-change', h);
}
