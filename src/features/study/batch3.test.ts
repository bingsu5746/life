import { describe, expect, it } from 'vitest';
import { forecast, recentDone } from './forecast';
import { classesOn, nextClassDate } from './timetable';
import { guessMissed, recalled } from './blank';
import { sleepMinutes, splitStudy } from './condition';
import { parseWrongNums, wrongFrequency } from './grades';
import { makeQuestions, sameAnswer, splitExample } from './wordTest';
import { weekSummary } from './weekReview';
import { buildDigest } from './notifyDigest';
import { emptyStudy, type GradeRecord, type Plan, type Word } from './model';
import { sanitizeCollections, sanitizeSettings } from './sanitize';
import { mergeStudy } from './merge';
import type { PlanCtx, Target } from './plan';

const DAY = 86_400_000;

describe('문제집 끝내기 예측', () => {
  const plan: Plan = { id: 'p', updatedAt: 1, target: 'book', targetId: 'b', range: [[1, 100]], start: '2026-10-01', due: '2026-10-31', includeDue: true, baseline: 0 } as Plan;
  const ctx = { today: '2026-10-25', settings: { ...emptyStudy().settings, restDays: [] }, exams: {}, tutors: [] } as unknown as PlanCtx;
  const now = Date.UTC(2026, 9, 25, 3);
  it('최근 체크만 센다 (지운 것 빼고)', () => {
    expect(recentDone([[1, 10, now - 20 * DAY], [11, 30, now - 2 * DAY]], new Set([...Array(30)].map((_, i) => i + 1).filter((p) => p !== 12)), now - 14 * DAY)).toBe(19);
  });
  it('모자라면 며칠·하루 몇 쪽', () => {
    const done = new Set([...Array(60)].map((_, i) => i + 1));
    const t = { units: [], done, reserved: new Set(), subjectId: 's' } as unknown as Target;
    // 최근 14일에 28쪽 → 하루 2쪽. 남은 40쪽 → 20일 필요, 10/25~10/31 7일 → 13일 모자람
    const f = forecast(plan, t, ctx, [[1, 32, now - 30 * DAY], [33, 60, now - 3 * DAY]], now);
    expect(f).toMatchObject({ perDay: 2, left: 40, daysLeft: 7, need: 6, state: 'short', shortDays: 13 });
    const t2 = { ...t, done: new Set([...Array(90)].map((_, i) => i + 1)) } as Target;
    const ok = forecast(plan, t2, ctx, [[1, 90, now - DAY]], now);
    expect(ok).toMatchObject({ state: 'ok', left: 10, finish: '2026-10-26' });
    expect(forecast(plan, t, ctx, [[1, 60, now - 40 * DAY]], now).state).toBe('none');
  });
});

describe('학교 시간표', () => {
  const tt = { '1': ['math', 'kor'], '3': ['math'], '5': ['eng'] };
  it('다음 수업 날', () => {
    // 2026-10-25 일요일
    expect(classesOn(tt, '2026-10-26')).toEqual(['math', 'kor']);
    expect(nextClassDate(tt, 'math', '2026-10-25')).toBe('2026-10-26');
    expect(nextClassDate(tt, 'math', '2026-10-26')).toBe('2026-10-28');
    expect(nextClassDate(tt, 'math', '2026-10-26', true)).toBe('2026-10-26');
    expect(nextClassDate(tt, 'math', '2026-10-25', false, ['2026-10-26'])).toBe('2026-10-28');
    expect(nextClassDate(tt, 'sci', '2026-10-25')).toBeNull();
  });
});

describe('백지 복습 비교', () => {
  it('낱말 절반 이상이면 떠올린 것으로 (조사 무시)', () => {
    expect(recalled('광합성은 엽록체에서 일어난다', '엽록체에서 광합성이 일어남')).toBe(true);
    expect(recalled('이산화 탄소 + 물 → 포도당 + 산소', '포도당이 생긴다')).toBe(false);
    expect(recalled('이산화 탄소 + 물 → 포도당 + 산소', '포도당이랑 산소가 생긴다')).toBe(true);
    const pts = [{ id: 'a', text: '빛에너지를 화학 에너지로', done: false }, { id: 'b', text: 'Calvin cycle', done: false }];
    expect(guessMissed(pts, '빛에너지 → 화학 에너지')).toEqual(['b']);
  });
});

