// Steam 공식 (확인한 것):
// - 상점 찾기 store.steampowered.com/api/storesearch/?term=&cc=KR&l=korean → items[{ id, name, price{currency:'KRW', initial, final}(원×100) }] (키 없음)
// - 값 store.steampowered.com/api/appdetails?appids=a,b&cc=kr&filters=price_overview → { [id]: { success, data: { price_overview{ initial, final, discount_percent } } | [] } } (무료면 data 가 [])
// - 찜 목록 api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid= (공개 프로필이면 키 없음)
// - 가진 게임 IPlayerService/GetOwnedGames/v1 · 최근 IPlayerService/GetRecentlyPlayedGames/v1 · 프로필 ISteamUser/GetPlayerSummaries/v2 · 업적 ISteamUserStats/GetPlayerAchievements/v1 · 게임 기록 GetUserStatsForGame/v2 (키 필요)
// - ISteamApps/GetAppList/v2 는 지금 없음 (404 「Method 'GetAppList' not found」)
import { within } from './nba';

const UA = { 'user-agent': 'LifeApp/1.0 (https://life.silent-recipe-8e5c.workers.dev)' };
async function get(url: string, what: string): Promise<unknown> {
  const res = await within(fetch(url, { headers: UA }), 15_000, what);
  if (!res.ok) throw new Error(`${what} ${res.status}`);
  return res.json();
}
export const steamThumb = (appid: number) => `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_231x87.jpg`;

export interface SteamItem {
  appid: number;
  name: string;
  /** 원 (무료면 0, 값을 모르면 null) */
  final: number | null;
  initial: number | null;
  thumb: string;
}
export async function storeSearch(q: string): Promise<SteamItem[]> {
  const j = (await get(`https://store.steampowered.com/api/storesearch/?${new URLSearchParams({ term: q, cc: 'KR', l: 'korean' })}`, 'Steam 찾기')) as { items?: { id?: number; name?: string; type?: string; price?: { initial?: number; final?: number } }[] };
  return (j.items ?? []).filter((x) => x.id && x.name).map((x) => ({ appid: x.id!, name: x.name!, final: x.price ? Math.round((x.price.final ?? 0) / 100) : null, initial: x.price ? Math.round((x.price.initial ?? 0) / 100) : null, thumb: steamThumb(x.id!) }));
}

export interface KrPrice {
  /** 원. 무료면 0 */
  final: number;
  initial: number;
  discount: number;
}
/** 한국 상점 값 (50개씩). 상점에 없거나 못 사는 것은 빠진다 */
export async function krPrices(ids: number[]): Promise<Record<number, KrPrice>> {
  const out: Record<number, KrPrice> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = (await get(`https://store.steampowered.com/api/appdetails?${new URLSearchParams({ appids: ids.slice(i, i + 50).join(','), cc: 'kr', filters: 'price_overview' })}`, 'Steam 값')) as Record<
      string,
      { success?: boolean; data?: { price_overview?: { initial?: number; final?: number; discount_percent?: number } } | unknown[] }
    >;
    for (const [k, v] of Object.entries(j ?? {})) {
      if (!v?.success) continue;
      const po = !Array.isArray(v.data) ? v.data?.price_overview : undefined;
      out[Number(k)] = po ? { final: Math.round((po.final ?? 0) / 100), initial: Math.round((po.initial ?? 0) / 100), discount: po.discount_percent ?? 0 } : { final: 0, initial: 0, discount: 0 };
    }
  }
  return out;
}

export async function wishlist(steamid: string): Promise<{ appid: number; added: number }[]> {
  const j = (await get(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamid}`, 'Steam 찜 목록')) as { response?: { items?: { appid?: number; date_added?: number }[] } };
  return (j.response?.items ?? []).filter((x) => x.appid).map((x) => ({ appid: x.appid!, added: x.date_added ?? 0 }));
}

export interface SteamMe {
  name: string;
  avatar: string;
  owned: { appid: number; name: string; minutes: number; recent: number; last: number }[];
  count: number;
}
export async function steamMe(key: string, steamid: string): Promise<SteamMe> {
  const base = 'https://api.steampowered.com';
  const [sum, owned] = await Promise.all([
    get(`${base}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamid}`, 'Steam 프로필') as Promise<{ response?: { players?: { personaname?: string; avatarfull?: string }[] } }>,
    get(`${base}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`, 'Steam 가진 게임') as Promise<{
      response?: { game_count?: number; games?: { appid?: number; name?: string; playtime_forever?: number; playtime_2weeks?: number; rtime_last_played?: number }[] };
    }>,
  ]);
  const p = sum.response?.players?.[0];
  const games = (owned.response?.games ?? []).filter((g) => g.appid).map((g) => ({ appid: g.appid!, name: g.name ?? '', minutes: g.playtime_forever ?? 0, recent: g.playtime_2weeks ?? 0, last: g.rtime_last_played ?? 0 }));
  return { name: p?.personaname ?? '', avatar: p?.avatarfull ?? '', owned: games.sort((a, b) => b.minutes - a.minutes), count: owned.response?.game_count ?? games.length };
}

export interface SteamAch {
  done: number;
  total: number;
  list: { name: string; desc: string; at: number }[];
  stats: { name: string; value: number }[];
}
export async function steamAchievements(key: string, steamid: string, appid: number): Promise<SteamAch> {
  const base = 'https://api.steampowered.com/ISteamUserStats';
  const a = (await get(`${base}/GetPlayerAchievements/v1/?key=${key}&steamid=${steamid}&appid=${appid}&l=korean`, 'Steam 업적').catch(() => ({}))) as { playerstats?: { achievements?: { achieved?: number; name?: string; description?: string; unlocktime?: number }[] } };
  const s = (await get(`${base}/GetUserStatsForGame/v2/?key=${key}&steamid=${steamid}&appid=${appid}`, 'Steam 게임 기록').catch(() => ({}))) as { playerstats?: { stats?: { name?: string; value?: number }[] } };
  const ach = a.playerstats?.achievements ?? [];
  return {
    done: ach.filter((x) => x.achieved).length,
    total: ach.length,
    list: ach
      .filter((x) => x.achieved)
      .sort((x, y) => (y.unlocktime ?? 0) - (x.unlocktime ?? 0))
      .slice(0, 30)
      .map((x) => ({ name: x.name ?? '', desc: x.description ?? '', at: x.unlocktime ?? 0 })),
    stats: (s.playerstats?.stats ?? []).filter((x) => x.name && typeof x.value === 'number').map((x) => ({ name: x.name!, value: x.value! })),
  };
}

/** 게임 이름 (번호만 있을 때, 한국 상점 기준). IStoreBrowseService/GetItems (키 없음). 한국에서 볼 수 없는 것은 빠진다 */
export async function storeNames(ids: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const input = JSON.stringify({ ids: ids.slice(i, i + 50).map((appid) => ({ appid })), context: { language: 'koreana', country_code: 'KR' }, data_request: {} });
    const j = (await get(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?${new URLSearchParams({ input_json: input })}`, 'Steam 이름')) as { response?: { store_items?: { appid?: number; name?: string; success?: number }[] } };
    for (const x of j.response?.store_items ?? []) if (x.appid && x.name && x.success === 1) out[x.appid] = x.name;
  }
  return out;
}
