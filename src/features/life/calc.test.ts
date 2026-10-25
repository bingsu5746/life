import { describe, expect, it } from 'vitest';
import { budgetView, daysInMonth, hobbyWeek, monthSummary, readWon, saved, shiftMonth, weeklyMinutes, won, workoutStreak } from './calc';
import { emptyStudy, type SavingGoal, type Workout } from '../study/model';
import { mergeStudy } from '../study/merge';
import { sanitizeCollections } from '../study/sanitize';

describe('돈', () => {
  it('금액 글', () => {
    expect(won(12000)).toBe('12,000원');
    expect(readWon('12,000원')).toBe(12000);
    expect(readWon('1.5')).toBeNull();
    expect(readWon('')).toBeNull();
  });
  it('달 계산', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(daysInMonth('2028-02')).toBe(29);
  });
  it('달 합계·분류·예산', () => {
    const d = emptyStudy();
    d.moneyTx.a = { id: 'a', updatedAt: 1, date: '2026-10-03', type: 'out', amount: 5000, category: '식비', created: 1 };
    d.moneyTx.b = { id: 'b', updatedAt: 1, date: '2026-10-05', type: 'out', amount: 3000, category: '교통', created: 2 };
    d.moneyTx.c = { id: 'c', updatedAt: 1, date: '2026-10-05', type: 'in', amount: 50000, category: '용돈', created: 3 };
    d.moneyTx.e = { id: 'e', updatedAt: 1, date: '2026-09-30', type: 'out', amount: 9999, category: '식비', created: 4 };
    const s = monthSummary(d, '2026-10');
    expect([s.out, s.in]).toEqual([8000, 50000]);
    expect(s.byCategory).toEqual([{ category: '식비', amount: 5000 }, { category: '교통', amount: 3000 }]);
    // 10/25 포함 남은 7일
    expect(budgetView(100000, 8000, '2026-10', '2026-10-25')).toEqual({ left: 92000, perDay: 13142, daysLeft: 7 });
    expect(budgetView(100000, 8000, '2026-09', '2026-10-25').perDay).toBeNull();
  });
  it('모으기: 두 기기에서 넣은 것이 모두 남는다', () => {
    const g: SavingGoal = { id: 'g', updatedAt: 5, name: 'x', target: 100000, deposits: [{ id: '1', date: '2026-10-01', amount: 10000, at: 5 }], created: 1 };
    expect(saved(g)).toBe(10000);
    const a = emptyStudy();
    const b = emptyStudy();
    a.savings.g = g;
    b.savings.g = { ...g, updatedAt: 4, deposits: [{ id: '2', date: '2026-10-02', amount: 5000, at: 6 }] };
    expect(saved(mergeStudy(a, b, 10).savings.g)).toBe(15000);
  });
});

describe('운동·취미', () => {
  const w = (date: string, minutes: number): Workout => ({ id: date + minutes, updatedAt: 1, date, kind: '달리기', minutes, created: 1 });
  it('연속·주별', () => {
    const list = [w('2026-10-25', 30), w('2026-10-24', 20), w('2026-10-23', 40), w('2026-10-20', 10)];
    expect(workoutStreak(list, '2026-10-25')).toBe(3);
    expect(workoutStreak(list, '2026-10-26')).toBe(3);
    expect(weeklyMinutes(list, '2026-10-25', 2)).toEqual([{ start: '2026-10-12', min: 0, count: 0 }, { start: '2026-10-19', min: 100, count: 4 }]);
  });
  it('취미 주별', () => {
    const m = hobbyWeek([{ id: 'a', updatedAt: 1, hobbyId: 'g', date: '2026-10-20', minutes: 30, created: 1 }, { id: 'b', updatedAt: 1, hobbyId: 'g', date: '2026-10-12', minutes: 99, created: 1 }], '2026-10-19');
    expect(m.get('g')).toBe(30);
  });
  it('다듬기', () => {
    const c = sanitizeCollections({
      moneyTx: { a: { id: 'a', updatedAt: 1, date: '2026-10-01', type: 'zz', amount: 10.6, category: 3 }, b: { id: 'b', updatedAt: 1, date: '2026-10-01', amount: -5 } } as never,
      workouts: { w: { id: 'w', updatedAt: 1, date: '2026-10-01', minutes: 99999, effort: 7 } } as never,
      diary: { '2026-10-01': { id: '2026-10-01', updatedAt: 1, text: 'hi', mood: 9 }, x: { id: 'x', updatedAt: 1, text: 'no' } } as never,
      wishes: { k: { id: 'k', updatedAt: 1, kind: 'zz', status: 'done', rating: 6 } } as never,
    });
    expect(c.moneyTx.a).toMatchObject({ type: 'out', amount: 11, category: '기타' });
    expect(c.moneyTx.b).toBeUndefined();
    expect(c.workouts.w).toMatchObject({ kind: '운동', minutes: undefined, effort: undefined });
    expect(Object.keys(c.diary)).toEqual(['2026-10-01']);
    expect(c.diary['2026-10-01']).toMatchObject({ mood: undefined, text: 'hi' });
    expect(c.wishes.k).toMatchObject({ kind: 'other', status: 'done', rating: undefined });
  });
});
