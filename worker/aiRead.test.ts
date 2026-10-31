import { describe, expect, it } from 'vitest';
import { parseDiary, parseNote } from './aiRead';

describe('aiRead', () => {
  it('문제 사진: 모르는 과목은 null', () => {
    expect(parseNote('{"subject":"수학","number":"12","question":"$x^2=4$ 의 해는?"}', ['수학', '영어'])).toEqual({ subject: '수학', number: '12', question: '$x^2=4$ 의 해는?' });
    expect(parseNote('{"subject":"물리","number":null,"question":null}', ['수학']).subject).toBeNull();
    expect(parseNote('{"subject":null,"number":null,"question":"a\\\\nb"}', []).question).toBe('a\nb');
  });
  it('일기 나누기: 빈 칸 · 모르는 칸은 뺀다', () => {
    expect(parseDiary('```json\n{"good":"농구 이겼다","hard":null,"x":"y","thanks":" "}\n```')).toEqual({ good: '농구 이겼다' });
  });
});

describe('영수증', () => {
  it('금액 · 날짜 · 가게', async () => {
    const { parseReceipt } = await import('./aiRead');
    expect(parseReceipt('{"amount":"12,500원","date":"2026-10-30","store":"메가커피","items":["아메리카노"]}')).toEqual({ amount: 12500, date: '2026-10-30', store: '메가커피', items: ['아메리카노'] });
    expect(parseReceipt('{"amount":null,"date":"어제","store":null,"items":null}')).toEqual({ amount: null, date: null, store: null, items: [] });
  });
});

describe('목차 사진', () => {
  it('쪽이 없거나 이상한 줄은 뺀다', async () => {
    const { parseTocRead } = await import('./aiRead');
    expect(parseTocRead('{"units":[{"name":"1. 집합","from":12,"to":30},{"name":"2. 명제","from":"31","to":null},{"name":"x","from":0},{"name":"3","from":40,"to":20}]}').units).toEqual([
      { name: '1. 집합', from: 12, to: 30 },
      { name: '2. 명제', from: 31, to: null },
    ]);
  });
});
