import { describe, expect, it } from 'vitest';
import { R2_STOP, r2Block, rollMonth } from './r2guard';

describe('R2 한도 지키기', () => {
  const u = { bytes: 0, month: '2026-10', a: 0, b: 0 };
  it('90% 를 넘기려 하면 막는다', () => {
    expect(r2Block(u, 'put', 1000)).toBeNull();
    expect(r2Block({ ...u, bytes: R2_STOP.bytes - 10 }, 'put', 100)).toMatch(/저장 공간/);
    expect(r2Block({ ...u, a: R2_STOP.a }, 'put', 1)).toMatch(/올리기/);
    expect(r2Block({ ...u, b: R2_STOP.b }, 'get')).toMatch(/보기/);
  });
  it('달이 바뀌면 작업 수만 0으로', () => {
    expect(rollMonth({ bytes: 5, month: '2026-09', a: 9, b: 9 }, Date.parse('2026-10-02T00:00:00Z'))).toEqual({ bytes: 5, month: '2026-10', a: 0, b: 0 });
  });
});
