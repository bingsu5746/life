// 사이트 파일은 그대로 내보내고, /api/* 는 로그인·저장 서버(Durable Object 하나)로 넘긴다.
import { Accounts } from './accounts';

export { Accounts };

interface Env {
  ACCOUNTS: DurableObjectNamespace<Accounts>;
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (/^\/api\/(auth\/(signup|login|logout|logout-all)|me(\/(nickname|password))?|translate|notify(\/(digest|test))?|store\/(study|words)|study-photo\/[a-z0-9]{6,32})$/.test(url.pathname)) {
      try {
        return await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global')).fetch(req);
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
