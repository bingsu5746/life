import { describe, expect, it } from 'vitest';
import { parseStdict } from './stdict';

describe('표준국어대사전 응답 읽기', () => {
  it('sense 가 객체든 배열이든', () => {
    expect(
      parseStdict({ channel: { item: [{ word: '나무', pos: '명사', sense: { definition: '줄기나 가지가 목질로 된 여러해살이 식물.', type: '일반어' } }, { word: '나무-^하다', pos: '동사', sense: [{ definition: '땔감을 <b>베거나</b> 주워 모으다.' }] }] } }),
    ).toEqual([
      { word: '나무', pos: '명사', definition: '줄기나 가지가 목질로 된 여러해살이 식물.' },
      { word: '나무하다', pos: '동사', definition: '땔감을 베거나 주워 모으다.' },
    ]);
    expect(parseStdict({})).toEqual([]);
  });
});
