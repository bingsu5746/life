import { describe, expect, it } from 'vitest';
import { emptyStudy, type StudyData } from '../study/model';
import { addDays } from '../study/dates';
import { companyName, creditBand, tickerOf, examSurge, fines, gameUse, loanOwed, marketView, newMarket, priceOf, stockPrices, weeklyPays, won } from './market';
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
    expect(weeklyPays(d, m, '2026-11-09')).toEqual([{ week: '2026-11-02', minutes: 1800, ratio: 1, pay: 500, streak: 1 }]);
  });
  it('게임: 이용권 없이 한 분은 3배', () => {
    const at = Date.parse('2026-11-01T10:00:00+09:00');
    const m = { ...newMarket('2026-11-01'), play: { '2026-11-02': 50 }, buys: [{ id: 'x', itemId: 'game30', name: '게임 30분', kind: 'game' as const, minutes: 30, price: 225, tax: 0, at }] };
    expect(gameUse(m, '2026-11-03')).toMatchObject({ bought: 30, played: 50, left: 0, raw: 20, charge: Math.round(20 * 7.5 * 3), sameDay: [] });
    // 산 날 바로 쓰면 이용권 값의 절반 벌금
    const same = { ...m, play: { '2026-11-01': 30 } };
    expect(gameUse(same, '2026-11-02').sameDay).toEqual([{ date: '2026-11-01', why: '산 날 바로 쓴 게임 이용권 30분', amount: 113 }]);
    // 기한(7일)이 지난 이용권은 못 씀
    const late = { ...m, play: { '2026-11-09': 30 } };
    expect(gameUse(late, '2026-11-10')).toMatchObject({ raw: 30, left: 0, expired: 30 });
  });
  it('시험이 가까우면 오락 값이 오르고 사치세', () => {
    const d = emptyStudy();
    d.exams = { e: { id: 'e', updatedAt: 1, name: '기말', date: '2026-11-20' } } as never;
    expect(examSurge(d, '2026-11-01').factor).toBe(1);
    expect(examSurge(d, '2026-11-20').factor).toBe(2);
    const m = newMarket('2026-11-01');
    const p = priceOf(m.items[0], m, d, '2026-11-13'); // D-7
    expect(Math.abs(p.price - 225 * (1 + 8 / 15))).toBeLessThanOrEqual(1);
    expect(p.tax).toBe(Math.round(p.price * 0.1));
    expect(priceOf({ id: 't', name: '이어폰', kind: 'thing', price: 0, won: 50000 }, m, d, '2026-11-13')).toMatchObject({ price: 1500, tax: 0 });
  });
  it('대출: 기한 넘으면 밀린 주마다 이자', () => {
    const l = { id: 'l', amount: 1000, at: Date.parse('2026-11-03T12:00:00+09:00'), due: '2026-11-10', rate: 0.07, repays: [] };
    expect(loanOwed(l, '2026-11-04')).toMatchObject({ owed: 1010 }); // 하루 1%
    expect(loanOwed(l, '2026-11-10')).toMatchObject({ owed: 1070, overdueDays: 0 });
    expect(loanOwed(l, '2026-11-12')).toMatchObject({ owed: 1110, overdueDays: 2 }); // 밀린 날은 2배
    expect(loanOwed({ ...l, repays: [{ at: Date.parse('2026-11-10T12:00:00+09:00'), amount: 1070 }] }, '2026-11-20').closed).toBe(true);
    expect(creditBand(679).mult).toBe(0);
    expect(creditBand(900).mult).toBe(4);
  });
  it('밀린 대출이 있는 날은 벌칙 공부만큼 최소 공부가 늘어난다', () => {
    const d = emptyStudy() as StudyData;
    d.sessions = { a: ses('a', '2026-11-12', 90) } as never;
    const m = { ...newMarket('2026-11-12'), loans: [{ id: 'l', amount: 100, at: Date.parse('2026-11-04T12:00:00+09:00'), due: '2026-11-11', rate: 0.07, repays: [] }] };
    expect(fines(d, m, '2026-11-13')[0].why).toContain('120분 중 90분');
  });
  it('과목 주식: 무작위지만 기기마다 같고, 그 과목 공부를 하면 호재가 더 자주 뜬다', () => {
    const d = emptyStudy() as StudyData;
    const subjects: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) subjects[`s${i}`] = { id: `s${i}`, updatedAt: 1, name: i % 2 ? '영어' : '수학', color: '#000', order: i };
    d.subjects = subjects as never;
    const days = Array.from({ length: 60 }, (_, i) => addDays('2026-09-01', i));
    // 짝수 과목만 날마다 2시간 공부
    d.sessions = Object.fromEntries(days.flatMap((day) => Array.from({ length: 10 }, (_, i) => [`${day}${i}`, ses(`${day}${i}`, day, 120, `s${i * 2}`)]))) as never;
    const m = newMarket('2026-09-01');
    const a = stockPrices(d, m, '2026-10-31');
    expect(stockPrices(d, m, '2026-10-31').get('s0')).toEqual(a.get('s0'));
    let goodStudy = 0, goodIdle = 0, badStudy = 0, badIdle = 0;
    for (const [id, p] of a) {
      const even = Number(id.slice(1)) % 2 === 0;
      for (const e of p.events) {
        expect(Math.abs(e.pct)).toBeGreaterThanOrEqual(0.05);
        expect(Math.abs(e.pct)).toBeLessThanOrEqual(0.12);
        if (e.pct > 0) even ? goodStudy++ : goodIdle++;
        else even ? badStudy++ : badIdle++;
      }
      expect(p.price).toBeGreaterThanOrEqual(10);
    }
    expect(goodStudy).toBeGreaterThan(goodIdle * 2);
    expect(badIdle).toBeGreaterThan(badStudy * 2);
  });
  it('회사 이름 · 종목 번호', () => {
    expect(companyName('수학', 'a')).toBe('수학전자');
    expect(companyName('영어', 'a')).toBe('영어항공');
    expect(companyName('국어', 'x')).toMatch(/^국어/);
    expect(tickerOf('a')).toMatch(/^\d{6}$/);
  });
  it('설정에 저장 (예전 포인트 시장은 보상 이름만)', () => {
    const old = sanitizeSettings({ market: { since: '2026-11-01', rate: {}, items: [{ id: 'i', name: '게임 30분', icon: '🎮', price: 30 }], buys: [{ id: 'b', name: 'x', price: 3, at: 1 }] } });
    expect(old.market).toMatchObject({ since: '2026-11-01', weeklyTarget: 1800, items: [{ id: 'i', name: '게임 30분', kind: 'game', minutes: 30, price: 225 }], buys: [], priceV: 2, wonPerGold: 3333 });
    // 예전 판(priceV 없음) 값은 한 번만 1.5배
    const v1 = sanitizeSettings({ market: { since: '2026-11-01', weeklyTarget: 1800, wonPerGold: 5000, items: [{ id: 'g', name: '게임', kind: 'game', minutes: 30, price: 200 }] } });
    expect(v1.market).toMatchObject({ wonPerGold: 3333, priceV: 2, items: [{ price: 300 }] });
    expect(sanitizeSettings({ market: v1.market }).market).toMatchObject({ wonPerGold: 3333, items: [{ price: 300 }] });
  });
});

