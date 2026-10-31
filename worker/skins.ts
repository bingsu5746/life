// 롤 스킨 평가 (인벤 스킨 DB): 챔피언별 스킨 · 별점(5점) · 참여자 수 · 가격 · 최근 한줄평
import { within } from './nba';

const BASE = 'https://lol.inven.co.kr/dataninfo/skin/';
const HEAD = { 'user-agent': 'Mozilla/5.0', referer: BASE, 'content-type': 'application/x-www-form-urlencoded' };
const un = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

/** 인벤 챔피언 번호: 한국어 이름 → 번호 */
export async function invenChamps(): Promise<Record<string, number>> {
  const t = await (await within(fetch(BASE, { headers: { 'user-agent': 'Mozilla/5.0' } }), 20_000, '인벤')).text();
  const out: Record<string, number> = {};
  for (const m of t.matchAll(/id="champList(\d+)_[^"]*"[^>]*data-name="([^"]+)"/g)) out[un(m[2])] = Number(m[1]);
  if (!Object.keys(out).length) throw new Error('인벤 챔피언 목록을 읽지 못했어요');
  return out;
}

export interface InvenSkin {
  code: number;
  name: string;
  /** 스킨 번호 (Data Dragon 과 같은 번호, 그림 파일 이름에서) */
  num: number | null;
  price: string;
  votes: number;
  avg: number;
  /** 인벤 그림 파일 (인게임 · 일러스트) */
  ingame: string;
  image: string;
}
export interface InvenComment {
  skin: number;
  text: string;
  date: string;
}

export async function invenSkins(champ: number): Promise<{ skins: InvenSkin[]; comments: InvenComment[] }> {
  const x = await (await within(fetch(`${BASE}skin.xml.php`, { method: 'POST', headers: HEAD, body: `reqchampion=${champ}` }), 20_000, '인벤')).text();
  const tag = (b: string, k: string) => un(b.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`))?.[1] ?? '');
  const skins = [...x.matchAll(/<skin>([\s\S]*?)<\/skin>/g)].map(([, b]) => {
    const n = tag(b, 'skinnum').match(/^(\d+)/);
    return { code: Number(tag(b, 'code')), name: tag(b, 'name'), num: n ? Number(n[1]) : null, price: tag(b, 'price').replace(/^입수방법:\s*/, ''), ingame: tag(b, 'ingame'), image: tag(b, 'image'), votes: Number(tag(b, 'voteCount')) || 0, avg: Number(tag(b, 'voteAverage')) || 0 };
  });
  // 한줄평: 스킨마다 3개 넘게 모일 때까지 (최대 40쪽 = 400개, Workers 한 요청에 바깥 요청 50번 한도 안쪽)
  const comments: InvenComment[] = [];
  const enough = () => skins.every((s) => comments.filter((c) => c.skin === s.code).length >= 3);
  for (let page = 0; page < 40 && !enough(); page++) {
    const h = await (await within(fetch(BASE, { method: 'POST', headers: HEAD, body: `mode=controllers&target=skincomments&champcode=${champ}&page=${page}` }), 20_000, '인벤')).text();
    const rows = [...h.matchAll(/<tr class="row">([\s\S]*?)<\/tr>/g)];
    for (const [, r] of rows) {
      const skin = Number(r.match(/skin=(\d+)/)?.[1] ?? 0);
      const text = un(r.match(/<span class="content">([\s\S]*?)<\/span>/)?.[1] ?? '');
      const date = un(r.match(/<span class="cmtDate">([\s\S]*?)<\/span>/)?.[1] ?? '');
      if (skin && text) comments.push({ skin, text, date });
    }
    if (rows.length < 10) break;
  }
  return { skins, comments };
}

/** 스킨 스포트라이트 영상 (유튜브 번호) */
export async function invenSkinVideo(code: number): Promise<string | null> {
  const h = await (await within(fetch(BASE, { method: 'POST', headers: HEAD, body: `mode=controllers&target=skinDetail&skincode=${code}` }), 20_000, '인벤')).text();
  return h.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,20})/)?.[1] ?? null;
}
