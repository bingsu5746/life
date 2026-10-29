import { describe, expect, it } from 'vitest';
import { weekLoad } from './weekLoad';

const r = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

describe('weekLoad', () => {
  it('날마다 합치고 몰린 날을 찾는다', () => {
    const w = weekLoad(
      [
        {
          name: 'A',
          today: r(10),
          days: [
            { date: '2026-11-02', items: r(10) },
            { date: '2026-11-03', items: r(10) },
          ],
        },
        { name: 'B', today: [], days: [{ date: '2026-11-03', items: r(20) }] },
      ],
      '2026-11-01',
    );
    expect(w).toHaveLength(7);
    expect(w[0].total).toBe(10);
    expect(w[2]).toMatchObject({ date: '2026-11-03', total: 30, heavy: true });
    expect(w[1].heavy).toBe(false);
    expect(w[2].parts).toEqual([
      { name: 'A', n: 10 },
      { name: 'B', n: 20 },
    ]);
  });
  it('하루뿐이면 몰림 표시 없음', () => {
    expect(weekLoad([{ name: 'A', today: r(50), days: [] }], '2026-11-01').some((x) => x.heavy)).toBe(false);
  });
});
