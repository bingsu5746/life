// 문제 풀이 AI: Gemini(무료 등급) · OpenRouter 무료 모델 · Cloudflare Workers AI(글만).
// 모델 이름은 자주 바뀌어서 고정하지 않고, 각 서비스의 모델 목록에서 고른다.
export type Engine = 'gemini' | 'openrouter' | 'cloudflare';
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

/** 모델 목록에서 글 생성이 되는 Flash 모델 고르기 (lite·image·tts·live·audio 는 뺌, 숫자가 큰 판 먼저) */
export function pickGemini(json: unknown): string[] {
  const models = (json as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] })?.models ?? [];
  const ver = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return models
    .map((m) => ({ name: s(m.name).replace(/^models\//, ''), ok: Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent') }))
    .filter((m) => m.ok && /^gemini-.*flash/.test(m.name) && !/lite|image|tts|live|audio|thinking-exp|embedding/.test(m.name))
    .sort((a, b) => ver(b.name) - ver(a.name) || Number(/preview|exp/.test(a.name)) - Number(/preview|exp/.test(b.name)) || a.name.length - b.name.length)
    .map((m) => m.name);
}

export function geminiBody(turns: SolveTurn[]) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: turns.map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [...(t.images ?? []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } })), ...(t.text ? [{ text: t.text }] : [])],
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
  return pickGemini(await res.json());
}

export async function askGemini(key: string, model: string, turns: SolveTurn[]): Promise<string> {
  const res = await fetch(`${GEM}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(geminiBody(turns)) });
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(res.status === 429 ? 'Gemini 무료 사용량을 다 썼어요' : `Gemini ${res.status}: ${j?.error?.message ?? ''}`.trim());
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
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(res.status === 429 ? 'OpenRouter 무료 사용량을 다 썼어요' : `OpenRouter ${res.status}: ${j?.error?.message ?? ''}`.trim());
  const t = readChat(j);
  if (!t) throw new Error('OpenRouter 모델이 답을 주지 않았어요');
  return t;
}
