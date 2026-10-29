// 표준국어대사전 (국립국어원) 낱말 뜻. 키는 비밀값 STDICT_KEY (Cloudflare 에 「Onyongu」 로 넣은 것도 받는다).
const BASE = 'https://stdict.korean.go.kr/api/search.do';

export interface KoSense {
  word: string;
  pos?: string;
  definition: string;
}

/** 응답 → 뜻 목록. 결과가 없으면 빈 목록 (sense 가 하나면 객체, 여럿이면 배열로 올 수 있다) */
export function parseStdict(j: unknown): KoSense[] {
  const items = (j as { channel?: { item?: unknown } })?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const out: KoSense[] = [];
  for (const it of list as Record<string, unknown>[]) {
    const word = typeof it.word === 'string' ? it.word.replace(/[-^]/g, '').trim() : '';
    const senses = Array.isArray(it.sense) ? it.sense : it.sense ? [it.sense] : [];
    for (const s of senses as Record<string, unknown>[]) {
      const def = typeof s.definition === 'string' ? s.definition.replace(/<[^>]+>/g, '').trim() : '';
      if (word && def) out.push({ word, pos: typeof it.pos === 'string' && it.pos.trim() ? it.pos.trim() : undefined, definition: def });
    }
  }
  return out.slice(0, 8);
}

export async function lookupKo(key: string, q: string): Promise<KoSense[]> {
  const url = `${BASE}?${new URLSearchParams({ key, q, req_type: 'json', type_search: 'search', num: '10' })}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`사전 응답 ${res.status}`);
  const text = await res.text();
  // 결과가 없으면 빈 본문이나 빈 객체가 올 수 있다
  if (!text.trim()) return [];
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('사전 응답을 읽지 못했어요');
  }
  const err = (j as { error?: { message?: string; error_code?: string } })?.error;
  if (err) throw new Error(`사전: ${err.message ?? err.error_code ?? '오류'}`);
  return parseStdict(j);
}
