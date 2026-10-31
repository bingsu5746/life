import { describe, expect, it } from 'vitest';
import { guessCategory, topCategory } from './moneyGuess';

const CATS = ['식비', '간식·카페', '교통', '쇼핑', '문화·여가', '교육·책', '통신', '선물', '기타'];
describe('돈 분류 짐작', () => {
  it('내 기록이 먼저, 없으면 낱말', () => {
    const d = { moneyTx: { a: { id: 'a', date: '2026-10-01', type: 'out', amount: 3000, category: '식비', memo: '메가커피', created: 1, updatedAt: 1 } } } as never;
    expect(guessCategory(d, '메가커피', 'out', CATS)).toBe('식비');
    expect(guessCategory(d, '스타벅스 라떼', 'out', CATS)).toBe('간식·카페');
    expect(guessCategory(d, '버스', 'out', CATS)).toBe('교통');
    expect(guessCategory(d, '뭔가', 'out', CATS)).toBeNull();
  });
  it('이번 달 가장 많이 쓴 분류', () => {
    const d = {
      moneyTx: {
        a: { id: 'a', date: '2026-10-03', type: 'out', amount: 9000, category: '식비', created: 1, updatedAt: 1 },
        b: { id: 'b', date: '2026-10-04', type: 'out', amount: 2000, category: '교통', created: 1, updatedAt: 1 },
        c: { id: 'c', date: '2026-09-02', type: 'out', amount: 5000, category: '식비', created: 1, updatedAt: 1 },
        e: { id: 'e', date: '2026-09-20', type: 'out', amount: 5000, category: '식비', created: 1, updatedAt: 1 },
      },
    } as never;
    expect(topCategory(d, '2026-10-10')).toEqual({ category: '식비', now: 9000, before: 5000 });
  });
});
