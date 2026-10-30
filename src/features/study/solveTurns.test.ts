import { describe, expect, it } from 'vitest';
import { estimateFrom, turnsOf } from './solveJob';

describe('AI 대화 → 서버에 보낼 대화', () => {
  it('실패한 답을 빼고 이어진 질문은 합친다', () => {
    const t = turnsOf([
      { role: 'user', text: '1번', imgKeys: ['k1'] },
      { role: 'assistant', text: '오류', error: true },
      { role: 'user', text: '다시' },
    ]);
    expect(t).toEqual([{ role: 'user', text: '1번\n\n다시', images: undefined, imgKeys: ['k1'] }]);
  });
  it('마지막 질문 사진만 직접, 그 전 사진은 열쇠만', () => {
    const img = [{ mime: 'image/jpeg', data: 'AAAA' }];
    const t = turnsOf([
      { role: 'user', text: '', images: img, imgKeys: ['k1'] },
      { role: 'assistant', text: '답' },
      { role: 'user', text: '왜요?' },
    ]);
    expect(t[0]).toEqual({ role: 'user', text: '', images: undefined, imgKeys: ['k1'] });
    expect(t[2]).toEqual({ role: 'user', text: '왜요?', images: undefined, imgKeys: undefined });
  });
});

describe('예상 시간', () => {
  it('저장소 기록의 같은 서비스·같은 종류(사진/글) 최근 평균', () => {
    const a = (ms: number, img?: boolean) => ({ role: 'assistant' as const, text: '답', engine: 'mistral', model: 'm1', ms, img });
    const problems = {
      e1: { id: 'e1', title: 't', at: 1, updatedAt: 1, msgs: [{ role: 'user' as const, text: 'q' }, a(10_000), a(30_000, true)] },
      e2: { id: 'e2', title: 't', at: 2, updatedAt: 1, msgs: [{ role: 'user' as const, text: 'q' }, a(20_000)] },
    };
    expect(estimateFrom(problems, 'mistral', false)).toBe(15_000);
    expect(estimateFrom(problems, 'mistral', true)).toBe(30_000);
    expect(estimateFrom(problems, 'groq', false, [8_000])).toBe(8_000);
    expect(estimateFrom(problems, 'groq', false)).toBe(12_000);
  });
});
