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
    if (/^\/api\/(auth\/(signup|login|logout|logout-all)|me(\/(nickname|password))?|translate|movies\/(kobis|catalog(\/sync)?)|notify(\/(digest|test))?|store\/(study|words)|study-photo\/[a-z0-9]{6,32})$/.test(url.pathname)) {
      try {
        // 밖에서 붙여 온 키 머리글은 지우고, 영화 정보 요청에만 비밀값의 키를 붙인다
        const headers = new Headers(req.headers);
        headers.delete('x-life-kobis-key');
        if ((url.pathname === '/api/movies/kobis' || url.pathname === '/api/movies/catalog/sync') && env.KOBIS_KEY) headers.set('x-life-kobis-key', env.KOBIS_KEY);
        return await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global')).fetch(new Request(req, { headers }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('accounts unavailable', msg);
        return new Response(JSON.stringify({ error: '계정 서버에 연결할 수 없어요. 잠시 뒤 다시 해 주세요.' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      }
    }
    if (url.pathname.startsWith('/api/')) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    return env.ASSETS.fetch(req);
  },
};
