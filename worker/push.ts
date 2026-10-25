// 웹 푸시 보내기 (폰·PC 알림). 외부 꾸러미 없이 Web Crypto 로:
// - VAPID (RFC 8292): 서버 열쇠로 서명한 JWT(ES256)를 붙여 「이 사이트가 보낸 것」을 알린다
// - 내용 암호화 (RFC 8291, aes128gcm): 알림 내용은 받는 브라우저만 풀 수 있게 암호화한다
// 받는 곳(endpoint)은 알려진 푸시 서버로만 보낸다 (아무 주소로나 요청을 보내는 데 쓰이지 않게).

const enc = new TextEncoder();

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** 알려진 푸시 서버 (Chrome·안드로이드: FCM, Firefox: Mozilla, Safari·아이폰: Apple, Edge: Windows) */
export function allowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.port) return false;
    const h = u.hostname;
    return h === 'fcm.googleapis.com' || h === 'web.push.apple.com' || h.endsWith('.push.services.mozilla.com') || h.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

export interface Vapid {
  /** 공개 열쇠 (raw 65바이트, base64url) — 브라우저에 알려 준다 */
  pub: string;
  /** 비밀 열쇠 (JWK) — 서버에만 */
  priv: JsonWebKey;
}

export async function makeVapid(): Promise<Vapid> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer;
  return { pub: b64url(raw), priv: (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey };
}

/** VAPID JWT: aud 는 푸시 서버 주소의 origin, 12시간 유효 */
export async function vapidJwt(v: Vapid, endpoint: string, subject: string, now = Date.now()): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', v.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // Web Crypto 의 ECDSA 서명은 r||s (64바이트): JWT ES256 이 쓰는 모양 그대로
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

/**
 * 알림 내용 암호화 (RFC 8291 aes128gcm). p256dh·auth 는 브라우저가 준 받는 쪽 열쇠.
 * 돌려주는 것은 그대로 요청 본문으로 보내면 된다.
 */
export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPub = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const as = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPub = new Uint8Array((await crypto.subtle.exportKey('raw', as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as never, as.privateKey, 256));
  // IKM = HKDF(auth, ecdh, "WebPush: info" 0 ua_pub as_pub, 32)
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 마지막(하나뿐인) 묶음 표시 0x02
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 한 곳에 보내기. gone: 그 구독이 없어졌음 (지워야 함) */
export async function sendPush(sub: PushSub, message: { title: string; body: string }, v: Vapid, subject: string): Promise<{ ok: boolean; gone: boolean; status: number }> {
  if (!allowedEndpoint(sub.endpoint)) return { ok: false, gone: true, status: 0 };
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
  const jwt = await vapidJwt(v, sub.endpoint, subject);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${jwt}, k=${v.pub}`,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '3600',
      urgency: 'normal',
    },
    body,
  });
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
}

// ===== 언제 보낼지 =====

/** HH:MM 들과 시간대(분, 한국은 +540) → now 다음에 오는 가장 이른 시각 (ms). 없으면 null */
export function nextFire(times: string[], tzOffset: number, now = Date.now()): number | null {
  let best: number | null = null;
  const local = new Date(now + tzOffset * 60_000);
  const day0 = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  for (const t of times) {
    const m = t.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) continue;
    for (const add of [0, 1]) {
      const at = day0 + add * 86_400_000 + (Number(m[1]) * 60 + Number(m[2])) * 60_000 - tzOffset * 60_000;
      if (at > now && (best === null || at < best)) best = at;
    }
  }
  return best;
}

/** 그 시각의 그 사람 날짜 (YYYY-MM-DD) */
export function localDate(at: number, tzOffset: number): string {
  return new Date(at + tzOffset * 60_000).toISOString().slice(0, 10);
}
