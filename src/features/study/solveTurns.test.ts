import { describe, expect, it } from 'vitest';
import { turnsOf } from './solveJob';

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
