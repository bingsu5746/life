// 일기 짧은 영상 (10초까지): 기기에서 작게 다시 녹화해 IndexedDB 에 두고, 로그인했으면 서버에도 올린다
import { idb } from '../../lib/idb';
import { deleteStudyVideo, getStudyVideo, isLoggedIn, putStudyVideo } from '../auth/api';
import { newId, type Id } from './model';

export const MAX_SEC = 10;
/** 서버 한도 (base64 1.75MB) 안쪽 */
const MAX_BYTES = 1_250_000;

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
  // 첫 바이트로 종류를 정한다 (WebM 1A 45 DF A3)
  return new Blob([buf], { type: buf[0] === 0x1a ? 'video/webm' : 'video/mp4' });
};

const mimeOf = () => ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));

/** 영상 → 짧은 변 360px · 앞 10초 · 낮은 비트레이트로 다시 녹화 (재생하면서 녹화해 길이만큼 걸린다) */
export async function shrinkVideo(file: Blob, onProgress?: (sec: number) => void): Promise<{ blob: Blob; cut: boolean }> {
  const v = document.createElement('video');
  v.playsInline = true;
  v.preload = 'auto';
  v.src = URL.createObjectURL(file);
  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error('영상을 열지 못했어요'));
    });
    const dur = Number.isFinite(v.duration) ? v.duration : MAX_SEC;
    const cut = dur > MAX_SEC + 0.3;
    // 이미 작고 짧으면 그대로
    if (!cut && file.size <= MAX_BYTES && /^video\/(mp4|webm|quicktime)/.test(file.type) && file.type !== 'video/quicktime') return { blob: file, cut };
    const mime = mimeOf();
    if (!mime) throw new Error('이 브라우저는 영상을 줄일 수 없어요');
    const scale = Math.min(1, 360 / Math.max(1, Math.min(v.videoWidth, v.videoHeight)));
    const c = document.createElement('canvas');
    c.width = Math.round((v.videoWidth * scale) / 2) * 2 || 360;
    c.height = Math.round((v.videoHeight * scale) / 2) * 2 || 640;
    const g = c.getContext('2d')!;
    const stream = c.captureStream(30);
    // 소리: 영상 소리를 WebAudio 로 받아 붙인다 (막히면 소리 없이)
    let ac: AudioContext | null = null;
    try {
      ac = new AudioContext();
      const src = ac.createMediaElementSource(v);
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    } catch {
      ac = null;
    }
    const secs = Math.min(dur, MAX_SEC);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.floor(((MAX_BYTES * 8) / secs) * 0.75), audioBitsPerSecond: 48_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((res) => (rec.onstop = () => res()));
    try {
      await v.play();
    } catch {
      // 소리 있는 재생이 막히면 소리 없이
      v.muted = true;
      await v.play();
    }
    rec.start(500);
    await new Promise<void>((res) => {
      const draw = () => {
        g.drawImage(v, 0, 0, c.width, c.height);
        onProgress?.(Math.min(secs, v.currentTime));
        if (v.ended || v.currentTime >= secs) return res();
        requestAnimationFrame(draw);
      };
      draw();
    });
    v.pause();
    rec.stop();
    await done;
    void ac?.close();
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (blob.size > MAX_BYTES * 1.3) throw new Error('영상이 너무 커요. 더 짧게 찍어 주세요');
    return { blob, cut };
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

// ===== 아직 서버에 올리지 못한 영상 =====
const PENDING_KEY = 'my-study.videos.pending.v1';
function pending(): Id[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is Id => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function setPending(ids: Id[]) {
  try {
    if (ids.length) localStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(ids)]));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // 무시
  }
}
let uploading = false;
export async function uploadPendingVideos() {
  if (uploading || !isLoggedIn()) return;
  uploading = true;
  try {
    for (const id of pending()) {
      const blob = await idb.get<Blob>('studyPhotos', `v-${id}`);
      if (blob) await putStudyVideo(id, await toB64(blob));
      setPending(pending().filter((x) => x !== id));
    }
  } catch {
    // 다음 동기화 때 다시
  } finally {
    uploading = false;
  }
}

/** 줄인 영상 저장 → id (사진 칸과 같은 저장소, 이름 앞에 v-) */
export async function addVideo(blob: Blob): Promise<{ id: Id; error?: string }> {
  const id = newId();
  await idb.put('studyPhotos', `v-${id}`, blob);
  if (!isLoggedIn()) {
    setPending([...pending(), id]);
    return { id };
  }
  try {
    await putStudyVideo(id, await toB64(blob));
  } catch (e) {
    setPending([...pending(), id]);
    return { id, error: (e as Error).message };
  }
  return { id };
}

const urls = new Map<Id, string>();
export async function videoUrl(id: Id): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return cached;
  let blob = await idb.get<Blob>('studyPhotos', `v-${id}`);
  if (!blob && isLoggedIn()) {
    try {
      blob = fromB64(await getStudyVideo(id));
      await idb.put('studyPhotos', `v-${id}`, blob);
    } catch {
      return null;
    }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export async function removeVideo(id: Id) {
  setPending(pending().filter((x) => x !== id));
  await idb.del('studyPhotos', `v-${id}`);
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  if (isLoggedIn()) await deleteStudyVideo(id).catch(() => undefined);
}
