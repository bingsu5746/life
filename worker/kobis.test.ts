import { describe, expect, it } from 'vitest';
import { kDate, kobisFault, parseBoxOffice, parseUpcoming } from './kobis';

describe('KOBIS 응답 읽기', () => {
  it('날짜·오류', () => {
    expect(kDate('20261217')).toBe('2026-12-17');
    expect(kDate('2026-12-17')).toBe('2026-12-17');
    expect(kDate('')).toBeUndefined();
    expect(kobisFault({ faultInfo: { message: '유효하지않은 키값입니다.', errorCode: '320010' } })).toBe('유효하지않은 키값입니다. (320010)');
    expect(kobisFault({ boxOfficeResult: {} })).toBeNull();
  });
  it('박스오피스', () => {
    const j = { boxOfficeResult: { dailyBoxOfficeList: [{ rank: '2', movieNm: 'B', openDt: '2026-10-01', audiAcc: '12345', movieCd: '2' }, { rank: '1', movieNm: 'A', openDt: '2026-10-15', audiAcc: '999', movieCd: '1' }, { rank: '3' }] } };
    expect(parseBoxOffice(j)).toEqual([
      { rank: 1, title: 'A', open: '2026-10-15', audience: 999, code: '1' },
      { rank: 2, title: 'B', open: '2026-10-01', audience: 12345, code: '2' },
    ]);
    expect(parseBoxOffice({})).toBeNull();
  });
  it('개봉 예정: 기간 안 · 장편 · 성인물 빼기', () => {
    const j = {
      movieListResult: {
        totCnt: 4,
        movieList: [
          { movieCd: '1', movieNm: '곧 개봉', movieNmEn: 'Soon', openDt: '20261120', typeNm: '장편', genreAlt: '드라마', nationAlt: '한국', directors: [{ peopleNm: '감독' }] },
          { movieCd: '2', movieNm: '지난 영화', openDt: '20261001', typeNm: '장편' },
          { movieCd: '3', movieNm: '단편', openDt: '20261120', typeNm: '단편' },
          { movieCd: '4', movieNm: '성인', openDt: '20261120', typeNm: '장편', genreAlt: '성인물(에로)' },
        ],
      },
    };
    expect(parseUpcoming(j, '2026-10-25', '2027-01-31')).toEqual([{ code: '1', title: '곧 개봉', titleEn: 'Soon', type: '장편', open: '2026-11-20', genre: '드라마', nation: '한국', director: '감독' }]);
  });
});
