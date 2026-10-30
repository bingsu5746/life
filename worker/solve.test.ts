import { describe, expect, it } from 'vitest';
import { chatMessages, geminiBody, geminiChain, geminiDaily, pickGemini, pickCompat, pickOpenRouter, readChat, readGemini, retryAfter } from './solve';

describe('solve', () => {
  it('Gemini Flash 모델 고르기', () => {
    const j = {
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemini-3.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    };
    expect(pickGemini(j)).toEqual(['gemini-3.5-flash', 'gemini-2.5-flash']);
    expect(pickGemini(j, 'pro')).toEqual(['gemini-3.5-pro']);
  });
  it('Gemini 요청 · 답', () => {
    const b = geminiBody([{ role: 'user', text: '풀어 줘', images: [{ mime: 'image/jpeg', data: 'AAA' }] }]);
    expect(b.contents[0]).toEqual({ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAA' } }, { text: '풀어 줘' }] });
    expect(readGemini({ candidates: [{ content: { parts: [{ text: '생각', thought: true }, { text: '답 ' }, { text: '③' }] } }] })).toBe('답 ③');
  });
  it('OpenRouter 무료 모델 고르기', () => {
    const j = {
      data: [
        { id: 'x/paid', pricing: { prompt: '0.000001', completion: '0.000002' }, architecture: { input_modalities: ['text', 'image'] } },
        { id: 'meta-llama/llama-4:free', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'] } },
        { id: 'deepseek/deepseek-r1:free', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text'] } },
      ],
    };
    expect(pickOpenRouter(j, false)).toEqual(['deepseek/deepseek-r1:free', 'meta-llama/llama-4:free']);
    expect(pickOpenRouter(j, true)).toEqual(['meta-llama/llama-4:free']);
  });
  it('OpenAI 모양 대화 · 답', () => {
    const m = chatMessages([{ role: 'user', text: '', images: [{ mime: 'image/png', data: 'B' }] }]);
    expect(m[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '이 문제를 풀어 줘.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,B' } },
      ],
    });
    expect(readChat({ choices: [{ message: { content: ' 정답 ' } }] })).toBe('정답');
  });
});

describe('OpenAI 모양 API', () => {
  it('모델 고르기: 사진이면 사진 모델, 똑똑한 모델 먼저, 임베딩 등은 뺀다', async () => {
    const { pickCompat } = await import('./solve');
    const j = { data: [{ id: 'mistral-embed' }, { id: 'open-mistral-7b' }, { id: 'mistral-large-latest' }, { id: 'pixtral-12b', capabilities: { vision: true, completion_chat: true } }, { id: 'Qwen/Qwen2.5-VL-72B-Instruct' }] };
    expect(pickCompat(j, false).slice(0, 1)).toEqual(['mistral-large-latest']);
    expect(pickCompat(j, false)).not.toContain('mistral-embed');
    expect(pickCompat(j, true).sort()).toEqual(['Qwen/Qwen2.5-VL-72B-Instruct', 'pixtral-12b']);
  });
  it('남은 요청 수 머리글', async () => {
    const { remainingFrom } = await import('./solve');
    expect(remainingFrom(new Headers({ 'x-ratelimit-remaining-requests': '17' }))).toBe(17);
    expect(remainingFrom(new Headers({ 'x-ratelimit-remaining-requests-minute': '3', 'x-ratelimit-remaining-requests-day': '120' }))).toBe(120);
    expect(remainingFrom(new Headers({ 'x-ratelimit-remaining-requests-minute': '3' }))).toBeNull();
    expect(remainingFrom(new Headers({}))).toBeNull();
  });
});

describe('Gemini 무료 모델 돌려 쓰기', () => {
  const j = {
    models: ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-it', 'gemini-3.1-pro', 'gemini-3.8-flash-tts', 'gemini-3.5-flash-preview-x'].map((n) => ({
      name: `models/${n}`,
      supportedGenerationMethods: ['generateContent'],
    })),
  };
  it('Flash 새 판 → Flash Lite → Gemma 4 큰 것', () => {
    expect(geminiChain(j)).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-preview-x', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-it']);
    // 이름이 모두 -preview 여도 고른다
    expect(geminiChain({ models: [{ name: 'models/gemini-3.8-flash-preview', supportedGenerationMethods: ['generateContent'] }] })).toEqual(['gemini-3.8-flash-preview']);
  });
  it('하루 한도', () => {
    expect([geminiDaily('gemini-3.8-flash'), geminiDaily('gemini-3.5-flash-lite'), geminiDaily('gemini-2.5-flash-lite'), geminiDaily('gemma-4-31b-it')]).toEqual([20, 500, 20, 14400]);
  });
  it('Gemma 는 시스템 지시를 첫 질문에 붙인다', () => {
    const b = geminiBody([{ role: 'user', text: '풀어 줘' }], 'gemma-4-31b-it') as { systemInstruction?: unknown; contents: { parts: { text?: string }[] }[] };
    expect(b.systemInstruction).toBeUndefined();
    expect(b.contents[0].parts[1]).toEqual({ text: '풀어 줘' });
  });
});

describe('사진 모델 순서', () => {
  it('Thinking 판은 뒤로', async () => {
    const { pickCompat } = await import('./solve');
    const j = { data: [{ id: 'Qwen/Qwen3-VL-32B-Thinking' }, { id: 'Qwen/Qwen3-VL-32B-Instruct' }] };
    expect(pickCompat(j, true)).toEqual(['Qwen/Qwen3-VL-32B-Instruct', 'Qwen/Qwen3-VL-32B-Thinking']);
  });
});

describe('코드 전용 모델 · retry-after', () => {
  it('코드 전용 모델은 고르지 않는다', () => {
    expect(pickCompat({ data: [{ id: 'moonshotai/Kimi-K2.7-Code' }, { id: 'Qwen/Qwen3-VL-32B' }] }, true)).toEqual(['Qwen/Qwen3-VL-32B']);
  });
  it('retry-after 를 초로 읽는다', () => {
    expect(retryAfter(new Headers({ 'retry-after': '7' }))).toBe(7);
    expect(retryAfter(new Headers())).toBeNull();
  });
});

describe('Mistral 모델 고르기', () => {
  it('분당 토큰이 많은 large-2512 를 맨 먼저 · 같은 모델 묶음', async () => {
    const { COMPAT, modelFamily } = await import('./solve');
    const json = { data: [{ id: 'mistral-medium-latest', capabilities: { vision: true } }, { id: 'mistral-large-4', capabilities: { vision: true } }, { id: 'mistral-large-2512', capabilities: { vision: true } }] };
    expect(pickCompat(json, true, COMPAT.mistral.prefer, COMPAT.mistral.first)[0]).toBe('mistral-large-2512');
    expect(modelFamily('mistral-medium-latest')).toBe(modelFamily('mistral-medium-3-5'));
    expect(modelFamily('mistral-large-4')).not.toBe(modelFamily('mistral-medium-latest'));
    expect(modelFamily('mistral-large-4')).toBe(modelFamily('mistral-large-4-0'));
    expect(modelFamily('mistral-large-2512')).not.toBe(modelFamily('mistral-large-4'));
  });
});
