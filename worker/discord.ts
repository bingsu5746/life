// Discord 봇: 부모님과 쓰는 수학 서버의 채널 글 읽기 · 질문 보내기 (REST v10, 봇 토큰)
import { within } from './nba';

const API = 'https://discord.com/api/v10';
/** 채널 보기 · 메시지 보내기 · 링크 · 파일 첨부 · 지난 메시지 읽기 */
export const BOT_PERMS = 1024 + 2048 + 16384 + 32768 + 65536;
const MESSAGE_CONTENT = (1 << 18) | (1 << 19);

async function dc(token: string, path: string, init?: RequestInit): Promise<unknown> {
  const res = await within(fetch(`${API}${path}`, { ...init, headers: { authorization: `Bot ${token}`, 'content-type': 'application/json', 'user-agent': 'DiscordBot (https://life.silent-recipe-8e5c.workers.dev, 1)', ...init?.headers } }), 15_000, 'Discord');
  if (!res.ok) throw new Error(`Discord ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.status === 204 ? null : res.json();
}

/** 토큰 확인: 봇 이름 · 앱 번호 · 초대 링크 · 들어가 있는 서버 · 메시지 내용 읽기 권한 */
export async function discordInfo(token: string) {
  const me = (await dc(token, '/users/@me')) as { id: string; username: string; bot?: boolean };
  const app = (await dc(token, '/oauth2/applications/@me')) as { id: string; name: string; flags?: number };
  const guilds = (await dc(token, '/users/@me/guilds')) as { id: string; name: string }[];
  return {
    bot: me.username,
    appId: app.id,
    contentIntent: ((app.flags ?? 0) & MESSAGE_CONTENT) !== 0,
    invite: `https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot&permissions=${BOT_PERMS}`,
    guilds: guilds.map((g) => ({ id: g.id, name: g.name })),
  };
}

/** 서버의 글 채널 (0 = 글, 5 = 공지, 15 = 포럼) */
export async function discordChannels(token: string, guild: string) {
  const list = (await dc(token, `/guilds/${guild}/channels`)) as { id: string; name: string; type: number; position: number; parent_id?: string | null }[];
  const cats = new Map(list.filter((c) => c.type === 4).map((c) => [c.id, c.name]));
  return list
    .filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, name: c.name, cat: (c.parent_id && cats.get(c.parent_id)) || '' }));
}

export interface DcMsg {
  id: string;
  at: string;
  author: string;
  bot: boolean;
  text: string;
  files: { name: string; url: string; type: string; size: number }[];
  links: string[];
}
/** 채널 최근 메시지 (새 것부터). before 를 주면 그보다 앞의 것 */
export async function discordMessages(token: string, channel: string, before?: string): Promise<DcMsg[]> {
  const q = new URLSearchParams({ limit: '50' });
  if (before) q.set('before', before);
  const list = (await dc(token, `/channels/${channel}/messages?${q}`)) as { id: string; timestamp: string; content: string; author: { username: string; global_name?: string | null; bot?: boolean }; member?: { nick?: string | null }; attachments?: { filename: string; url: string; content_type?: string; size: number }[]; embeds?: { url?: string }[] }[];
  return list.map((m) => ({
    id: m.id,
    at: m.timestamp,
    author: m.member?.nick || m.author.global_name || m.author.username,
    bot: !!m.author.bot,
    text: m.content,
    files: (m.attachments ?? []).map((a) => ({ name: a.filename, url: a.url, type: a.content_type ?? '', size: a.size })),
    links: (m.embeds ?? []).map((e) => e.url ?? '').filter(Boolean),
  }));
}

export async function discordSend(token: string, channel: string, text: string) {
  return dc(token, `/channels/${channel}/messages`, { method: 'POST', body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) });
}
