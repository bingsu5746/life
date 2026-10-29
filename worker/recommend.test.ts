import { describe, expect, it } from 'vitest';
import { pickMovie, pickProviders } from './ott';
import { readRecommendations, readRecommendRequest } from './recommend';

describe('영화 추천 답 읽기', () => {
  it('JSON 배열을 읽고 이상한 항목은 버린다', () => {
    const out = { response: '```json\n[{"title":"존 윅","year":2014,"reason":"액션"},{"year":2000},{"title":"기생충","year":"x","reason":"x"}]\n```' };
    expect(readRecommendations(out)).toEqual([
      { title: '존 윅', year: 2014, reason: '액션' },
      { title: '기생충', year: undefined, reason: 'x' },
    ]);
    expect(readRecommendations({ response: '추천할 영화가 없어요' })).toEqual([]);
  });
  it('별점도 소원도 없으면 오류', () => {
    expect('error' in readRecommendRequest({})).toBe(true);
    expect('error' in readRecommendRequest({ wish: '잔잔한 영화' })).toBe(false);
  });
});

describe('TMDB 읽기', () => {
  it('연도가 맞는 영화를 고르고 한국 구독 서비스만', () => {
    expect(pickMovie({ results: [{ id: 1, release_date: '1999-01-01' }, { id: 2, release_date: '2014-10-24' }] }, 2014)).toBe(2);
    expect(pickMovie({ results: [] }, 2014)).toBeUndefined();
    expect(pickProviders({ results: { KR: { flatrate: [{ provider_name: 'Netflix' }, { provider_name: 'Apple TV Plus' }], rent: [{ provider_name: 'x' }] }, US: { flatrate: [{ provider_name: 'US' }] } } })).toEqual(['Netflix', 'Apple TV Plus']);
  });
});
