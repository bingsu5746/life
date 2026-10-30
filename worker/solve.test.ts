import { describe, expect, it } from 'vitest';
import { chatMessages, geminiBody, pickGemini, pickOpenRouter, readChat, readGemini } from './solve';

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
