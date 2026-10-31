import { describe, expect, it } from 'vitest';
import { cleanFact, goodKo } from './fact';

describe('쓸모없는 지식 다듬기', () => {
  it('출처 줄 · 주소를 지운다', () => {
    expect(cleanFact('Honey never spoils.\n\nSource: djtech.net\nhttps://uselessfacts.jsph.pl/abc')).toBe('Honey never spoils.');
    expect(cleanFact('A fact (Source: example.com)')).toBe('A fact');
    expect(cleanFact('  Two\nlines  ')).toBe('Two lines');
  });
});

describe('실제 응답 모양 (2026-10-30 확인)', () => {
  it('인용 기호 · 백틱 지우기', () => {
    expect(cleanFact('> 10,000 Dutch cows pass through the Amsterdam airport each year.')).toBe('10,000 Dutch cows pass through the Amsterdam airport each year.');
    expect(cleanFact('The `Golden Arches` of fast food chain McDonalds')).toBe('The Golden Arches of fast food chain McDonalds');
  });
});

describe('깨진 번역 거르기', () => {
  it('느낌표만 · 한글 없음은 안 됨', () => {
    expect(goodKo('!!!!!!!!!!!!!!!!')).toBe(false);
    expect(goodKo('Bananas are berries.')).toBe(false);
    expect(goodKo('바나나는 사실 베리 열매예요!!!!!!!!!!')).toBe(false);
    expect(goodKo('바나나는 사실 베리 열매예요.')).toBe(true);
  });
});
