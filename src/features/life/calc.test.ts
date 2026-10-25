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

describe('고정 지출·수입', () => {
  it('매달·매주·매일·매년 날짜', async () => {
    const { ruleDates, dueRuleTx, ruleTxId, monthlyAmount } = await import('./calc');
    const base = { id: 'r', updatedAt: 1, name: '넷플릭스', type: 'out' as const, amount: 13500, category: '문화·여가', created: 1 };
    expect(ruleDates({ ...base, freq: 'monthly', day: 31, start: '2026-01-01' }, '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(ruleDates({ ...base, freq: 'weekly', day: 1, start: '2026-10-01' }, '2026-10-19', '2026-10-31')).toEqual(['2026-10-19', '2026-10-26']);
    expect(ruleDates({ ...base, freq: 'daily', start: '2026-10-24', end: '2026-10-25' }, '2026-10-20', '2026-10-31')).toEqual(['2026-10-24', '2026-10-25']);
    expect(ruleDates({ ...base, freq: 'yearly', start: '2024-02-29' }, '2026-01-01', '2026-12-31')).toEqual(['2026-02-28']);
    expect(monthlyAmount({ ...base, freq: 'weekly', start: '2026-01-01' })).toBe(58500);
    const d = emptyStudy();
    d.moneyRules.r = { ...base, freq: 'monthly', day: 5, start: '2026-09-01' };
    const due = dueRuleTx(d, '2026-10-25', 7);
    expect(due.map((t) => t.date)).toEqual(['2026-09-05', '2026-10-05']);
    expect(due[0]).toMatchObject({ id: ruleTxId('r', '2026-09-05'), amount: 13500, memo: '넷플릭스', ruleId: 'r' });
    // 이미 있거나 지운 것은 다시 만들지 않는다
    d.moneyTx[due[0].id] = { ...due[0], updatedAt: 2, deleted: true };
    expect(dueRuleTx(d, '2026-10-25').map((t) => t.date)).toEqual(['2026-10-05']);
    d.moneyRules.r = { ...d.moneyRules.r, paused: true };
    expect(dueRuleTx(d, '2026-10-25')).toEqual([]);
  });
});

describe('농구·영화', () => {
  it('합계·득점 계산·별점 글', async () => {
    const { bbTotals, ptsFromShots } = await import('./Basketball');
    const { starText } = await import('./Movies');
    expect(ptsFromShots({ mode: 'game', fgm: 4, tpm: 2, ftm: 3 })).toBe(17);
    expect(bbTotals([{ mode: 'game', fgm: 2, fga: 5 }, { mode: 'practice', fgm: 10, fga: 20, tpm: 3, tpa: 10 }])).toMatchObject({ fgm: 12, fga: 25, tpm: 3, tpa: 10 });
    expect(starText(3.5)).toBe('★★★½☆');
    expect(starText(5)).toBe('★★★★★');
    expect(starText(0.5)).toBe('½☆☆☆☆');
  });
});
