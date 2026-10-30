// 문제 풀이 AI: Gemini(무료 등급) · OpenRouter 무료 모델 · Cloudflare Workers AI(글만).
// 모델 이름은 자주 바뀌어서 고정하지 않고, 각 서비스의 모델 목록에서 고른다.
export type Engine = 'gemini' | 'openrouter' | 'mistral' | 'groq' | 'siliconflow' | 'nvidia' | 'cloudflare';
export interface SolveImage {
  mime: string;
  data: string;
}
export interface SolveTurn {
  role: 'user' | 'assistant';
  text: string;
  images?: SolveImage[];
}

export const SYSTEM = [
  '너는 한국 고등학생의 시험 문제를 풀어 주는 친절한 선생님이야.',
  '문제(글이나 사진)를 읽고 풀이 과정을 단계별로 한국어로 설명해.',
  '수식은 LaTeX 로 $...$ (줄 수식은 $$...$$) 안에 써.',
  '객관식이면 맨 끝에 「**정답: ③**」처럼, 주관식이면 「**정답: …**」으로 답을 한 줄로 써.',
  '사진이 흐리거나 문제가 잘려서 확실하지 않으면 추측하지 말고 그렇다고 말해.',
].join('\n');

const s = (v: unknown) => (typeof v === 'string' ? v : '');

// ===== Gemini =====

