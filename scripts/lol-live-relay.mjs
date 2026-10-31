// 롤 실시간 도우미: 게임(https://127.0.0.1:2999, 자체 인증서)을 http://127.0.0.1:2998 로 전해 줘서
// Life 웹사이트의 「롤 실시간」 화면이 읽을 수 있게 한다. 내 컴퓨터 안에서만 열린다(127.0.0.1).
// 쓰는 법: node lol-live-relay.mjs   (Node 18 이상, 설치할 것 없음). 켜 둔 채로 게임하면 된다.
import http from 'node:http';
import https from 'node:https';

const SITE = 'https://life.silent-recipe-8e5c.workers.dev';
const agent = new https.Agent({ rejectUnauthorized: false }); // 게임 주소(127.0.0.1:2999) 전용

http
  .createServer((req, res) => {
    const origin = req.headers.origin;
    const cors = {
      'Access-Control-Allow-Origin': origin === SITE || origin?.startsWith('http://localhost') ? origin : SITE,
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Allow-Methods': 'GET',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    if (req.method !== 'GET' || !req.url?.startsWith('/liveclientdata/')) return res.writeHead(404, cors).end();
    https
      .get(`https://127.0.0.1:2999${req.url}`, { agent, timeout: 2000 }, (g) => {
        res.writeHead(g.statusCode ?? 502, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        g.pipe(res);
      })
      .on('timeout', function () {
        this.destroy();
      })
      .on('error', () => res.writeHead(503, cors).end('{"error":"game not running"}'));
  })
  .listen(2998, '127.0.0.1', () => console.log('롤 실시간 도우미 켜짐: http://127.0.0.1:2998 (끄려면 Ctrl+C)'));
