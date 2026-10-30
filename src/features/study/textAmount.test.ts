import { describe, expect, it } from 'vitest';
import { textAmount } from './splitHomework';

describe('textAmount', () => {
  it('범위', () => {
    expect(textAmount('블랙라벨 1~40번')).toEqual({ from: 1, to: 40, unit: '번' });
    expect(textAmount('인강 3-7강')).toEqual({ from: 3, to: 7, unit: '강' });
    expect(textAmount('프린트 12~20p')).toEqual({ from: 12, to: 20, unit: '쪽' });
  });
  it('개수', () => {
    expect(textAmount('쎈 30문제')).toEqual({ from: 1, to: 30, unit: '문제' });
    expect(textAmount('단어 50개 외우기')).toEqual({ from: 1, to: 50, unit: '개' });
  });
  it('분량이 없으면 null', () => {
    expect(textAmount('오답 정리')).toBeNull();
    expect(textAmount('2단원 요약')).toBeNull();
  });
});