describe('잠·컨디션', () => {
  it('잔 시간', () => {
    expect(sleepMinutes({ sleep: '23:30', wake: '07:00' })).toBe(450);
    expect(sleepMinutes({ sleep: '01:00', wake: '07:30' })).toBe(390);
    expect(sleepMinutes({ sleep: '08:00', wake: '07:00' })).toBeNull();
    expect(sleepMinutes({ sleep: '23:00' })).toBeNull();
  });
  it('두 무리 비교 (적으면 null)', () => {
    const days = ['01', '02', '03', '04', '05', '06'].map((x, i) => ({ date: `2026-10-${x}`, value: i < 3 ? 480 : 360 }));
    const study = new Map(days.map((d, i) => [d.date, i < 3 ? 120 : 60]));
    expect(splitStudy(days, study, 420)).toEqual({ high: 120, low: 60, highDays: 3, lowDays: 3 });
    expect(splitStudy(days.slice(0, 4), study, 420)).toBeNull();
  });
});

describe('틀린 문항', () => {
  it('번호 읽기·횟수', () => {
    expect(parseWrongNums('3, 7, 21~23 / 7')).toEqual([3, 7, 21, 22, 23]);
    expect(parseWrongNums('0, 300, 5-2')).toEqual([]);
    const r = (id: string, wrong?: number[]): GradeRecord => ({ id, updatedAt: 1, kind: 'mock', name: id, date: '2026-03-01', scores: [{ id: id + 's', subject: '수학', wrong }] });
    const f = wrongFrequency([r('a', [21, 30]), r('b', [21]), r('c')], '수학');
    expect(f.records).toBe(2);
    expect(f.counts.get(21)).toBe(2);
    expect(f.max).toBe(30);
  });
});

describe('시험지', () => {
  const w = (id: string, term: string, meaning: string, s?: string): Word => ({ id, updatedAt: 1, listId: 'l', term, meaning, order: 1, box: 0, due: '2026-10-25', wrong: 0, example: s ? { s, ko: '해석' } : undefined });
  const pool = [w('1', 'abandon', '버리다', 'They [abandoned] the car.'), w('2', 'absorb', '흡수하다'), w('3', 'accept', '받아들이다'), w('4', 'achieve', '이루다'), w('5', 'adapt', '적응하다')];
  it('예문 나누기', () => {
    expect(splitExample('They [abandoned] the car.', 'abandon')).toEqual({ before: 'They ', answer: 'abandoned', after: ' the car.' });
    expect(splitExample('I absorb it.', 'absorb')?.answer).toBe('absorb');
    expect(splitExample('nothing', 'x')).toBeNull();
  });
  it('문제 종류 돌리기, 예문 없으면 뜻 쓰기로', () => {
    const qs = makeQuestions(pool, ['blankChoice', 'term'], 5, pool, () => 0.5, false);
    expect(qs[0]).toMatchObject({ kind: 'blankChoice', ask: 'They ______ the car.', answer: 'abandon' });
    expect(qs[0].choices).toHaveLength(4);
    expect(qs[0].choices).toContain('abandon');
    expect(qs[1]).toMatchObject({ kind: 'term', ask: '흡수하다', answer: 'absorb' });
    expect(qs[2]).toMatchObject({ kind: 'meaning', ask: 'accept' });
    expect(makeQuestions(pool, ['blank'], 1, pool, () => 0.5, false)[0].answer).toBe('abandoned');
  });
  it('답 비교', () => {
    expect(sameAnswer(' Abandon. ', 'abandon')).toBe(true);
    expect(sameAnswer('', '')).toBe(false);
  });
});

describe('주간 돌아보기·알림 글', () => {
  it('한 주 요약', () => {
    const d = emptyStudy();
    d.subjects.m = { id: 'm', updatedAt: 1, name: '수학', color: '#000', order: 0 };
    d.sessions.a = { id: 'a', updatedAt: 1, subjectId: 'm', date: '2026-10-20', minutes: 90, start: 0, end: 0, kind: 'manual' };
    d.sessions.b = { id: 'b', updatedAt: 1, date: '2026-10-14', minutes: 60, start: 0, end: 0, kind: 'manual' };
    d.conditions['2026-10-21'] = { id: '2026-10-21', updatedAt: 1, sleep: '23:00', wake: '06:30', mood: 4 };
    d.assessments.t = { id: 't', updatedAt: 1, subjectId: 'm', title: '보고서', due: '2026-10-28', steps: [], done: false, created: 1 };
    const s = weekSummary(d, {}, '2026-10-19', '2026-10-25');
    expect(s).toMatchObject({ minutes: 90, prevMinutes: 60, studyDays: 1, sleepAvg: 450, moodAvg: 4 });
    expect(s.next).toEqual([{ date: '2026-10-28', text: '수행평가: 수학 보고서' }]);
  });
  it('알림 글: 아침은 오늘, 저녁은 내일', () => {
    const d = emptyStudy();
    d.subjects.m = { id: 'm', updatedAt: 1, name: '수학', color: '#000', order: 0 };
    d.previews.p = { id: 'p', updatedAt: 1, subjectId: 'm', date: '2026-10-26', text: '3단원', done: false, created: 1 };
    d.settings.schoolTimetable = { '2': ['m'] };
    const e = buildDigest(d, {}, '2026-10-25', ['07:30', '21:00'], 2);
    expect(e).toHaveLength(4);
    expect(e[0]).toMatchObject({ date: '2026-10-25', slot: 0, title: '오늘 할 것' });
    expect(e[1]).toMatchObject({ date: '2026-10-25', slot: 1, title: '내일 준비', body: '내일 수업 예습 1개' });
    expect(e[2].body).toContain('오늘 수업 예습 1개');
    expect(e[3].body).toBe('내일 수업: 수학');
  });
});

