// CheapShark (https://www.cheapshark.com/api/1.0/, 키 없음): 게임 값. Steam 은 storeID "1", 값은 미국 달러.
// 알아보기 쉬운 User-Agent 가 없으면 거절한다 (응답 글: 「Missing or generic User-Agent header detected」)
import { within } from './nba';

export async function cheapShark(path: string): Promise<unknown> {
  const res = await within(fetch(`https://www.cheapshark.com/api/1.0/${path}`, { headers: { 'user-agent': 'LifeApp/1.0 (https://life.silent-recipe-8e5c.workers.dev)' } }), 15_000, 'CheapShark');
  if (!res.ok) throw new Error(`CheapShark ${res.status}`);
  return res.json();
}
