import { describe, expect, it } from 'vitest';
import { champMatch, chosung, plain } from './lolDd';

describe('롤 Data Dragon 도우미', () => {
  it('초성 검색', () => {
    expect(chosung('가렌')).toBe('ㄱㄹ');
    const c = { key: 86, id: 'Garen', name: '가렌', title: '', tags: [] };
    expect(champMatch(c, 'ㄱㄹ')).toBe(true);
    expect(champMatch(c, '가')).toBe(true);
    expect(champMatch(c, 'gar')).toBe(true);
    expect(champMatch(c, 'ㄴ')).toBe(false);
  });
  it('스킬 설명 태그 빼기', () => {
    expect(plain('적에게 <magicDamage>50</magicDamage> 피해<br><br>둔화')).toBe('적에게 50 피해\n\n둔화');
  });
});
