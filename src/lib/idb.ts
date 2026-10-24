// 아주 작은 IndexedDB 도우미. localStorage(약 5MB)에 넣기엔 큰 것(오답 노트 사진)을 이 기기에 저장한다.

const DB_NAME = 'my-study';
const VERSION = 1;
/** studyPhotos: 오답 노트 사진 */
export const STORES = ['studyPhotos'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>).catch(() => undefined),
  put: <T>(store: StoreName, key: string, value: T) => run(store, 'readwrite', (s) => s.put(value, key)).catch(() => undefined),
  del: (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)).catch(() => undefined),
  keys: (store: StoreName) => run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((k) => k.map(String)).catch(() => [] as string[]),
};
