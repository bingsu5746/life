// 오프라인용 서비스 워커 (빌드할 때 vite.config.ts 가 목록과 버전을 채워 dist/sw.js 로 만든다)
// - 사이트 파일은 설치할 때 받아 둔다 → 인터넷이 없어도 열리고, 자료는 이 기기에 저장된다
// - 페이지 열기는 인터넷 먼저, 안 되면 받아 둔 페이지
// - /api/ (로그인·동기화 서버)는 건드리지 않는다
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const APP = `app-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(APP);
      await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('app-') && k !== APP) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () => (await caches.match('/', { ignoreSearch: true })) ?? Response.error()));
    return;
  }
  e.respondWith((async () => (await caches.match(req)) ?? fetch(req))());
});

// 알림 (worker/push.ts 가 보낸 웹 푸시): 받은 제목·내용을 그대로 보여 준다
self.addEventListener('push', (e) => {
  let m = { title: 'Life', body: '오늘 할 것을 확인해 보세요' };
  try {
    const d = e.data ? e.data.json() : null;
    if (d && typeof d.title === 'string') m = { title: d.title.slice(0, 80), body: typeof d.body === 'string' ? d.body.slice(0, 300) : '' };
  } catch {
    // 모양이 틀리면 기본 글
  }
  e.waitUntil(self.registration.showNotification(m.title, { body: m.body, icon: '/icon-192.png', tag: 'my-study-daily', data: { url: '/' } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.focus();
      return self.clients.openWindow('/');
    })(),
  );
});
