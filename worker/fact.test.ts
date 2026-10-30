import { describe, expect, it } from 'vitest';
import { cleanFact } from './fact';

describe('쓸모없는 지식 다듬기', () => {
  it('출처 줄 · 주소를 지운다', () => {
    expect(cleanFact('Honey never spoils.\n\nSource: djtech.net\nhttps://uselessfacts.jsph.pl/abc')).toBe('Honey never spoils.');
    expect(cleanFact('A fact (Source: example.com)')).toBe('A fact');
    expect(cleanFact('  Two\nlines  ')).toBe('Two lines');
  });
});