describe('새 자료 다듬기·합치기', () => {
  it('다듬기', () => {
    const c = sanitizeCollections({
      assessments: { a: { id: 'a', updatedAt: 1, due: '2026-11-01', steps: [{ id: 's', text: 'x', done: 1 }, 5] }, b: { id: 'b', updatedAt: 1, due: 'x' } } as never,
      conditions: { '2026-10-25': { id: '2026-10-25', updatedAt: 1, sleep: '25:00', wake: '07:00', mood: 9 } } as never,
      blanks: { k: { id: 'k', updatedAt: 1, title: 't', points: [{ id: 'p', text: 'a' }], tries: [{ id: 't', date: '2026-10-25', missed: ['p', 2] }, { id: 'u' }] } } as never,
    });
    expect(Object.keys(c.assessments)).toEqual(['a']);
    expect(c.assessments.a).toMatchObject({ steps: [{ id: 's', text: 'x', done: false }], title: '수행평가' });
    expect(c.conditions['2026-10-25']).toMatchObject({ sleep: undefined, wake: '07:00', mood: undefined });
    expect(c.blanks.k).toMatchObject({ tries: [{ id: 't', date: '2026-10-25', missed: ['p'] }], box: 0 });
    const s = sanitizeSettings({ schoolTimetable: { '1': ['a', 3], '9': ['x'] }, gradeGoals: { mock: { 국어: 2, 수학: 12 } } });
    expect(s.schoolTimetable).toEqual({ '1': ['a'] });
    expect(s.gradeGoals).toEqual({ school: undefined, mock: { 국어: 2 } });
  });
  it('두 기기의 백지 복습 기록·수행평가 체크가 합쳐진다', () => {
    const a = emptyStudy();
    const b = emptyStudy();
    a.blanks.k = { id: 'k', updatedAt: 5, subjectId: '', title: 't', points: [], box: 1, due: '2026-10-26', wrong: 0, tries: [{ id: 'x', date: '2026-10-24' }].map((t) => ({ ...t, missed: [] })), created: 1 };
    b.blanks.k = { ...a.blanks.k, updatedAt: 4, tries: [{ id: 'y', date: '2026-10-25', missed: [] }] };
    expect(mergeStudy(a, b, 10).blanks.k.tries.map((t) => t.id)).toEqual(['x', 'y']);
    a.assessments.t = { id: 't', updatedAt: 5, subjectId: '', title: 'x', due: '2026-11-01', steps: [{ id: '1', text: 'a', done: false, at: 1 }, { id: '2', text: 'b', done: false, at: 1 }], done: false, created: 1 };
    b.assessments.t = { ...a.assessments.t, updatedAt: 4, steps: [{ id: '1', text: 'a', done: true, at: 3 }, { id: '2', text: 'b', done: false, at: 1 }] };
    expect(mergeStudy(a, b, 10).assessments.t.steps.map((s) => s.done)).toEqual([true, false]);
  });
});

describe('시험지 나누기 (splitSets)', () => {
  it('100개를 50개씩 → 2장, 모든 단어가 정확히 한 번', async () => {
    const { splitSets, seeded } = await import('./wordTest');
    const items = Array.from({ length: 100 }, (_, i) => i);
    const sets = splitSets(items, 50, seeded(3));
    expect(sets.map((s) => s.length)).toEqual([50, 50]);
    expect([...sets.flat()].sort((a, b) => a - b)).toEqual(items);
  });
  it('110개를 50개씩 → 3장, 마지막 장은 다른 단어로 채우고 모든 단어가 한 번 이상', async () => {
    const { splitSets, seeded } = await import('./wordTest');
    const items = Array.from({ length: 110 }, (_, i) => i);
    const sets = splitSets(items, 50, seeded(7));
    expect(sets.map((s) => s.length)).toEqual([50, 50, 50]);
    expect(new Set(sets.flat()).size).toBe(110);
    for (const s of sets) expect(new Set(s).size).toBe(s.length);
  });
  it('0(전부) 이거나 크면 한 장, 같은 씨앗이면 같은 순서', async () => {
    const { splitSets, seeded } = await import('./wordTest');
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(splitSets(items, 0, seeded(1))).toHaveLength(1);
    expect(splitSets(items, 50, seeded(1))[0]).toHaveLength(30);
    expect(splitSets(items, 10, seeded(5))).toEqual(splitSets(items, 10, seeded(5)));
  });
});

