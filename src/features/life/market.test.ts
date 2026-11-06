import { describe, expect, it } from 'vitest';
import { emptyStudy, type StudyData } from '../study/model';
import { creditBand, examSurge, fines, gameUse, loanOwed, marketView, newMarket, priceOf, stockPrices, weeklyPays, won } from './market';
import { sanitizeSettings } from '../study/sanitize';

const ses = (id: string, date: string, minutes: number, subjectId?: string) => ({ id, updatedAt: 1, date, minutes, subjectId, start: 0, end: 0, kind: 'manual' });

describe('시장', () => {
  it('금화 · 은화 글', () => {
    expect(won(0)).toBe('0은화');
    expect(won(250)).toBe('2금화 50은화');
    expect(won(300)).toBe('3금화');
    expect(won(-40)).toBe('−40은화');
  });
  it('버는 것 · 벌금 · 사기', () => {
    const d = emptyStudy() as StudyData;
    // 2026-11-02 월 ~ 11-06 금
    d.sessions = { a: ses('a', '2026-11-02', 90), b: ses('b', '2026-11-03', 30) } as never;
    const m = { ...newMarket('2026-11-02'), buys: [{ id: 'x', itemId: 'game30', name: '게임 30분', kind: 'game' as const, minutes: 30, price: 150, tax: 15, at: Date.parse('2026-11-03T10:00:00+09:00') }] };
    const v = marketView(d, m, '2026-11-05');
    expect(v.income).toBe(120);
    // 11-03 (30분 < 60분) · 11-04 (0분) 벌금
    expect(v.fines.map((f) => f.date)).toEqual(['2026-11-04', '2026-11-03']);
    expect(v.balance).toBe(120 - 100 - 165);
  });
  it('주급: 다 지난 주만, 달성률대로', () => {
    const d = emptyStudy() as StudyData;
    d.sessions = Object.fromEntries(['02', '03', '04', '05', '06'].map((x) => [x, ses(x, `2026-11-${x}`, 360)])) as never;
    const m = newMarket('2026-11-02');
    expect(weeklyPays(d, m, '2026-11-08')).toEqual([]);
    expect(weeklyPays(d, m, '2026-11-09')).toEqual([{ week: '2026-11-02', minutes: 1800, ratio: 1, pay: 500 }]);
  });
  it('게임: 이용권 없이 한 분은 3배', () => {
    const m = { ...newMarket('2026-11-01'), play: { '2026-11-02': 50 }, buys: [{ id: 'x', itemId: 'game30', name: '게임 30분', kind: 'game' as const, minutes: 30, price: 150, tax: 0, at: 1 }] };
    expect(gameUse(m)).toMatchObject({ bought: 30, played: 50, left: 0, raw: 20, charge: 20 * 5 * 3 });
  });
  it('시험이 가까우면 오락 값이 오르고 사치세', () => {
    const d = emptyStudy();
    d.exams = { e: { id: 'e', updatedAt: 1, name: '기말', date: '2026-11-20' } } as never;
    expect(examSurge(d, '2026-11-01').factor).toBe(1);
    expect(examSurge(d, '2026-11-20').factor).toBe(2);
    const m = newMarket('2026-11-01');
    const p = priceOf(m.items[0], m, d, '2026-11-13'); // D-7
    expect(p.price).toBe(Math.round(150 * (1 + 8 / 15)));
    expect(p.tax).toBe(Math.round(p.price * 0.1));
    expect(priceOf({ id: 't', name: '이어폰', kind: 'thing', price: 0, won: 50000 }, m, d, '2026-11-13')).toMatchObject({ price: 1000, tax: 0 });
  });
  it('대출: 기한 넘으면 밀린 주마다 이자', () => {
    const l = { id: 'l', amount: 1000, at: 0, due: '2026-11-10', rate: 0.07, repays: [] };
    expect(loanOwed(l, '2026-11-10')).toMatchObject({ owed: 1070, overdueDays: 0 });
    expect(loanOwed(l, '2026-11-12')).toMatchObject({ owed: 1140, overdueDays: 2 });
    expect(loanOwed({ ...l, repays: [{ at: 1, amount: 1070 }] }, '2026-11-10').closed).toBe(true);
    expect(creditBand(679).mult).toBe(0);
    expect(creditBand(900).mult).toBe(4);
  });
  it('밀린 대출이 있는 날은 벌칙 공부만큼 최소 공부가 늘어난다', () => {
    const d = emptyStudy() as StudyData;
    d.sessions = { a: ses('a', '2026-11-12', 90) } as never;
    const m = { ...newMarket('2026-11-12'), loans: [{ id: 'l', amount: 100, at: 0, due: '2026-11-11', rate: 0.07, repays: [] }] };
    expect(fines(d, m, '2026-11-13')[0].why).toContain('120분 중 90분');
  });
  it('과목 주식: 공부하면 오르고 안 하면 내린다', () => {
    const d = emptyStudy() as StudyData;
    d.subjects = { m: { id: 'm', updatedAt: 1, name: '수학', color: '#000', order: 0 }, e: { id: 'e', updatedAt: 1, name: '영어', color: '#000', order: 1 } };
    d.sessions = { a: ses('a', '2026-11-02', 60, 'm') } as never;
    const p = stockPrices(d, newMarket('2026-11-02'), '2026-11-03');
    expect(p.get('m')!.price).toBe(103); // 11-02: 60분 +3%, 11-03(오늘)은 아직 내리지 않음
    expect(p.get('e')!.price).toBe(Math.round(100 * 0.985)); // 11-02 공부 안 함 −1.5%
  });
  it('설정에 저장 (예전 포인트 시장은 보상 이름만)', () => {
    const old = sanitizeSettings({ market: { since: '2026-11-01', rate: {}, items: [{ id: 'i', name: '게임 30분', icon: '🎮', price: 30 }], buys: [{ id: 'b', name: 'x', price: 3, at: 1 }] } });
    expect(old.market).toMatchObject({ since: '2026-11-01', weeklyTarget: 1800, items: [{ id: 'i', name: '게임 30분', kind: 'game', minutes: 30, price: 150 }], buys: [] });
  });
});