describe('시장 뉴스 · 주식 거르기', async () => {
  const { marketNews, newMarket, stockPrices } = await import('./market');
  const { emptyStudy } = await import('../study/model');
  it('연속 상승 · 오늘 최소 공부', () => {
    const d = emptyStudy();
    d.subjects = { m: { id: 'm', updatedAt: 1, name: '수학', color: '#000', order: 0 } };
    d.sessions = Object.fromEntries(['01', '02', '03', '04'].map((x) => [x, { id: x, updatedAt: 1, date: `2026-11-${x}`, minutes: 60, subjectId: 'm', start: 0, end: 0, kind: 'manual' }])) as never;
    const n = marketNews(d, newMarket('2026-11-01'), '2026-11-05').map((x) => x.title);
    expect(n.some((t) => t.startsWith('수학전자'))).toBe(true);
    expect(n.some((t) => t.startsWith('오늘 최소 공부까지'))).toBe(true);
  });
  it('시험 3주 전부터만 내리는 과목 · 뺀 과목', () => {
    const d = emptyStudy();
    d.subjects = { c: { id: 'c', updatedAt: 1, name: '중국어', color: '#000', order: 0 } };
    const m = { ...newMarket('2026-11-01'), examOnly: ['c'] };
    expect(stockPrices(d, m, '2026-11-05').get('c')!.price).toBeGreaterThan(0);
    expect(stockPrices(d, { ...m, stockOff: ['c'] }, '2026-11-05').has('c')).toBe(false);
  });
});

describe('하루 쉬기권', async () => {
  const { fines, newMarket } = await import('./market');
  const { emptyStudy } = await import('../study/model');
  it('쉬기권을 쓴 날은 최소 공부 벌금이 없다', () => {
    const d = emptyStudy();
    const m = { ...newMarket('2026-11-02'), buys: [{ id: 'p', itemId: 'x', name: '하루 쉬기권', kind: 'pass' as const, price: 1500, tax: 0, at: Date.parse('2026-11-01T12:00:00+09:00'), passDate: '2026-11-03' }] };
    expect(fines(d, m, '2026-11-05').map((f) => f.date)).toEqual(['2026-11-04', '2026-11-02']);
  });
});

