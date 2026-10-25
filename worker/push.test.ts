import { describe, expect, it } from 'vitest';
import { allowedEndpoint, b64url, encryptPayload, fromB64url, localDate, makeVapid, nextFire, vapidJwt } from './push';

const enc = new TextEncoder();
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));

/** 브라우저 쪽에서 하는 풀기 (RFC 8291) — 암호화가 맞는지 보려고 테스트에서 따로 구현 */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, uaPub: Uint8Array, auth: Uint8Array) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPub = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hmac(await hmac(auth, ecdh), cat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  expect(pt[pt.length - 1]).toBe(2);
  return new TextDecoder().decode(pt.slice(0, -1));
}

describe('웹 푸시', () => {
  it('알림 내용 암호화를 받는 쪽이 풀 수 있다', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPub = new Uint8Array((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const msg = JSON.stringify({ title: '내 공부', body: '오늘 예습 2개 · 복습 5개' });
    const body = await encryptPayload(enc.encode(msg), b64url(uaPub), b64url(auth));
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(await decrypt(body, ua, uaPub, auth)).toBe(msg);
  });
  it('VAPID 서명이 공개 열쇠로 확인된다', async () => {
    const v = await makeVapid();
    expect(fromB64url(v.pub).length).toBe(65);
    const jwt = await vapidJwt(v, 'https://fcm.googleapis.com/fcm/send/abc', 'https://life.example', 1_700_000_000_000);
    const [h, b, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(b)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 43200, sub: 'https://life.example' });
    const pub = await crypto.subtle.importKey('raw', fromB64url(v.pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(s), enc.encode(`${h}.${b}`))).toBe(true);
  });
  it('알려진 푸시 서버로만', () => {
    expect(allowedEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(allowedEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(allowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(allowedEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(allowedEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false);
    expect(allowedEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(allowedEndpoint('nope')).toBe(false);
  });
  it('다음 알림 시각 (한국 시간)', () => {
    // 2026-10-25 12:00 KST = 03:00Z
    const now = Date.UTC(2026, 9, 25, 3, 0);
    expect(new Date(nextFire(['07:30', '21:00'], 540, now)!).toISOString()).toBe('2026-10-25T12:00:00.000Z');
    expect(new Date(nextFire(['07:30'], 540, now)!).toISOString()).toBe('2026-10-25T22:30:00.000Z');
    expect(nextFire(['25:00', 'x'], 540, now)).toBeNull();
    expect(localDate(Date.UTC(2026, 9, 25, 22, 30), 540)).toBe('2026-10-26');
  });
});
