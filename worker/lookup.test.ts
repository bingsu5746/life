import { describe, expect, it } from 'vitest';
import { parseAladin, parseDiscogs, parseKakaoBooks, parseRawg, parseSimilar } from './lookup';

describe('이름 찾기 응답 읽기', () => {
  it('RAWG · 카카오 · 알라딘 · Discogs · Last.fm', () => {
    expect(parseRawg({ results: [{ name: 'Hades', released: '2020-09-17', platforms: [{ platform: { name: 'PC' } }, { platform: { name: 'Nintendo Switch' } }], background_image: 'x.jpg' }] })).toEqual([{ title: 'Hades', year: 2020, by: 'PC, Nintendo Switch', image: 'x.jpg' }]);
    expect(parseKakaoBooks({ documents: [{ title: '소년이 온다', authors: ['한강'], datetime: '2014-05-19T00:00:00.000+09:00', thumbnail: '', publisher: '창비' }] })).toEqual([{ title: '소년이 온다', by: '한강', year: 2014, image: undefined, extra: '창비' }]);
    expect(parseAladin({ item: [{ title: '채식주의자', author: '한강 (지은이)', pubDate: '2022-03-28', cover: 'c.jpg', publisher: '창비' }] })[0]).toMatchObject({ title: '채식주의자', year: 2022 });
    expect(parseDiscogs({ results: [{ title: 'Miles Davis - Kind Of Blue', year: '1959', format: ['Vinyl', 'LP'], thumb: 't.jpg' }] })).toEqual([{ title: 'Kind Of Blue', by: 'Miles Davis', year: 1959, image: 't.jpg', extra: 'Vinyl · LP' }]);
    expect(parseSimilar({ similarartists: { artist: [{ name: 'John Coltrane' }, { name: '' }] } })).toEqual(['John Coltrane']);
  });
});