/** 모델 목록에서 글 생성이 되는 Flash(또는 Pro) 모델 고르기 (lite·image·tts·live·audio 는 뺌, 숫자가 큰 판 먼저) */
export function pickGemini(json: unknown, kind: 'flash' | 'pro' = 'flash'): string[] {
  const models = (json as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] })?.models ?? [];
  const ver = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return models
    .map((m) => ({ name: s(m.name).replace(/^models\//, ''), ok: Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent') }))
    .filter((m) => m.ok && (kind === 'pro' ? /^gemini-.*-pro/.test(m.name) : /^gemini-.*flash/.test(m.name)) && !/lite|image|tts|live|audio|thinking-exp|embedding/.test(m.name))
    .sort((a, b) => ver(b.name) - ver(a.name) || Number(/preview|exp/.test(a.name)) - Number(/preview|exp/.test(b.name)) || a.name.length - b.name.length)
    .map((m) => m.name);
}

/**
 * 무료로 돌아가며 쓸 Gemini 모델 순서: Flash(새 판 먼저) → Flash Lite → Gemma 4.
 * 무료 한도는 모델마다 따로라서(AI Studio 비율 제한 화면, 2026-10-30 기준) 하나가 다 되면 다음으로 넘어간다.
 */
export function geminiChain(json: unknown): string[] {
  const models = (json as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] })?.models ?? [];
  const ver = (n: string) => Number(n.match(/(?:gemini|gemma)-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const size = (n: string) => Number(n.match(/(\d+)b/)?.[1] ?? 0);
  const ok = models
    .map((m) => ({ name: s(m.name).replace(/^models\//, ''), gen: Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent') }))
    .filter((m) => m.gen && !/image|tts|live|audio|embedding|native|transcribe|robotics|computer|exp\b|-exp-/.test(m.name));
  const by = (re: RegExp, not?: RegExp) =>
    ok
      .filter((m) => re.test(m.name) && !(not && not.test(m.name)))
      .sort((a, b) => ver(b.name) - ver(a.name) || size(b.name) - size(a.name) || a.name.length - b.name.length)
      .map((m) => m.name);
  return [...by(/^gemini-.*flash/, /lite/), ...by(/^gemini-.*flash-lite/), ...by(/^gemma-4/)];
}

/** 모델 하루 무료 한도 (AI Studio 비율 제한 화면 2026-10-30: Flash 20 · 3.1 이상 Flash Lite 500 · 2.5 Flash Lite 20 · Gemma 4 14,400) */
export function geminiDaily(model: string): number | null {
  if (/^gemma-4/.test(model)) return 14400;
  const v = Number(model.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  if (/flash-lite/.test(model)) return v >= 3.1 ? 500 : 20;
  if (/flash/.test(model)) return 20;
  return null;
}

/** Gemini 하루 한도가 다시 차는 날짜: 태평양 시간 자정 기준 (Google 문서) */
export const pacificDay = (now: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(now));

export function geminiBody(turns: SolveTurn[], model = '') {
  // Gemma 는 시스템 지시를 따로 받지 않아서 첫 질문 앞에 붙인다
  const gemma = model.startsWith('gemma');
  return {
    ...(gemma ? {} : { systemInstruction: { parts: [{ text: SYSTEM }] } }),
    contents: turns.map((t, i) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [...(t.images ?? []).map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })), ...(gemma && i === 0 ? [{ text: SYSTEM }] : []), ...(t.text ? [{ text: t.text }] : [])],
    })),
  };
}

export function readGemini(json: unknown): string {
  const parts = (json as { candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => p.thought !== true)
    .map((p) => s(p.text))
    .join('')
    .trim();
}

const GEM = 'https://generativelanguage.googleapis.com/v1beta';

export async function geminiModels(key: string): Promise<string[]> {
  const res = await fetch(`${GEM}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw new Error(`Gemini 모델 목록 ${res.status}`);
  return geminiChain(await res.json());
}

export async function askGemini(key: string, model: string, turns: SolveTurn[]): Promise<string> {
  const res = await fetch(`${GEM}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(geminiBody(turns, model)) });
  console.log('solve limit headers', 'gemini', JSON.stringify(limitHeaders(res.headers)));
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const em = j?.error?.message ?? '';
  // 429 는 하루 한도(PerDay)일 수도, 분당 한도(PerMinute)일 수도 있다: Google 이 보낸 말로 가른다
  if (res.status === 429) throw new Error(/per ?day|daily|PerDay/i.test(em) ? `Gemini 무료 사용량을 다 썼어요 (${model})` : `잠깐 막혔어요: 분당 횟수 (${model})`);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${em}`.trim());
  const t = readGemini(j);
  if (!t) throw new Error('Gemini 가 답을 주지 않았어요');
  return t;
}

// ===== OpenRouter =====

/** 무료(값 0) 모델 중 고르기. 사진이 있으면 사진을 읽는 모델만. 알려진 큰 모델을 먼저 */
export function pickOpenRouter(json: unknown, needImage: boolean): string[] {
  const data = (json as { data?: { id?: unknown; pricing?: { prompt?: unknown; completion?: unknown }; architecture?: { input_modalities?: unknown } }[] })?.data ?? [];
  const pref = ['deepseek', 'qwen', 'gemini', 'gemma', 'llama', 'mistral', 'nemotron'];
  const rank = (id: string) => {
    const i = pref.findIndex((p) => id.includes(p));
    return i < 0 ? 99 : i;
  };
  return data
    .map((m) => ({ id: s(m.id), free: Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0, image: Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes('image') }))
    .filter((m) => m.id && m.free && (!needImage || m.image))
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((m) => m.id);
}

export function chatMessages(turns: SolveTurn[]) {
  return [
    { role: 'system', content: SYSTEM },
    ...turns.map((t) => (t.images?.length ? { role: t.role, content: [{ type: 'text', text: t.text || '이 문제를 풀어 줘.' }, ...t.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))] } : { role: t.role, content: t.text })),
  ];
}

export function readChat(json: unknown): string {
  const c = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c))
    return c
      .map((p) => s((p as { text?: unknown }).text))
      .join('')
      .trim();
  return '';
}

export async function openRouterModels(): Promise<{ id: string; image: boolean }[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter 모델 목록 ${res.status}`);
  const j = await res.json();
  const img = new Set(pickOpenRouter(j, true));
  return pickOpenRouter(j, false).map((id) => ({ id, image: img.has(id) }));
}

export async function askOpenRouter(key: string, model: string, turns: SolveTurn[], referer: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': referer, 'X-Title': 'Life' },
    body: JSON.stringify({ model, messages: chatMessages(turns) }),
  });
  console.log('solve limit headers', 'openrouter', JSON.stringify(limitHeaders(res.headers)));
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const em = j?.error?.message ?? '';
  if (res.status === 429) throw new Error(/day|daily|per-day|free-models-per-day|credit/i.test(em) ? `OpenRouter 무료 사용량을 다 썼어요 (${em.slice(0, 120)})` : `잠깐 막혔어요: 너무 빨리 보냈어요${em ? ` (${em.slice(0, 120)})` : ''}`);
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${em}`.trim());
  const t = readChat(j);
  if (!t) throw new Error('OpenRouter 모델이 답을 주지 않았어요');
  return t;
}

/** OpenRouter 키 정보: 충전한 적 없으면(is_free_tier) 무료 모델 하루 50번, 있으면 1000번 (OpenRouter 문서) */
export async function openRouterDaily(key: string): Promise<number | null> {
  const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { data?: { is_free_tier?: unknown } } | null;
  return j?.data?.is_free_tier === true ? 50 : j?.data?.is_free_tier === false ? 1000 : null;
}

// ===== OpenAI 모양 API (Mistral · Groq · SiliconFlow · NVIDIA) =====

export const COMPAT: Record<'mistral' | 'groq' | 'siliconflow' | 'nvidia', { bases: string[]; keys: string[]; prefer?: RegExp }> = {
  // 사진 · 표 · 수식 읽기: Pixtral · Mistral Medium 먼저
  mistral: { bases: ['https://api.mistral.ai/v1'], keys: ['Mistral_api_key', 'MISTRAL_KEY'], prefer: /pixtral-large|mistral-medium|magistral-medium|mistral-large/i },
  // Groq (빠른 추론 서버). Cloudflare 에는 「Grok」 이름으로 넣었다
  groq: { bases: ['https://api.groq.com/openai/v1'], keys: ['Grok', 'Groq', 'GROQ_KEY'], prefer: /qwen3|gpt-oss-120b|llama-4|kimi/i },
  // 키는 발급한 곳(국제 .com · 중국 .cn)에서만 된다: 둘 다 해 본다
  siliconflow: { bases: ['https://api.siliconflow.com/v1', 'https://api.siliconflow.cn/v1'], keys: ['Siliconflow', 'SILICONFLOW_KEY'], prefer: /deepseek-r1|qwq|qwen3-235b|qwen3.*thinking|deepseek-v3/i },
  // 가장 큰 모델 먼저 (수백 B · ultra)
  nvidia: { bases: ['https://integrate.api.nvidia.com/v1'], keys: ['Nvidia', 'NVIDIA', 'Nvidia_api_key', 'NVIDIA_KEY'], prefer: /deepseek-r1|qwen3-235b|nemotron.*ultra|405b|253b|kimi-k2|deepseek-v3/i },
};

const VISION = /vl\b|-vl|vision|pixtral|mistral-(small|medium)|gemma-3|llama-4|grok-4|kimi-k2|qwen3\.5|omni/i;
const SMART = /deepseek-(r1|v3)|qwen3|grok-4|magistral|mistral-large|kimi|glm-4\.|nemotron-.*(ultra|super)|gpt-oss|llama-4/i;
const SKIP = /embed|rerank|whisper|tts|audio|image-gen|flux|stable-diffusion|moderation|ocr|guard|reward|coder|instruct-\d+k|safety/i;

/** /models 응답에서 쓸 모델 고르기: 사진이면 사진을 읽는 모델(표시가 없으면 이름으로 짐작), 똑똑한 모델 먼저 */
export function pickCompat(json: unknown, needImage: boolean, prefer?: RegExp): string[] {
  const data = (json as { data?: { id?: unknown; capabilities?: { vision?: unknown; completion_chat?: unknown } }[] })?.data ?? [];
  return data
    .map((m) => ({ id: s(m.id), vision: m.capabilities?.vision === true || (m.capabilities?.vision === undefined && VISION.test(s(m.id))), chat: m.capabilities?.completion_chat !== false }))
    .filter((m) => m.id && m.chat && !SKIP.test(m.id) && (!needImage || m.vision))
    .sort((a, b) => (prefer ? Number(prefer.test(b.id)) - Number(prefer.test(a.id)) : 0) || Number(SMART.test(b.id)) - Number(SMART.test(a.id)) || Number(/latest/.test(b.id)) - Number(/latest/.test(a.id)))
    .map((m) => m.id);
}

/** 응답 머리글에서 남은 요청 수 (서비스마다 이름이 달라서 「remaining」 + 「request」 가 들어간 것) */
export function remainingFrom(h: Headers): number | null {
  let best: number | null = null;
  h.forEach((v, k) => {
    const key = k.toLowerCase();
    // 분·초 단위 한도는 하루 남은 수가 아니라서 뺀다
    if (key.includes('remaining') && key.includes('request') && !/minute|second|-sec|-min/.test(key)) {
      const n = Number(v);
      if (Number.isFinite(n) && (best === null || key.includes('day'))) best = n;
    }
  });
  return best;
}

/** 한도와 관련된 머리글만 (어떤 서비스가 무엇을 보내는지 로그로 확인하려고) */
export function limitHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    if (/ratelimit|remaining|quota|retry-after/i.test(k)) out[k] = v;
  });
  return out;
}

export async function compatModels(base: string, key: string): Promise<unknown> {
  const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`모델 목록 ${res.status}`);
  return res.json();
}

export async function askCompat(base: string, key: string, model: string, turns: SolveTurn[]): Promise<{ text: string; remaining: number | null }> {
  const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: chatMessages(turns), max_tokens: 6000 }) });
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } | string; message?: string } | null;
  const remaining = remainingFrom(res.headers);
  console.log('solve limit headers', base, JSON.stringify(limitHeaders(res.headers)));
  if (!res.ok) {
    const m = typeof j?.error === 'string' ? j.error : (j?.error?.message ?? j?.message ?? '');
    // 429 는 하루 한도일 수도, 잠깐(분·초) 막힌 것일 수도 있어서 서비스 말을 같이 남긴다
    if (res.status === 429) throw new Error(/day|daily|quota|credit|insufficient|balance|month/i.test(m) ? `무료 사용량을 다 썼어요 (${m.slice(0, 120)})` : `잠깐 막혔어요: 너무 빨리 보냈어요${m ? ` (${m.slice(0, 120)})` : ''}`);
    throw new Error(res.status === 402 ? '크레딧이 없어요' : `${res.status}: ${m}`.trim());
  }
  const text = readChat(j);
  if (!text) throw new Error('답이 비어 있어요');
  return { text, remaining };
}
