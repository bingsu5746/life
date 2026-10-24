// 오답 노트 사진 (설계 §8.4): 기기에서 줄여서 IndexedDB 에 두고, 로그인했으면 서버에도 올린다.
// 다른 기기에서는 볼 때 받아 온다.
import { idb } from '../../lib/idb';
import { deleteStudyPhoto, getStudyPhoto, isLoggedIn, putStudyPhoto } from '../auth/api';
import { newId, type Id } from './model';

const MAX_SIDE = 1600;
const MAX_BYTES = 400_000;

/** 긴 변 1600px JPEG 로, 400KB 를 넘으면 품질·크기를 줄여 다시 */
export async function shrink(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  let side = Math.min(MAX_SIDE, Math.max(bmp.width, bmp.height));
  let quality = 0.8;
  for (let i = 0; i < 6; i++) {
    const scale = side / Math.max(bmp.width, bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality));
    if (blob && (blob.size <= MAX_BYTES || i === 5)) return blob;
    quality = Math.max(0.5, quality - 0.1);
    side = Math.round(side * 0.85);
  }
  return file;
}

const toB64 = async (b: Blob) => {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (s: string) => {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: 'image/jpeg' });
};

/** 사진 저장 → id. 서버 올리기가 실패해도 이 기기에는 남는다 (오류 문구를 돌려줌) */
export async function addPhoto(file: Blob): Promise<{ id: Id; error?: string }> {
  const id = newId();
  const blob = await shrink(file);
  await idb.put('studyPhotos', id, blob);
  if (isLoggedIn()) {
    try {
      await putStudyPhoto(id, await toB64(blob));
    } catch (e) {
      return { id, error: (e as Error).message };
    }
  }
  return { id };
}

const urls = new Map<Id, string>();

/** 화면에 보일 주소 (이 기기에 없으면 서버에서 받아 저장) */
export async function photoUrl(id: Id): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return cached;
  let blob = await idb.get<Blob>('studyPhotos', id);
  if (!blob && isLoggedIn()) {
    try {
      blob = fromB64(await getStudyPhoto(id));
      await idb.put('studyPhotos', id, blob);
    } catch {
      return null;
    }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export async function removePhoto(id: Id) {
  await idb.del('studyPhotos', id);
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  if (isLoggedIn()) await deleteStudyPhoto(id).catch(() => undefined);
}
