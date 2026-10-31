// 롤 게임 중 실시간 내 기록 보기 (Riot Live Client Data API, 내 컴퓨터에서만 동작)
// 쓰는 법: 롤 게임에 들어간 뒤  node scripts/lol-live.mjs   (Node 18 이상, 따로 설치할 것 없음)
// 게임 클라이언트가 127.0.0.1:2999 에 스스로 서명한 인증서를 써서, 이 주소에만 인증서 확인을 끈다.
import https from 'node:https';

const URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata';
const agent = new https.Agent({ rejectUnauthorized: false }); // 127.0.0.1 전용

function get(url) {
  return new Promise((ok, no) => {
    const req = https.get(url, { agent, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => (res.statusCode === 200 ? ok(JSON.parse(body)) : no(new Error(`HTTP ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new Error('응답 없음')));
    req.on('error', no);
  });
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function tick() {
  try {
    const d = await get(URL);
    const a = d.activePlayer ?? {};
    // 예전 클라이언트는 summonerName, 지금은 riotId(이름#태그)를 쓴다
    const myName = a.riotId ?? a.summonerName;
    const me = (d.allPlayers ?? []).find((p) => (p.riotId ?? p.summonerName) === myName) ?? {};
    const s = me.scores ?? {};
    const t = d.gameData?.gameTime ?? 0;
    const cs = s.creepScore ?? 0;
    const kda = s.deaths ? ((s.kills + s.assists) / s.deaths).toFixed(2) : 'Perfect';
    console.clear();
    console.log(`[${mmss(t)}] ${me.championName ?? '?'} (레벨 ${a.level ?? '?'})`);
    console.log(`KDA ${s.kills ?? 0}/${s.deaths ?? 0}/${s.assists ?? 0}  (${kda})`);
    console.log(`CS ${cs}  (분당 ${t > 0 ? ((cs / t) * 60).toFixed(1) : '0.0'})`);
    console.log(`골드 ${Math.floor(a.currentGold ?? 0)}  · 시야 점수 ${Math.round(s.wardScore ?? 0)}`);
    if (me.isDead) console.log(`💀 부활까지 ${Math.ceil(me.respawnTimer ?? 0)}초`);
  } catch (e) {
    console.clear();
    console.log(`게임 데이터를 기다리는 중… (${e.message}) — 게임에 들어가면 나와요`);
  }
}

tick();
setInterval(tick, 2000);
