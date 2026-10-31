import { describe, expect, it } from 'vitest';
import { parseHc } from './homecourt';

describe('parseHc', () => {
  it('차트 화면 숫자', () => {
    const r = parseHc('```json\n{"kind":"chart","when":"Yesterday at 6:58 PM","duration":"17m 36s","make":37,"attempt":86,"paint":null,"mid":null,"three":null,"zones":[]}\n```');
    expect(r).toMatchObject({ kind: 'chart', when: 'Yesterday at 6:58 PM', make: 37, attempt: 86, zones: [] });
  });
  it('구역 화면: 잘못된 칸은 뺀다', () => {
    const r = parseHc('{"kind":"zones","paint":"48%","mid":43,"three":36,"zones":[{"made":11,"att":24},{"made":3,"att":2},{"made":0,"att":0},{"made":"x","att":4}]}');
    expect(r.kind).toBe('zones');
    expect([r.paint, r.mid, r.three]).toEqual([48, 43, 36]);
    expect(r.zones).toEqual([{ made: 11, att: 24 }]);
  });
  it('JSON 이 아니면 other', () => {
    expect(parseHc('모르겠어요').kind).toBe('other');
  });
});