describe('숙제 나누기 (splitHomework)', () => {
  it('40쪽을 10/1 ~ 10/5(마감 전날 10/4)까지 → 4일 10쪽씩, 이어지는 번호', async () => {
    const { splitHomework } = await import('./splitHomework');
    const p = splitHomework(40, 1, '2026-10-01', '2026-10-05', false, []);
    expect(p.map((x) => [x.date, x.from, x.to])).toEqual([['2026-10-01', 1, 10], ['2026-10-02', 11, 20], ['2026-10-03', 21, 30], ['2026-10-04', 31, 40]]);
  });
  it('쉬는 날은 건너뛰고, 분량이 날수보다 적으면 하루 1개', async () => {
    const { splitHomework } = await import('./splitHomework');
    const p = splitHomework(3, 5, '2026-10-01', '2026-10-31', true, ['2026-10-02']);
    expect(p.map((x) => [x.date, x.from, x.to])).toEqual([['2026-10-01', 5, 5], ['2026-10-03', 6, 6], ['2026-10-04', 7, 7]]);
  });
  it('마감이 오늘이면 오늘 한 번에', async () => {
    const { splitHomework } = await import('./splitHomework');
    expect(splitHomework(7, 1, '2026-10-01', '2026-10-01', false, [])).toEqual([{ date: '2026-10-01', from: 1, to: 7 }]);
  });
});

describe('숙제 다시 나누기 (resplit)', () => {
  it('안 한 번호만 새 마감까지 다시 나눈다', async () => {
    const { resplit } = await import('./splitHomework');
    const p = resplit([11, 12, 13, 14, 21, 22], '2026-10-10', '2026-10-13', false, []);
    expect(p.map((x) => [x.date, x.from, x.to])).toEqual([['2026-10-10', 11, 12], ['2026-10-11', 13, 14], ['2026-10-12', 21, 22]]);
  });
});

describe('지난달 비교 (compareMonths)', () => {
  it('이번 달 진행 중이면 지난달 같은 날까지만', async () => {
    const { compareMonths } = await import('../life/calc');
    const tx = (id: string, date: string, amount: number, category: string) => ({ id, date, amount, category, type: 'out', created: 1, updatedAt: 1 });
    const d = { moneyTx: Object.fromEntries([tx('a', '2026-09-03', 10000, '식비'), tx('b', '2026-09-25', 50000, '쇼핑'), tx('c', '2026-10-02', 30000, '식비')].map((t) => [t.id, t])) } as never;
    const c = compareMonths(d, '2026-10', '2026-10-10')!;
    expect(c.partial).toBe(true);
    expect(c.prevOut).toBe(10000);
    expect(c.diff).toBe(20000);
    expect(c.byCategory).toEqual([{ category: '식비', diff: 20000 }]);
    expect(compareMonths(d, '2026-08', '2026-10-10')).toBeNull();
  });
});

describe('영화 시상식 (awards)', () => {
  it('올해의 영화 · 후보 · 많이 본 장르·장소', async () => {
    const { awards, watchedYears } = await import('../life/awards');
    const mv = (id: string, rating: number, watched: string, extra = {}) => ({ id, title: id, status: 'watched', rating, watched, created: 1, updatedAt: 1, ...extra });
    const d = { movies: Object.fromEntries([mv('a', 4.5, '2026-03-01', { genre: '액션,범죄', where: '영화관' }), mv('b', 5, '2026-05-01', { genre: '액션', where: '집', again: [{ date: '2026-06-01', where: '집' }] }), mv('c', 2, '2026-07-09', { genre: '드라마', where: '집' }), mv('d', 3, '2025-01-01')].map((m) => [m.id, m])) } as never;
    const a = awards(d, 2026);
    expect(a.count).toBe(3);
    expect(a.best?.id).toBe('b');
    expect(a.nominees.map((m) => m.id)).toEqual(['a', 'c']);
    expect(a.worst?.id).toBe('c');
    expect(a.genre).toEqual({ name: '액션', count: 2 });
    expect(a.place).toEqual({ name: '집', count: 3 });
    expect(a.rewatch).toBe(1);
    expect(awards(d, null).count).toBe(4);
    expect(watchedYears(d)).toEqual([2026, 2025]);
  });
});
