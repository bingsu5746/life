import { describe, expect, it } from 'vitest';
import { filmFacets, searchFilms, type Film } from './catalog';

const f = (code: string, title: string, open: string, extra: Partial<Film> = {}): Film => ({ code, title, norm: title.toLowerCase().replace(/\s+/g, ''), title_en: null, open, genre: null, nation: null, director: null, type: '장편', ...extra });
const base = { norm: '', genre: '', nation: '', from: 0, to: 0, type: '', adult: false, offset: 0 };

describe('searchFilms', () => {
  const films = [f('1', '기생충', '20190530', { genre: '드라마', nation: '한국', director: '봉준호' }), f('2', '기생충 2', '20250101'), f('3', '살인의 추억', '20030425', { director: '봉 준호' }), f('4', '어떤 영화', '20100101', { genre: '성인물(에로)' })];
  it('같은 이름이 먼저, 그다음 최근 순', () => {
    expect(searchFilms(films, { ...base, norm: '기생충' }).map((x) => x.code)).toEqual(['1', '2']);
  });
  it('감독 이름으로도 찾는다 (띄어쓰기 무시)', () => {
    expect(searchFilms(films, { ...base, norm: '봉준호' }).map((x) => x.code)).toEqual(['1', '3']);
  });
  it('성인물은 빼고, 조건이 없으면 비운다', () => {
    expect(searchFilms(films, { ...base, from: 2000 }).map((x) => x.code)).toEqual(['2', '1', '3']);
    expect(searchFilms(films, { ...base, adult: true })).toEqual([]);
  });
  it('장르·나라 많은 순', () => {
    expect(filmFacets(films).genres).toEqual(['드라마', '성인물(에로)']);
  });
});
