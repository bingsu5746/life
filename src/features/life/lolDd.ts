// Data Dragon (ddragon.leagueoflegends.com, 키 없음): 챔피언 · 스펠 · 아이템 · 룬 · 챔피언 자세히(스킬 · 팁).
// 한 번 받으면 이 기기에 하루 기억 (버전이 바뀌면 새로)
export const DD = 'https://ddragon.leagueoflegends.com/cdn';
export interface Champ {
  key: number;
  id: string;
  name: string;
  title: string;
  tags: string[];
}
export interface Dd {
  v: string;
  champ: Record<number, Champ>;
  byId: Record<string, string>;
  spell: Record<number, string>;
}
export interface Item {
  name: string;
  gold: number;
  into: boolean;
  boots: boolean;
  plain: string;
}
export interface RuneInfo {
  name: string;
  icon: string;
  style?: number;
}

const memo = new Map<string, Promise<unknown>>();
function cached<T>(key: string, get: () => Promise<T>): Promise<T> {
  const LS = `my-study.lol.${key}`;
  try {
    const c = JSON.parse(localStorage.getItem(LS) ?? 'null') as { at: number; d: T } | null;
    if (c && Date.now() - c.at < 86_400_000) return Promise.resolve(c.d);
  } catch {
    /* 무시 */
  }
  if (!memo.has(key))
    memo.set(
      key,
      get().then((d) => {
        try {
          localStorage.setItem(LS, JSON.stringify({ at: Date.now(), d }));
        } catch {
          /* 가득 차면 기억 안 함 */
        }
        return d;
      }),
    );
  return memo.get(key) as Promise<T>;
}
const getJson = async <T>(url: string) => (await (await fetch(url)).json()) as T;
export const version = () => cached('ver', async () => (await getJson<string[]>('https://ddragon.leagueoflegends.com/api/versions.json'))[0]);

export const loadDd = () =>
  cached('dd2', async (): Promise<Dd> => {
    const v = await version();
    const ch = await getJson<{ data: Record<string, { key: string; id: string; name: string; title: string; tags: string[] }> }>(`${DD}/${v}/data/ko_KR/champion.json`);
    const sp = await getJson<{ data: Record<string, { key: string; id: string }> }>(`${DD}/${v}/data/ko_KR/summoner.json`);
    const d: Dd = { v, champ: {}, byId: {}, spell: {} };
    for (const c of Object.values(ch.data)) {
      d.champ[Number(c.key)] = { key: Number(c.key), id: c.id, name: c.name, title: c.title, tags: c.tags };
      d.byId[c.id] = c.name;
    }
    for (const s of Object.values(sp.data)) d.spell[Number(s.key)] = s.id;
    return d;
  });

export const loadItems = () =>
  cached('items', async (): Promise<Record<number, Item>> => {
    const v = await version();
    const j = await getJson<{ data: Record<string, { name: string; gold: { total: number }; into?: string[]; tags?: string[]; plaintext?: string }> }>(`${DD}/${v}/data/ko_KR/item.json`);
    return Object.fromEntries(Object.entries(j.data).map(([id, x]) => [Number(id), { name: x.name, gold: x.gold.total, into: !!x.into?.length, boots: !!x.tags?.includes('Boots'), plain: x.plaintext ?? '' }]));
  });

export const loadRunes = () =>
  cached('runes', async (): Promise<Record<number, RuneInfo>> => {
    const v = await version();
    const j = await getJson<{ id: number; name: string; icon: string; slots: { runes: { id: number; name: string; icon: string }[] }[] }[]>(`${DD}/${v}/data/ko_KR/runesReforged.json`);
    const out: Record<number, RuneInfo> = {};
    for (const t of j) {
      out[t.id] = { name: t.name, icon: t.icon };
      for (const s of t.slots) for (const r of s.runes) out[r.id] = { name: r.name, icon: r.icon, style: t.id };
    }
    return out;
  });
export const runeImg = (icon: string) => `https://ddragon.leagueoflegends.com/cdn/img/${icon}`;
/** 능력치 파편: Data Dragon 에 그림이 없어서 이름만 (Riot 번호 → 이름) */
export const SHARD: Record<number, string> = { 5008: '적응형 능력치', 5005: '공격 속도', 5007: '스킬 가속', 5002: '방어력', 5003: '마법 저항력', 5001: '체력 증가', 5010: '이동 속도', 5011: '체력', 5013: '강인함 및 둔화 저항' };

export interface ChampDetail {
  lore: string;
  allytips: string[];
  enemytips: string[];
  passive: { name: string; description: string; image: string };
  spells: { id: string; name: string; description: string; cooldownBurn: string; costBurn: string; rangeBurn: string; image: string }[];
  info: { attack: number; defense: number; magic: number; difficulty: number };
}
export const loadChamp = (id: string) =>
  cached(`c.${id}`, async (): Promise<ChampDetail> => {
    const v = await version();
    const j = await getJson<{ data: Record<string, { lore: string; allytips: string[]; enemytips: string[]; info: ChampDetail['info']; passive: { name: string; description: string; image: { full: string } }; spells: { id: string; name: string; description: string; cooldownBurn: string; costBurn: string; rangeBurn: string; image: { full: string } }[] }> }>(`${DD}/${v}/data/ko_KR/champion/${id}.json`);
    const c = j.data[id];
    return { lore: c.lore, allytips: c.allytips, enemytips: c.enemytips, info: c.info, passive: { name: c.passive.name, description: c.passive.description, image: c.passive.image.full }, spells: c.spells.map((s) => ({ id: s.id, name: s.name, description: s.description, cooldownBurn: s.cooldownBurn, costBurn: s.costBurn, rangeBurn: s.rangeBurn, image: s.image.full })) };
  });

export const champImg = (v: string, id: string) => `${DD}/${v}/img/champion/${id}.png`;
/** 스킬 설명의 태그(<br> 등)를 글로 */
export const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

/** 한글 초성 (「ㄱㄹ」로 「가렌」 찾기) */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosung(s: string): string {
  return [...s].map((c) => {
    const code = c.charCodeAt(0) - 0xac00;
    return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c;
  }).join('');
}
export function champMatch(c: Champ, q: string): boolean {
  const n = q.replace(/\s/g, '').toLowerCase();
  if (!n) return true;
  const name = c.name.replace(/\s/g, '');
  return name.includes(n) || c.id.toLowerCase().includes(n) || (/^[ㄱ-ㅎ]+$/.test(n) && chosung(name).includes(n));
}
