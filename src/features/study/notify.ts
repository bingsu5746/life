// 이 기기에서 알림 켜기·끄기, 알림 글 올리기 (worker/push.ts · notifyDigest.ts)
import { isLoggedIn, notifyDigest, notifyInfo, notifyOff, notifyOn } from '../auth/api';
import { getStudy, getWords } from './store';

const KEY = 'my-study.notify.times';

export const notifySupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** 이 기기에서 켜 둔 알림 시각 (꺼져 있으면 null) */
export function localTimes(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    return Array.isArray(v) && v.every((t) => typeof t === 'string') ? (v as string[]) : null;
  } catch {
    return null;
  }
}
function saveTimes(t: string[] | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    // 저장할 수 없는 환경
  }
}

const b64 = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('알림을 쓰려면 사이트를 한 번 새로 고친 뒤 다시 해 주세요.');
  return reg;
}

/** 알림 켜기 (또는 시각 바꾸기) */
export async function enableNotify(times: string[]) {
  if (!notifySupported()) throw new Error('이 브라우저는 알림을 받을 수 없어요. 아이폰은 사이트를 「홈 화면에 추가」한 뒤 거기서 열어 주세요.');
  if (!isLoggedIn()) throw new Error('알림은 로그인한 뒤에 켤 수 있어요.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림을 허용하지 않았어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.');
  const reg = await registration();
  const { publicKey } = await notifyInfo();
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey);
    const want = b64(publicKey);
    if (cur.length !== want.length || cur.some((x, i) => x !== want[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
  await notifyOn(sub.toJSON(), times, -new Date().getTimezoneOffset());
  saveTimes(times);
  await uploadDigest(true);
}

export async function disableNotify() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await notifyOff(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
  } finally {
    saveTimes(null);
  }
}

let last = '';
/** 알림 글을 다시 계산해서 바뀌었으면 올린다 (켜 둔 기기에서만) */
export async function uploadDigest(force = false) {
  const times = localTimes();
  if (!times?.length || !isLoggedIn()) return;
  const { studyDate } = await import('./dates');
  // 알림 글 계산은 여러 영역을 읽어서 크다: 알림을 켠 기기에서만 받는다
  const { buildDigest } = await import('./notifyDigest');
  const d = getStudy();
  const entries = buildDigest(d, getWords(), studyDate(Date.now(), d.settings.dayStart), times);
  const key = JSON.stringify(entries);
  if (!force && key === last) return;
  await notifyDigest(entries);
  last = key;
}