describe('시장 2', async () => {
  const mk = await import('./market');
  const { emptyStudy } = await import('../study/model');
  const ses = (id: string, date: string, minutes: number, start = 0) => ({ id, updatedAt: 1, date, minutes, start, end: start + minutes * 60_000, kind: 'manual' });
  it('연속 달성 보너스 · 실드', () => {
    const d = emptyStudy();
    // 11-02 주 · 11-09 주 목표 달성, 11-16 주 못함(실드) , 11-23 주 달성
    const weeks = ['2026-11-02', '2026-11-09', '2026-11-23'];
    d.sessions = Object.fromEntries(weeks.flatMap((w, i) => [0, 1, 2, 3, 4].map((k) => [`${i}${k}`, ses(`${i}${k}`, mk.kst(Date.parse(`${w}T12:00:00+09:00`) + k * 86_400_000), 360)]))) as never;
    const m = { ...mk.newMarket('2026-11-02'), buys: [{ id: 's', itemId: 'x', name: '실드', kind: 'perk' as const, effect: 'shield' as const, price: 600, tax: 0, at: Date.parse('2026-11-10T12:00:00+09:00') }] };
    const p = mk.weeklyPays(d, m, '2026-11-30');
    expect(p.map((x) => [x.pay, x.streak, !!x.shield])).toEqual([
      [500, 1, false],
      [600, 2, false],
      [0, 2, true],
      [700, 3, false],
    ]);
  });
  it('피버타임: 쓴 뒤 1시간 공부는 2배', () => {
    const d = emptyStudy();
    const t0 = Date.parse('2026-11-05T20:00:00+09:00');
    d.sessions = { a: ses('a', '2026-11-05', 90, t0) } as never;
    const m = { ...mk.newMarket('2026-11-01'), buys: [{ id: 'f', itemId: 'x', name: '물약', kind: 'perk' as const, effect: 'fever' as const, price: 400, tax: 0, at: t0 - 1000, usedAt: t0 }] };
    expect(mk.incomeByDay(d, m, '2026-11-05').get('2026-11-05')).toMatchObject({ study: 90, fever: 60, total: 150 });
  });
  it('계약서 · 배당 · 복권', () => {
    expect(mk.contractMult(240, 120)).toBe(2.5);
    expect(mk.contractMult(600, 60)).toBe(5);
    expect(mk.betMult(3, 1)).toBe(3.5);
    expect(mk.betMult(null, 1)).toBe(2.5);
    const ev = mk.LOTTO_TABLE.reduce((a, x) => a + x.prize * x.p, 0);
    expect(ev).toBeLessThan(mk.LOTTO_PRICE);
    expect(mk.LOTTO_TABLE.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1);
    expect(mk.drawLotto(0)).toBe(20);
    expect(mk.drawLotto(0.999)).toBe(2000);
    const d = emptyStudy();
    d.grades = { g: { id: 'g', updatedAt: 1, kind: 'mock', name: '6월', date: '2026-12-01', scores: [{ id: 's', subject: '수학', grade: 2 }] } } as never;
    const b = { id: 'b', at: Date.parse('2026-11-01T12:00:00+09:00'), kind: 'mock' as const, subject: '수학', target: 2, stake: 1000, mult: 2, until: '2027-01-01' };
    expect(mk.betState(b, d, '2026-12-02')).toMatchObject({ state: 'won', got: 2 });
    expect(mk.betState({ ...b, target: 1 }, d, '2026-12-02').state).toBe('lost');
  });
  it('시험 끝난 주 할인 · 자정 할증 · 타임 세일 · 암시장 · 티어', () => {
    const d = emptyStudy();
    d.exams = { e: { id: 'e', updatedAt: 1, name: '기말', date: '2026-11-10' } } as never;
    const m = mk.newMarket('2026-11-01');
    expect(mk.priceOf(m.items[0], m, d, '2026-11-12').price).toBe(158);
    const now = Date.parse('2026-11-20T21:00:00+09:00');
    expect(mk.lateSurge(now, '2026-11-20', 0, 60)).toBe(1.25);
    expect(mk.lateSurge(now, '2026-11-20', 60, 60)).toBe(1);
    const s = mk.timeSale(m, '2026-11-20', Date.parse('2026-11-20T18:30:00+09:00'))!;
    expect(s.off).toBe(0.3);
    expect(mk.timeSale(m, '2026-11-20', Date.parse('2026-11-20T19:01:00+09:00'))).toBeNull();
    const b1 = mk.blackToday('2026-11-20');
    expect(b1).toHaveLength(3);
    expect(mk.blackToday('2026-11-20')).toEqual(b1);
    expect(mk.seasonOf('2026-11-20')).toBe('2026-4시즌');
    expect(mk.tierNow({ ...m, tier: { season: '2026-3시즌', rank: 2 } }, '2026-11-20')).toBe(0);
  });
});
