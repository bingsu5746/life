// 시험장 소리 같은 음원 파일: 이 기기의 IndexedDB 에 저장한다 (서버로 보내지 않는다).
// public/sounds/exam.mp3 가 있으면 그것을 먼저 쓴다 (앱에 함께 올린 음원).
const DB = 'life-sounds';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

export async function saveSound(key: string, file: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((ok, fail) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, key);
    tx.oncomplete = () => ok();
    tx.onerror = () => fail(tx.error);
  });
}

export async function loadSound(key: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((ok) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => ok((r.result as Blob | undefined) ?? null);
    r.onerror = () => ok(null);
  });
}

export async function removeSound(key: string): Promise<void> {
  const db = await open();
  await new Promise<void>((ok) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => ok();
    tx.onerror = () => ok();
  });
}

/** 시험장 소리 주소: 앱에 올린 파일 → 이 기기에 넣은 파일 → 없음 */
export async function examSoundUrl(): Promise<string | null> {
  try {
    const r = await fetch('/sounds/exam.mp3', { method: 'HEAD' });
    if (r.ok && (r.headers.get('content-type') ?? '').startsWith('audio')) return '/sounds/exam.mp3';
  } catch {
    /* 없음 */
  }
  try {
    const b = await loadSound('exam');
    return b ? URL.createObjectURL(b) : null;
  } catch {
    return null;
  }
}
