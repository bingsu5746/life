// 표준국어대사전 (국립국어원) 낱말 뜻. 키는 비밀값 STDICT_KEY (Cloudflare 에 「Onyongu」 로 넣은 것도 받는다).
const BASE = 'https://stdict.korean.go.kr/api/search.do';

export interface KoSense {
  word: string;
  pos?: string;
  definition: string;
  /** 표제어 번호 (자세히 볼 때) */
  code?: string;
  /** 쓰임 예문 */
  examples?: string[];
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
      const code = typeof it.target_code === 'string' || typeof it.target_code === 'number' ? String(it.target_code) : undefined;
      if (word && def) out.push({ word, pos: typeof it.pos === 'string' && it.pos.trim() ? it.pos.trim() : undefined, definition: def, code });
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

/**
 * 자세히 보기(view.do) 응답에서 예문 모으기. 응답 모양을 공식 문서로 확인하지 못해서,
 * 어디에 있든 「example」 이름의 글을 찾아 모은다 (없으면 빈 목록)
 */
export function collectExamples(j: unknown, max = 6): string[] {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (out.length >= max || depth > 24 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'example' && typeof x === 'string') {
        const t = x.replace(/<[^>]+>/g, '').trim();
        if (t && !out.includes(t) && out.length < max) out.push(t);
      } else walk(x, depth + 1);
    }
  };
  walk(j, 0);
  return out;
}

export async function koExamples(key: string, code: string): Promise<string[]> {
  const url = `https://stdict.korean.go.kr/api/view.do?${new URLSearchParams({ key, method: 'target_code', q: code, req_type: 'json' })}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return [];
  try {
    return collectExamples(JSON.parse(await res.text()));
  } catch {
    return [];
  }
}
