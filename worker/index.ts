// 사이트 파일은 그대로 내보내고, /api/* 는 로그인·저장 서버(Durable Object 하나)로 넘긴다.
import { Accounts } from './accounts';
import { Relay } from './relay';

export { Accounts, Relay };

interface Env {
  ACCOUNTS: DurableObjectNamespace<Accounts>;
  ASSETS: Fetcher;
  /** 영화진흥위원회 오픈 API 키 (Cloudflare 비밀값, 없어도 됨) */
  KOBIS_KEY?: string;
}

/** NBA 선수 얼굴 · 팀 로고: NBA 이미지 서버에서 받아 Cloudflare 캐시에 7일 둔다.
 *  (화면에서 바로 부르면 NBA 서버가 다른 사이트에서 온 요청을 막을 수 있어서 우리 주소를 거친다. 번호만 받아서 다른 주소는 못 부른다) */
async function nbaImage(kind: string, id: string, ctx: ExecutionContext): Promise<Response> {
  const src = kind === 'h' ? `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png` : `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`;
  const cache = caches.default;
  const key = new Request(`https://life-img.cache/${kind}/${id}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const up = await fetch(src, { headers: { referer: 'https://www.nba.com/', 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' } });
  if (!up.ok) return new Response('no image', { status: 404, headers: { 'cache-control': 'public, max-age=86400' } });
  const res = new Response(up.body, { headers: { 'content-type': kind === 'h' ? 'image/png' : 'image/svg+xml', 'cache-control': 'public, max-age=604800, immutable', 'x-content-type-options': 'nosniff' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const img = req.method === 'GET' ? url.pathname.match(/^\/api\/nba\/img\/(h|l)\/(\d{3,12})$/) : null;
    if (img) return nbaImage(img[1], img[2], ctx);
    if (
      /^\/api\/(auth\/(signup|login|logout|logout-all)|me(\/(nickname|password))?|translate|solve(\/job\/[a-z0-9]{6,32}|\/usage|\/img(\/[a-f0-9]{8,64}\/[a-z0-9]+-[a-f0-9]{8}\.(webp|jpg))?)?|movies\/(kobis|catalog(\/sync)?|recommend|ott)|school|holidays|keys|games\/(search|prices|watch|csmap)|steam\/(me|ach|names|watch|thumbs)|lol\/(profile|games|meta|champ)|music\/discogs|ai\/(note|diary|receipt|toc)|books\/(search|toc)|bb\/scan(\/[a-f0-9]{16})?|fact|nba\/(games|standings|box|avg|roster|career|players|2k|hlplayer|fav)|dict\/ko|lookup|music\/similar|notify(\/(digest|test))?|store\/(study|words)|study-photo\/[a-z0-9]{6,32})$/.test(
        url.pathname,
      )
    ) {
      try {
        // 밖에서 붙여 온 키 머리글은 지우고, 영화 정보 요청에만 비밀값의 키를 붙인다
        const headers = new Headers(req.headers);
        headers.delete('x-life-kobis-key');
        if ((url.pathname === '/api/movies/kobis' || url.pathname === '/api/movies/catalog/sync') && env.KOBIS_KEY) headers.set('x-life-kobis-key', env.KOBIS_KEY);
        const stub = () => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global'));
        const first = new Request(req, { headers });
        // 서버가 막 새 판으로 바뀌는 중이면 한 번 더 해 본다 (본문은 미리 복사)
        const again = first.clone();
        try {
          return await stub().fetch(first);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/exceeded|limit|quota/i.test(msg)) throw e;
          console.error('accounts retry', msg);
          return await stub().fetch(again);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('accounts unavailable', msg);
        const quota = /exceeded|free tier|limit|quota/i.test(msg);
        return new Response(JSON.stringify({ error: quota ? '오늘 서버 무료 사용 한도를 다 써서 한국 시간 오전 9시까지 로그인·저장을 쓸 수 없어요.' : '계정 서버에 연결할 수 없어요. 잠시 뒤 다시 해 주세요.' }), {
          status: 503,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
    }
    if (url.pathname.startsWith('/api/')) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    return env.ASSETS.fetch(req);
  },
};
