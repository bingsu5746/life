// 세계 뉴스: The Guardian Open Platform (비밀값 guardian) → 제목 · 요약을 한국어로 (Workers AI)
export interface NewsItem {
  id: string;
  title: string;
  trail: string;
  url: string;
  section: string;
  at: string;
  thumb?: string;
  /** 한국어 */
  ko?: { title: string; trail: string };
}

export const NEWS_SECTIONS = ['all', 'world', 'business', 'technology', 'science', 'sport', 'environment', 'culture'] as const;
export type NewsSection = (typeof NEWS_SECTIONS)[number];

export const guardianUrl = (key: string, section: NewsSection, size = 15) => {
  const q = new URLSearchParams({ 'order-by': 'newest', 'page-size': String(size), 'show-fields': 'trailText,thumbnail', 'api-key': key });
  if (section !== 'all') q.set('section', section);
  return `https://content.guardianapis.com/search?${q}`;
};

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

export function parseGuardian(j: unknown): NewsItem[] {
  const r = (j as { response?: { results?: unknown[] } })?.response?.results;
  if (!Array.isArray(r)) return [];
  return r
    .map((x) => x as { id?: unknown; webTitle?: unknown; webUrl?: unknown; sectionName?: unknown; webPublicationDate?: unknown; fields?: { trailText?: unknown; thumbnail?: unknown } })
    .filter((x) => typeof x.id === 'string' && typeof x.webTitle === 'string' && typeof x.webUrl === 'string' && /^https:\/\/www\.theguardian\.com\//.test(x.webUrl))
    .map((x) => ({
      id: x.id as string,
      title: strip(x.webTitle as string).slice(0, 200),
      trail: typeof x.fields?.trailText === 'string' ? strip(x.fields.trailText).slice(0, 400) : '',
      url: x.webUrl as string,
      section: typeof x.sectionName === 'string' ? x.sectionName.slice(0, 40) : '',
      at: typeof x.webPublicationDate === 'string' ? x.webPublicationDate : '',
      thumb: typeof x.fields?.thumbnail === 'string' && /^https:\/\/media\.guim\.co\.uk\//.test(x.fields.thumbnail) ? x.fields.thumbnail : undefined,
    }));
}

/** 제목 · 요약을 한꺼번에 번역: 번호를 붙여 보내고 같은 번호로 받는다 */
export function buildNewsTranslate(items: NewsItem[]) {
  const lines = items.flatMap((x, i) => [`${i + 1}T: ${x.title}`, `${i + 1}S: ${x.trail || '-'}`]);
  return {
    messages: [
      {
        role: 'system',
        content:
          'Translate English news headlines (T) and summaries (S) into natural Korean news style. ' +
          'Be faithful: do not add or omit facts; keep names, numbers and places (write well-known names in their usual Korean spelling). ' +
          'Headlines: short Korean headline style. Summaries: one or two sentences in "-다" 체. ' +
          'Reply ONLY with the same numbered lines in the same order, like "1T: …" and "1S: …". If a summary is "-", reply "-".',
      },
      { role: 'user', content: lines.join('\n') },
    ],
    max: Math.min(6000, 400 + lines.join('\n').length * 3),
  };
}

export function readNewsTranslate(text: string, n: number): ({ title: string; trail: string } | null)[] {
  const out: ({ title: string; trail: string } | null)[] = Array.from({ length: n }, () => null);
  const t: Record<number, string> = {};
  const s: Record<number, string> = {};
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d{1,2})\s*([TS])\s*[:：]\s*(.*)$/);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    if (i < 0 || i >= n) continue;
    (m[2] === 'T' ? t : s)[i] = m[3].trim();
  }
  for (let i = 0; i < n; i++) if (t[i]) out[i] = { title: t[i].slice(0, 200), trail: s[i] && s[i] !== '-' ? s[i].slice(0, 400) : '' };
  return out;
}
