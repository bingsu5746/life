import { describe, expect, it } from 'vitest';
import { parseStdict } from './stdict';

describe('표준국어대사전 응답 읽기', () => {
  it('sense 가 객체든 배열이든', () => {
    expect(
      parseStdict({
        channel: {
          item: [
            { word: '나무', pos: '명사', sense: { definition: '줄기나 가지가 목질로 된 여러해살이 식물.', type: '일반어' } },
            { word: '나무-^하다', pos: '동사', sense: [{ definition: '땔감을 <b>베거나</b> 주워 모으다.' }] },
          ],
        },
      }),
    ).toEqual([
      { word: '나무', pos: '명사', definition: '줄기나 가지가 목질로 된 여러해살이 식물.' },
      { word: '나무하다', pos: '동사', definition: '땔감을 베거나 주워 모으다.' },
    ]);
    expect(parseStdict({})).toEqual([]);
  });
});

describe('collectExamples', () => {
  it('어디에 있든 example 글을 모은다', async () => {
    const { collectExamples } = await import('./stdict');
    const j = { channel: { item: { word_info: { pos_info: [{ comm_pattern_info: [{ sense_info: [{ definition: '뜻', example_info: [{ example: '그는 <b>밥</b>을 먹었다.' }, { example: '밥이 맛있다.' }] }] }] }] } } } };
    expect(collectExamples(j)).toEqual(['그는 밥을 먹었다.', '밥이 맛있다.']);
    expect(collectExamples({})).toEqual([]);
  });
});
