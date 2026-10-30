// 사이트 파일은 그대로 내보내고, /api/* 는 로그인·저장 서버(Durable Object 하나)로 넘긴다.
import { Accounts } from './accounts';

export { Accounts };

interface Env {
  ACCOUNTS: DurableObjectNamespace<Accounts>;
  ASSETS: Fetcher;
  /** 영화진흥위원회 오픈 API 키 (Cloudflare 비밀값, 없어도 됨) */
  KOBIS_KEY?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (
      /^\/api\/(auth\/(signup|login|logout|logout-all)|me(\/(nickname|password))?|translate|solve(\/usage|\/img(\/[a-f0-9]{8,64}\/[a-z0-9]+-[a-f0-9]{8}\.(webp|jpg))?)?|movies\/(kobis|catalog(\/sync)?|recommend|ott)|school|dict\/ko|lookup|music\/similar|notify(\/(digest|test))?|store\/(study|words)|study-photo\/[a-z0-9]{6,32})$/.test(
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
