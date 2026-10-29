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
    // 10/25 는 일요일: 저녁 알림에 이번 주 요약이 붙는다
    expect(e[1]).toMatchObject({ date: '2026-10-25', slot: 1, title: '내일 준비 · 이번 주 돌아보기', url: '/week' });
    expect(e[1].body).toMatch(/^내일 수업 예습 1개 · 이번 주 공부 0분/);
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

describe('일기 양식 (diaryForm)', () => {
  it('그날 기록 요약과 꿈 날짜', async () => {
    const { daySummary, dreamDates, formOf } = await import('../life/diaryForm');
    const d = {
      settings: {},
      sessions: { s: { id: 's', date: '2026-10-28', minutes: 90, updatedAt: 1 } },
      todos: {}, workouts: { w: { id: 'w', date: '2026-10-28', kind: '농구', minutes: 60, updatedAt: 1 } },
      movies: { m: { id: 'm', title: '존 윅', status: 'watched', watched: '2026-10-28', rating: 5, updatedAt: 1 } },
      hobbyLogs: {}, hobbies: {}, moneyTx: {}, habits: {},
      diary: { '2026-10-27': { id: '2026-10-27', text: '', parts: { dream: '하늘을 날았다' }, updatedAt: 1 }, '2026-10-26': { id: '2026-10-26', text: 'x', updatedAt: 1 } },
    } as never;
    expect(daySummary(d, '2026-10-28')).toEqual(['공부 1시간 30분', '운동: 농구 60분', '영화: 존 윅 ★5']);
    expect(dreamDates(d)).toEqual(['2026-10-27']);
    expect(formOf(d).parts).toEqual(['done', 'good', 'dream']);
  });
});

describe('습관 요일별 달성률 (weekdayRates)', () => {
  it('하기로 한 날 중 한 비율, 안 한 오늘은 안 센다', async () => {
    const { weekdayRates } = await import('./habits');
    // 2026-10-28 은 수요일. 매일 하는 습관, 10/21(수) 만 하고 10/14(수) 는 안 함
    const h = { weekdays: [], checks: ['2026-10-21', '2026-10-27'], created: '2026-10-07' };
    const r = weekdayRates([h], '2026-10-28', 3);
    expect(r[3]).toEqual({ weekday: 3, due: 2, done: 1, pct: 50 });
    expect(r[2]).toMatchObject({ due: 3, done: 1 });
    expect(r[0].due).toBe(3);
  });
});

describe('시험 공부 자동 계획 (buildExamPlan)', () => {
  const mk = (over: Record<string, unknown> = {}, lines = 8) => {
    const L = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, text: `${p} ${i + 1}단원`, done: false }));
    const exam = { id: 'e', name: '중간고사', date: '2026-11-10', kind: 'school', updatedAt: 1, scopes: [{ id: 'sm', subjectId: 'math', lines: L('m', lines) }, { id: 'se', subjectId: 'eng', lines: L('e', lines / 2), date: '2026-11-11' }], plan: { on: true, weekday: 180, weekend: 300, perLine: 40, review: 0.35, ...over } };
    return { settings: { offDates: [], restDays: [], tutorRatio: 0.5 }, subjects: { math: { id: 'math', name: '수학' }, eng: { id: 'eng', name: '영어' } }, exams: { e: exam }, sessions: {}, tutors: {}, notes: {}, grades: {} } as never;
  };
  it('모든 처음 공부를 시험 전에 넣고 하루 시간을 크게 넘기지 않는다', async () => {
    const { buildExamPlan } = await import('./examPlan');
    const d = mk();
    const r = buildExamPlan(d, (d as { exams: { e: never } }).exams.e, '2026-10-26')!;
    const ids = r.days.flatMap((x) => x.items.map((i) => i.id));
    for (let i = 0; i < 8; i++) expect(ids).toContain(`L:m${i}`);
    for (let i = 0; i < 4; i++) expect(ids).toContain(`L:e${i}`);
    expect(r.overflow).toEqual([]);
    expect(r.short).toBe(0);
    for (const day of r.days) expect(day.minutes).toBeLessThanOrEqual(Math.max(day.capacity * 1.15, 60));
    // 수학 시험 전날(11/9)에 수학 훑어보기, 영어는 11/10
    expect(r.days.find((x) => x.date === '2026-11-09')!.items.some((i) => i.id === 'S:sm')).toBe(true);
    expect(r.days.find((x) => x.date === '2026-11-10')!.items.some((i) => i.id === 'S:se')).toBe(true);
    // 시험 날(11/10)에는 수학 공부가 없다
    expect(r.days.find((x) => x.date === '2026-11-10')!.items.some((i) => i.subjectId === 'math')).toBe(false);
  });
  it('시간이 모자라면 모자라는 만큼 알린다', async () => {
    const { buildExamPlan } = await import('./examPlan');
    const d = mk({ weekday: 30, weekend: 30 }, 20);
    const r = buildExamPlan(d, (d as { exams: { e: never } }).exams.e, '2026-11-05')!;
    expect(r.short).toBeGreaterThan(0);
    expect(r.extraPerDay).toBeGreaterThan(0);
  });
  it('오늘 고정한 목록은 그대로, 끝낸 줄은 다음 계산에서 빠진다', async () => {
    const { buildExamPlan, toggleItem } = await import('./examPlan');
    const d = mk() as { exams: { e: { plan: { lock?: unknown } } } };
    const first = buildExamPlan(d as never, d.exams.e as never, '2026-10-26')!;
    const todayIds = first.days[0].items.map((i) => i.id);
    expect(todayIds.length).toBeGreaterThan(0);
    d.exams.e.plan.lock = { date: '2026-10-26', ids: todayIds };
    const again = buildExamPlan(d as never, toggleItem(d.exams.e as never, `L:${todayIds.find((x) => x.startsWith('L:'))!.slice(2)}`, '2026-10-26', Date.parse('2026-10-26T03:00:00Z')) as never, '2026-10-26')!;
    expect(again.days[0].items.map((i) => i.id).sort()).toEqual([...todayIds].sort());
    const later = again.days.slice(1).flatMap((x) => x.items.map((i) => i.id));
    for (const id of todayIds) expect(later).not.toContain(id);
  });
  it('꺼져 있으면 null', async () => {
    const { buildExamPlan } = await import('./examPlan');
    const d = mk({ on: false });
    expect(buildExamPlan(d, (d as { exams: { e: never } }).exams.e, '2026-10-26')).toBeNull();
  });
});

describe('통합 검색 (searchAll)', () => {
  it('여러 기록에서 글자로 찾고 둘레 글을 보여 준다', async () => {
    const { searchAll, snippet } = await import('../life/search');
    const d = {
      diary: { '2026-10-27': { id: '2026-10-27', text: '오늘은 존 윅을 봤다', parts: { dream: '하늘을 날았다' }, updatedAt: 1 } },
      movies: { m: { id: 'm', title: '존 윅', status: 'watched', comment: '총 쏘는 맛', updatedAt: 1 } },
      reads: {}, todos: {}, exams: {}, assessments: {}, notes: {}, cards: {}, books: {}, workouts: {}, hobbyLogs: {}, hobbies: {}, wishes: {}, moneyTx: {},
    } as never;
    const hits = searchAll(d, {}, '존 윅');
    expect(hits.map((h) => h.group)).toEqual(['일기', '영화']);
    expect(hits[0].to).toBe('/diary/2026-10-27');
    expect(searchAll(d, {}, '하늘')[0].snippet).toContain('하늘');
    expect(searchAll(d, {}, '없는말')).toEqual([]);
    expect(snippet('가나다라마바사아자차카타파하', '마바', 3)).toBe('…나다라마바사아자…');
  });
});

describe('농구 혼자 연습 (drills)', () => {
  it('최근 기록으로 약점을 찾는다', async () => {
    const { recentStats, weaknesses } = await import('../life/drills');
    const w = (id: string, date: string, bb: object) => ({ id, kind: '농구', date, bb, updatedAt: 1 });
    const d = { workouts: Object.fromEntries([w('a', '2026-10-20', { mode: 'practice', ftm: 5, fta: 20, tpm: 3, tpa: 10, fgm: 20, fga: 30 }), w('b', '2026-09-01', { mode: 'practice', ftm: 20, fta: 20 })].map((x) => [x.id, x])) } as never;
    const s = recentStats(d, '2026-10-28', 30);
    expect(s.ft).toEqual({ m: 5, a: 20 });
    const weak = weaknesses(s).map((x) => x.area);
    expect(weak[0]).toBe('ft');
    expect(weak).toContain('three');
    expect(weak).not.toContain('shoot');
    expect(weaknesses({ ft: { m: 0, a: 3 }, fg: { m: 0, a: 0 }, tp: { m: 0, a: 0 }, sessions: 1, games: 0, ast: 0, reb: 0 })).toEqual([]);
  });
  it('시간 안에서 오늘의 연습을 짜고, 골대가 없으면 골대 드릴을 뺀다', async () => {
    const { buildSession, totalMinutes } = await import('../life/drills');
    const hoop = buildSession({ minutes: 45, have: 'hoop', weak: [{ area: 'ft', why: '' }, { area: 'three', why: '' }], salt: 1, maxLevel: 2 });
    expect(hoop.some((x) => x.area === 'ft')).toBe(true);
    expect(hoop.some((x) => x.area === 'three')).toBe(true);
    expect(totalMinutes(hoop)).toBeLessThanOrEqual(55);
    const none = buildSession({ minutes: 30, have: 'any', weak: [{ area: 'ft', why: '' }], salt: 2, maxLevel: 3 });
    expect(none.every((x) => x.need === 'any')).toBe(true);
    expect(none.length).toBeGreaterThan(0);
    expect(buildSession({ minutes: 30, have: 'hoop', weak: [], salt: 5, maxLevel: 2 }).map((x) => x.id)).toEqual(buildSession({ minutes: 30, have: 'hoop', weak: [], salt: 5, maxLevel: 2 }).map((x) => x.id));
  });
});

describe('넣은 슛 합 (shotsBetween)', () => {
  it('기간 안의 농구 기록만 더한다', async () => {
    const { shotsBetween } = await import('../life/drills');
    const w = (id: string, date: string, bb: object, kind = '농구') => ({ id, kind, date, bb, updatedAt: 1 });
    const d = { workouts: Object.fromEntries([w('a', '2026-10-27', { mode: 'practice', fgm: 5, fga: 10, tpm: 2, tpa: 8 }), w('b', '2026-10-28', { mode: 'game', ftm: 3, fta: 4, fgm: 1, fga: 3 }), w('c', '2026-10-20', { mode: 'practice', fgm: 9, fga: 9 }), w('d', '2026-10-28', { fgm: 9, fga: 9 }, '헬스')].map((x) => [x.id, x])) } as never;
    expect(shotsBetween(d, '2026-10-26', '2026-10-28')).toEqual({ fg: { m: 6, a: 13 }, tp: { m: 2, a: 8 }, ft: { m: 3, a: 4 } });
  });
});

describe('반복 할 일 (dueTodoRules)', () => {
  it('정한 요일에만, 이미 있거나 지운 것은 다시 만들지 않는다', async () => {
    const { dueTodoRules, ruleTodoId } = await import('./todoRules');
    // 2026-10-28 은 수요일(3)
    const d = { todoRules: { a: { id: 'a', title: '단어 복습', weekdays: [3], start: '2026-10-01', updatedAt: 1 }, b: { id: 'b', title: '운동', weekdays: [], start: '2026-10-01', updatedAt: 1 }, c: { id: 'c', title: '월요일만', weekdays: [1], start: '2026-10-01', updatedAt: 1 } }, todos: { [ruleTodoId('b', '2026-10-28')]: { id: 'x', deleted: true, updatedAt: 1 } } } as never;
    expect(dueTodoRules(d, '2026-10-28').map((t) => t.title)).toEqual(['단어 복습']);
  });
});

describe('독서 목표 (goalPace)', () => {
  it('남은 권수와 한 달 몫', async () => {
    const { goalPace } = await import('../life/Reading');
    expect(goalPace(24, 12, '2026-07-01')).toEqual({ left: 12, perMonth: 2, onTrack: true });
    expect(goalPace(24, 2, '2026-07-01').onTrack).toBe(false);
    expect(goalPace(5, 6, '2026-12-31').left).toBe(0);
  });
});

describe('시험 계획 돌아보기 (reviewExamPlan)', () => {
  it('끝낸 줄 비율 · 실제 공부 시간 · 점수 · 한 줄 시간', async () => {
    const { reviewExamPlan } = await import('./examPlan');
    const at = Date.parse('2026-10-05T03:00:00Z');
    const exam = { id: 'e', name: '중간', date: '2026-10-10', updatedAt: 1, scopes: [{ id: 's', subjectId: 'm', lines: [{ id: 'a', text: '1', done: true, at }, { id: 'b', text: '2', done: true, at }, { id: 'c', text: '3', done: true, at }, { id: 'd', text: '4', done: false }] }], plan: { on: true, weekday: 120, weekend: 200, perLine: 40, review: 0.35, started: '2026-10-01' } };
    const d = { subjects: { m: { id: 'm', name: '수학' } }, sessions: { x: { id: 'x', subjectId: 'm', date: '2026-10-03', minutes: 150, updatedAt: 1 }, y: { id: 'y', subjectId: 'm', date: '2026-10-11', minutes: 999, updatedAt: 1 } }, grades: { g: { id: 'g', examId: 'e', kind: 'school', date: '2026-10-20', updatedAt: 1, scores: [{ id: 'q', subject: '수학', raw: 84 }] } } } as never;
    const r = reviewExamPlan(d, exam as never)!;
    expect(r.doneRate).toBe(0.75);
    expect(r.subjects[0]).toMatchObject({ lines: 4, done: 3, actual: 150, score: 84 });
    expect(r.perLine).toBe(50);
  });
});

describe('장소·시간대 (placeTimeStats)', () => {
  it('장소별 합과 한 번 평균, 가장 오래 집중한 곳', async () => {
    const { placeTimeStats } = await import('./timeStats');
    const at = (h: number) => Date.parse(`2026-10-20T${String(h - 9 < 0 ? h + 15 : h - 9).padStart(2, '0')}:00:00Z`);
    const s = (id: string, place: string, min: number, h: number, kind = 'watch') => ({ id, place, minutes: min, start: at(h), end: 0, date: '2026-10-20', kind, updatedAt: 1 });
    const list = [s('a', '독서실', 60, 19), s('b', '독서실', 50, 20), s('c', '독서실', 70, 19), s('d', '집', 20, 10), s('e', '집', 30, 11), s('f', '집', 25, 10), s('g', '집', 25, 10, 'pomo')] as never;
    const r = placeTimeStats(list, '2026-10-01', '2026-10-31');
    expect(r.places[0]).toEqual({ name: '독서실', minutes: 180, count: 3, avg: 60 });
    expect(r.places[1]).toMatchObject({ name: '집', minutes: 100, count: 4, avg: 25 });
    expect(r.bestPlace?.name).toBe('독서실');
    expect(r.bestSlot?.name).toBe('저녁 (18~22시)');
  });
});

describe('백업 알림 날 (backupDue) · 이번 주 쓴 돈 (weekSpent)', () => {
  it('30일이 지나면 오늘, 아니면 그날', async () => {
    const { backupDue } = await import('./backup');
    expect(backupDue(undefined, '2026-10-28')).toBe('2026-10-28');
    expect(backupDue('2026-10-01', '2026-10-28')).toBe('2026-10-31');
    expect(backupDue('2026-09-01', '2026-10-28')).toBe('2026-10-28');
  });
  it('월요일부터 그날까지', async () => {
    const { weekSpent } = await import('../life/calc');
    const t = (id: string, date: string, amount: number, type = 'out') => ({ id, date, amount, type, category: '식비', created: 1, updatedAt: 1 });
    const d = { moneyTx: Object.fromEntries([t('a', '2026-10-26', 5000), t('b', '2026-10-28', 3000), t('c', '2026-10-29', 9000), t('d', '2026-10-25', 7000), t('e', '2026-10-27', 1000, 'in')].map((x) => [x.id, x])) } as never;
    expect(weekSpent(d, '2026-10-28')).toBe(8000);
  });
});

describe('농구 연습 항목 (practiceTotals · guessKind)', () => {
  it('항목별 슛을 2점·3점·자유투로 더하고, 이름으로 슛 종류를 짐작한다', async () => {
    const { practiceTotals, guessKind } = await import('../life/drills');
    expect(practiceTotals([{ kind: 'ft', made: 14, att: 20 }, { kind: 'tp', made: 9, att: 25 }, { kind: 'fg', made: 12, att: 20 }, { kind: 'ft', made: 8, att: 10 }, { made: 5, att: 5 }])).toEqual({ fgm: 12, fga: 20, tpm: 9, tpa: 25, ftm: 22, fta: 30 });
    expect(guessKind('자유투 루틴')).toBe('ft');
    expect(guessKind('3점 캐치 앤 슛')).toBe('tp');
    expect(guessKind('엘보 점퍼')).toBe('fg');
    expect(guessKind('제자리 볼 핸들링')).toBeUndefined();
  });
});

describe('오답 패턴 (mistakePatterns)', () => {
  it('과목별 가장 많은 이유 · 실수 비율 · 단원', async () => {
    const { mistakePatterns, isCareless } = await import('./mistakes');
    const n = (id: string, reason: string | null, page?: number) => ({ id, subjectId: 'm', reason, bookId: page ? 'b' : undefined, page, learned: false, updatedAt: 1, box: 1, due: '2026-10-01', wrong: 1 });
    const d = {
      notes: Object.fromEntries([n('1', 'calc', 12), n('2', 'calc', 14), n('3', 'calc', 30), n('4', 'concept', 31), n('5', 'misread'), n('6', null)].map((x) => [x.id, x])),
      books: { b: { id: 'b', name: '쎈', units: [{ name: '1단원', from: 1, to: 20 }, { name: '2단원', from: 21, to: 40 }], updatedAt: 1 } },
    } as never;
    const [p] = mistakePatterns(d);
    expect(p.total).toBe(6);
    expect(p.top).toEqual({ reason: 'calc', n: 3, share: 0.6 });
    expect(p.careless).toBe(0.8);
    expect(p.units).toEqual([{ name: '쎈 1단원', n: 2 }, { name: '쎈 2단원', n: 2 }]);
    expect(isCareless(p)).toBe(true);
  });
});

describe('잔 시간대별 공부 (sleepBuckets)', () => {
  it('구간마다 평균, 사흘 넘는 구간 중 공부가 가장 많은 곳', async () => {
    const { sleepBuckets } = await import('./condition');
    const day = (i: number, sleep: number, mood: number | null) => ({ date: `2026-10-${String(i).padStart(2, '0')}`, sleep, mood });
    const days = [day(1, 330, 2), day(2, 340, 3), day(3, 350, null), day(4, 450, 4), day(5, 460, 5), day(6, 440, 4), day(7, 600, null)];
    const study = new Map([['2026-10-01', 60], ['2026-10-02', 60], ['2026-10-03', 90], ['2026-10-04', 180], ['2026-10-05', 120], ['2026-10-06', 150]]);
    const r = sleepBuckets(days, study);
    expect(r.buckets[1]).toEqual({ label: '5~6시간', days: 3, study: 70, mood: 2.5 });
    expect(r.buckets[3]).toEqual({ label: '7~8시간', days: 3, study: 150, mood: 4.3 });
    expect(r.best?.label).toBe('7~8시간');
  });
});

describe('모으기 속도 (savingPace)', () => {
  it('최근 8주 평균으로 끝나는 날과 당겨지는 날', async () => {
    const { savingPace } = await import('../life/calc');
    const dep = (date: string, amount: number) => ({ date, amount });
    const g = { target: 100000, deposits: [dep('2026-09-03', 10000), dep('2026-09-17', 10000), dep('2026-10-01', 10000), dep('2026-10-15', 10000)], due: '2026-12-24' };
    const r = savingPace(g, '2026-10-28');
    expect(r.left).toBe(60000);
    expect(r.perWeek).toBe(5000);
    expect(r.eta).toBe('2027-01-20');
    expect(r.needPerWeek).toBe(7400);
    expect(r.faster[0]).toEqual({ extra: 5000, days: 42 });
  });
});

describe('단어 시험 예상 점수 (knowChance · expectedScore)', () => {
  it('상자·틀린 횟수·지난 복습으로 어림한다', async () => {
    const { knowChance, expectedScore } = await import('./wordTest');
    expect(knowChance({ box: 0, wrong: 0, due: '2026-10-28' }, '2026-10-28')).toBe(0.15);
    expect(knowChance({ box: 5, wrong: 0, due: '2026-11-10' }, '2026-10-28')).toBe(0.9);
    expect(knowChance({ box: 2, wrong: 2, due: '2026-10-20' }, '2026-10-28')).toBeCloseTo(0.45);
    expect(expectedScore([{ box: 5, wrong: 0, due: '2026-11-10' }, { box: 0, wrong: 0, due: '2026-10-28' }], '2026-10-28')).toBe(53);
    expect(expectedScore([], '2026-10-28')).toBeNull();
  });
});

describe('영화 취향 지도 (tasteMap · unexplored)', () => {
  it('장르별 편수·평균, 안 본 장르', async () => {
    const { tasteMap, unexplored } = await import('../life/taste');
    const m = (id: string, rating: number, genre?: string, nation?: string) => ({ id, title: id, status: 'watched', rating, genre, nation, updatedAt: 1, created: 1 });
    const d = { movies: Object.fromEntries([m('a', 5, '액션,범죄', '미국'), m('b', 4, '액션', '한국'), m('c', 2, '드라마', '한국'), m('d', 3)].map((x) => [x.id, x])) } as never;
    const t = tasteMap(d);
    expect(t.rated).toBe(4);
    expect(t.withInfo).toBe(3);
    expect(t.genres[0]).toEqual({ name: '액션', count: 2, avg: 4.5 });
    expect(t.nations[0]).toEqual({ name: '한국', count: 2, avg: 3 });
    expect(unexplored(['액션', '다큐멘터리', '성인물(에로)', '애니메이션'], t.genres)).toEqual(['다큐멘터리', '애니메이션']);
  });
});

describe('내신 목표 역산 (neededScore)', () => {
  it('받은 점수와 비율로 남은 시험에 필요한 점수', async () => {
    const { neededScore } = await import('./grades');
    const g = { target: 90, parts: [{ weight: 30, score: 84 }, { weight: 30 }, { weight: 40, score: 95 }] };
    // 84×0.3 + 95×0.4 = 25.2 + 38 = 63.2 → (90 − 63.2) / 0.3 = 89.4
    expect(neededScore(g)).toEqual({ need: 89.4, got: 63.2, left: 30, possible: true });
    expect(neededScore({ target: 99, parts: [{ weight: 50, score: 80 }, { weight: 50 }] }).possible).toBe(false);
    expect(neededScore({ target: 80, parts: [{ weight: 50, score: 90 }, { weight: 50, score: 80 }] })).toEqual({ need: null, got: 85, left: 0, possible: true });
  });
});

describe('하루 마감 체크인 알림', () => {
  it('체크인 시각 칸은 체크인 알림', () => {
    const d = emptyStudy();
    d.settings.checkinTime = '22:30';
    const e = buildDigest(d, {}, '2026-10-28', ['07:30', '22:30'], 1);
    expect(e[1]).toMatchObject({ slot: 1, title: '오늘 어땠어요?', url: '/checkin' });
    expect(e[0].title).toBe('오늘 할 것');
  });
});

describe('일기 알림', () => {
  it('일기를 안 쓴 날만 일기 알림, 쓴 날은 원래 알림', () => {
    const d = emptyStudy();
    d.settings.diaryTime = '22:30';
    d.diary['2026-10-29'] = { id: '2026-10-29', text: '씀', updatedAt: 1 } as never;
    const e = buildDigest(d, {}, '2026-10-28', ['22:30'], 2);
    expect(e[0]).toMatchObject({ date: '2026-10-28', title: '일기 쓸 시간이에요', url: '/diary/2026-10-28' });
    expect(e[1].title).toBe('내일 준비');
  });
});

describe('예문 저절로 (needExamples)', () => {
  it('뜻 있는 영어 단어 중 예문 없고 하루 안에 시도 안 한 것', async () => {
    const { needExamples } = await import('./autoExamples');
    const w = (id: string, term: string, meaning: string, example?: object) => ({ id, term, meaning, example, listId: 'l', order: 1, box: 0, due: '2026-10-01', wrong: 0, updatedAt: 1 });
    const words = Object.fromEntries([w('a', 'abandon', '버리다'), w('b', 'vivid', '생생한', { s: 'x', ko: 'y' }), w('c', '사과', 'apple'), w('d', 'ample', ''), w('e', 'keen', '예리한')].map((x) => [x.id, x])) as never;
    expect(needExamples(words, { e: Date.now() - 1000 }).map((x) => x.id)).toEqual(['a']);
    expect(needExamples(words, { e: Date.now() - 2 * 86_400_000 }).map((x) => x.id)).toEqual(['a', 'e']);
  });
});

describe('지문 (dueAgain · chunkText)', () => {
  it('헷갈린 지문은 사흘마다 다시', async () => {
    const { dueAgain } = await import('./passages');
    expect(dueAgain({ confusing: true }, '2026-10-29')).toBe(true);
    expect(dueAgain({ confusing: true, seen: ['2026-10-27'] }, '2026-10-29')).toBe(false);
    expect(dueAgain({ confusing: true, seen: ['2026-10-26'] }, '2026-10-29')).toBe(true);
    expect(dueAgain({ confusing: false }, '2026-10-29')).toBe(false);
  });
  it('문단을 지키며 나눈다', async () => {
    const { chunkText } = await import('./passages');
    const p = 'a'.repeat(50);
    expect(chunkText(`${p}\n\n${p}\n\n${p}`, 120)).toEqual([`${p}\n\n${p}`, p]);
    expect(chunkText('One. Two. Three.', 8).length).toBeGreaterThan(1);
  });
});

describe('연속 기록 (dayStreak)', () => {
  it('오늘 안 했으면 어제까지 이어진 날', async () => {
    const { dayStreak } = await import('../life/calc');
    expect(dayStreak(['2026-10-27', '2026-10-28', '2026-10-29'], '2026-10-29')).toBe(3);
    expect(dayStreak(['2026-10-27', '2026-10-28'], '2026-10-29')).toBe(2);
    expect(dayStreak(['2026-10-26', '2026-10-28'], '2026-10-29')).toBe(1);
    expect(dayStreak([], '2026-10-29')).toBe(0);
  });
});

describe('용돈 자동 모으기 (autoSaves)', () => {
  it('시작한 날부터 들어온 용돈의 비율만큼 한 번씩, 지운 용돈은 뺀다', async () => {
    const { autoSaves } = await import('../life/calc');
    const d = emptyStudy();
    const tx = (id: string, date: string, amount: number, category = '용돈', deleted?: boolean) => ({ id, updatedAt: 1, date, type: 'in' as const, amount, category, created: 1, deleted });
    d.moneyTx = { a: tx('a', '2026-10-01', 50000), b: tx('b', '2026-10-20', 30000), c: tx('c', '2026-10-21', 10000, '알바') } as never;
    d.savings = { g: { id: 'g', updatedAt: 1, name: '이어폰', target: 100000, deposits: [{ id: 'm', date: '2026-10-02', amount: 5000 }], autoPct: 20, autoSince: '2026-10-10', created: 1 } } as never;
    const [g] = autoSaves(d);
    expect(g.deposits).toEqual([{ id: 'm', date: '2026-10-02', amount: 5000 }, { id: 'auto-b', date: '2026-10-20', amount: 6000 }]);
    d.savings = { g } as never;
    expect(autoSaves(d)).toEqual([]);
    d.moneyTx.b = { ...d.moneyTx.b, deleted: true } as never;
    expect(autoSaves(d)[0].deposits.map((x) => x.id)).toEqual(['m']);
  });
});

describe('코트별 슛 (shotsByCourt)', () => {
  it('코트를 적은 기록만 모아 많이 간 순', async () => {
    const { shotsByCourt, courtNames } = await import('../life/bb');
    const w = (id: string, date: string, court: string | undefined, ftm: number, fta: number) => ({ id, updatedAt: 1, date, kind: '농구', created: 1, bb: { mode: 'practice', court, ftm, fta } });
    const d = { workouts: { a: w('a', '2026-10-01', '공원', 7, 10), b: w('b', '2026-10-05', '공원', 8, 10), c: w('c', '2026-10-06', '체육관', 9, 10), e: w('e', '2026-10-07', undefined, 1, 10) } } as never;
    const r = shotsByCourt(d, '2026-10-01', '2026-10-31');
    expect(r.map((x) => [x.court, x.times, x.s.ft.m, x.s.ft.a])).toEqual([
      ['공원', 2, 15, 20],
      ['체육관', 1, 9, 10],
    ]);
    expect(courtNames(d)).toEqual(['체육관', '공원']);
  });
});

describe('오답 과목 추천 (guessNoteSubject)', () => {
  it('영어 글 → 타이머 → 방금 공부 → 없음', async () => {
    const { guessNoteSubject } = await import('./mistakes');
    const now = Date.UTC(2026, 9, 29, 10);
    const s = (id: string, name: string) => ({ id, name, color: '#000', order: 1, updatedAt: 1 });
    const d = { subjects: { en: s('en', '영어'), ma: s('ma', '수학') }, sessions: { x: { id: 'x', updatedAt: 1, subjectId: 'ma', start: now - 3600_000, end: now - 600_000, minutes: 50, date: '2026-10-29', kind: 'watch' } }, notes: {} } as never;
    expect(guessNoteSubject(d, now, undefined, 'The author argues that the most important thing is to read carefully.')?.id).toBe('en');
    expect(guessNoteSubject(d, now, 'en')?.id).toBe('en');
    expect(guessNoteSubject(d, now)).toEqual({ id: 'ma', why: '방금 공부한 과목' });
    expect(guessNoteSubject(d, now + 5 * 3600_000)).toBeNull();
  });
});

describe('타이머 한 줄 메모 → 일기 오늘 한 것', () => {
  it('메모가 과목 이름과 함께 들어간다', async () => {
    const { daySummary } = await import('../life/diaryForm');
    const d = emptyStudy();
    d.subjects = { ma: { id: 'ma', name: '수학', color: '#000', order: 1, updatedAt: 1 } } as never;
    d.sessions = { x: { id: 'x', updatedAt: 1, subjectId: 'ma', start: 1, end: 2, minutes: 40, date: '2026-10-29', kind: 'watch', memo: '미적분 3단원' } } as never;
    expect(daySummary(d, '2026-10-29')).toEqual(['공부 40분', '수학: 미적분 3단원']);
  });
});

describe('수행평가 준비 나누기 (stepDates)', () => {
  it('남은 준비를 오늘부터 전날까지 고르게, 지났으면 모두 오늘', async () => {
    const { stepDates } = await import('./assessPlan');
    const st = (id: string, done = false) => ({ id, text: id, done });
    const a = { due: '2026-11-05', steps: [st('a', true), st('b'), st('c'), st('d'), st('e')] };
    expect([...stepDates(a, '2026-10-29')]).toEqual([
      ['b', '2026-10-29'],
      ['c', '2026-10-30'],
      ['d', '2026-11-01'],
      ['e', '2026-11-03'],
    ]);
    expect([...stepDates({ ...a, due: '2026-10-29' }, '2026-10-29').values()]).toEqual(['2026-10-29', '2026-10-29', '2026-10-29', '2026-10-29']);
  });
});

describe('시험 전 생활 (prepBefore)', () => {
  it('시험 날 전 14일의 하루 평균 공부와 평균 잠', async () => {
    const { prepBefore } = await import('./grades');
    const s = (id: string, date: string, minutes: number) => ({ id, updatedAt: 1, date, minutes, start: 0, end: 0, kind: 'manual' });
    const d = {
      sessions: { a: s('a', '2026-10-20', 140), b: s('b', '2026-10-28', 140), c: s('c', '2026-10-29', 600), e: s('e', '2026-10-01', 600) },
      conditions: { '2026-10-27': { id: '2026-10-27', updatedAt: 1, sleep: '23:00', wake: '06:00' }, '2026-10-28': { id: '2026-10-28', updatedAt: 1, sleep: '00:30', wake: '07:30' } },
    } as never;
    expect(prepBefore(d, '2026-10-29')).toEqual({ studyPerDay: 20, sleepAvg: 420, sleepDays: 2 });
  });
});

describe('이번 주에 써도 되는 돈 (weekAllowance)', () => {
  it('남은 예산에서 이번 달 남은 고정 지출을 빼고 이번 주 남은 날만큼', async () => {
    const { weekAllowance } = await import('../life/calc');
    const d = emptyStudy();
    d.settings = { ...d.settings, monthlyBudget: 300000 };
    d.moneyTx = { a: { id: 'a', updatedAt: 1, date: '2026-10-02', type: 'out', amount: 100000, category: '식비', created: 1 } } as never;
    d.moneyRules = { r: { id: 'r', updatedAt: 1, name: '통신비', type: 'out', amount: 20000, category: '통신', freq: 'monthly', day: 30, start: '2026-01-01', created: 1 } } as never;
    expect(weekAllowance(d, '2026-10-29')).toEqual({ amount: 180000, fixed: 20000, perDay: 60000 });
    // 월요일: 이번 달 남은 날 중 일요일까지 7일
    expect(weekAllowance(d, '2026-10-05')?.amount).toBe(Math.floor(180000 / 27) * 7);
    d.settings = { ...d.settings, weeklyLimit: 30000 };
    expect(weekAllowance(d, '2026-10-29')?.amount).toBe(30000);
    d.settings = { ...d.settings, monthlyBudget: undefined };
    expect(weekAllowance(d, '2026-10-29')).toBeNull();
  });
});

describe('연습 항목별 추세 (itemTrend)', () => {
  it('주마다 같은 이름 항목의 넣은 수/던진 수', async () => {
    const { itemTrend, trackedItems } = await import('../life/bb');
    const w = (id: string, date: string, items: object[]) => ({ id, updatedAt: 1, date, kind: '농구', created: 1, bb: { mode: 'practice', items } });
    const d = { workouts: { a: w('a', '2026-10-27', [{ name: '자유투', made: 7, att: 10 }]), b: w('b', '2026-10-21', [{ name: '자유투 ', made: 5, att: 10 }, { name: '드리블' }]), c: w('c', '2026-10-28', [{ name: '3점슛', made: 3, att: 10 }]) } } as never;
    const t = itemTrend(d, '자유투', '2026-10-29', 3);
    expect(t).toEqual([
      { start: '2026-10-12', m: 0, a: 0 },
      { start: '2026-10-19', m: 5, a: 10 },
      { start: '2026-10-26', m: 7, a: 10 },
    ]);
    expect(trackedItems(d)).toEqual(['자유투', '3점슛']);
  });
});

describe('약점 한 장 (weakSheet)', () => {
  it('과목의 못 푼 오답 · 한마디 · 빠뜨린 핵심 · 헷갈린 지문 · 틀린 단어를 모은다', async () => {
    const { weakSheet, isEmptySheet } = await import('./weakSheet');
    const d = emptyStudy();
    d.subjects = { en: { id: 'en', name: '영어', color: '#000', order: 1, updatedAt: 1 }, ma: { id: 'ma', name: '수학', color: '#000', order: 2, updatedAt: 1 } } as never;
    const note = (id: string, subjectId: string, wrong: number, learned = false) => ({ id, updatedAt: 1, subjectId, question: id, photos: [], myAnswer: '', answer: '', reason: 'concept', memo: '', box: 1, due: '2026-10-29', wrong, learned, created: wrong, comments: [{ id: 'c' + id, date: '2026-10-2' + wrong, text: '시제 확인' }] });
    d.notes = { a: note('a', 'en', 1), b: note('b', 'en', 3), c: note('c', 'en', 2, true), m: note('m', 'ma', 5) } as never;
    d.blanks = { k: { id: 'k', updatedAt: 1, subjectId: 'en', title: '3과', points: [{ id: 'p1', text: '관계대명사', done: false }, { id: 'p2', text: '분사', done: false }], tries: [{ id: 't', date: '2026-10-28', missed: ['p2'] }], box: 1, due: '2026-10-29', wrong: 0, created: 1 } } as never;
    d.passages = { s: { id: 's', updatedAt: 1, lang: 'en', title: 'Lesson 3', text: 'x', confusing: true, created: 1 }, t: { id: 't', updatedAt: 1, lang: 'ko', title: '관동별곡', text: 'x', confusing: true, created: 1 } } as never;
    const words = { w: { id: 'w', updatedAt: 1, listId: 'l', term: 'vivid', meaning: '생생한', order: 1, box: 1, due: '2026-10-29', wrong: 2 } } as never;
    const s = weakSheet(d, words, 'en');
    expect(s.notes.map((n) => n.id)).toEqual(['b', 'a']);
    expect(s.comments).toEqual(['시제 확인']);
    expect(s.missed).toEqual([{ title: '3과', points: ['분사'] }]);
    expect(s.passages.map((p) => p.title)).toEqual(['Lesson 3']);
    expect(s.words).toEqual([{ term: 'vivid', meaning: '생생한', wrong: 2 }]);
    expect(isEmptySheet(weakSheet(emptyStudy(), {}, 'en'))).toBe(true);
  });
});

describe('약점 한 장 알림 (weakDue)', () => {
  it('1~3일 뒤 시험 보는 가장 가까운 과목', async () => {
    const { weakDue, buildDigest } = await import('./notifyDigest');
    const d = emptyStudy();
    d.subjects = { ma: { id: 'ma', name: '수학', color: '#000', order: 1, updatedAt: 1 }, en: { id: 'en', name: '영어', color: '#000', order: 2, updatedAt: 1 } } as never;
    d.exams = { e: { id: 'e', updatedAt: 1, name: '기말', date: '2026-11-02', end: '2026-11-04', kind: 'school', scopes: [{ id: 's1', subjectId: 'ma', date: '2026-11-03', lines: [] }, { id: 's2', subjectId: 'en', date: '2026-11-02', lines: [] }] } } as never;
    expect(weakDue(d, '2026-10-29', '2026-10-29')).toBeNull();
    expect(weakDue(d, '2026-10-29', '2026-10-30')).toEqual({ subjectId: 'en', days: 3 });
    expect(weakDue(d, '2026-10-29', '2026-11-02')).toEqual({ subjectId: 'ma', days: 1 });
    const e = buildDigest(d, {}, '2026-10-30', ['07:00'], 1)[0];
    expect(e.url).toBe('/exams/weak-en');
    expect(e.body).toContain('영어 시험 D-3: 약점 한 장을 훑어보세요');
  });
});

describe('나이스 학교 정보 → 앱 자료 (school.ts)', () => {
  it('과목 맞추기 · 요일별 시간표 · 시험 묶기 · 쉬는 날', async () => {
    const { matchSubject, weekPattern, examEvents, offDays } = await import('./school');
    const subs = [
      { id: 'ma', name: '수학' },
      { id: 'ko', name: '국어' },
      { id: 'en', name: '영어' },
    ];
    expect(matchSubject('수학Ⅰ', subs)).toBe('ma');
    expect(matchSubject('영 어', subs)).toBe('en');
    expect(matchSubject('문학', subs)).toBeNull();
    const P = (date: string, period: number, subject: string) => ({ date, period, subject });
    expect(weekPattern([P('2026-10-26', 2, '영어'), P('2026-10-26', 1, '문학'), P('2026-10-27', 1, '수학Ⅰ'), P('2026-10-19', 1, '옛날')])).toEqual({ '1': ['문학', '영어'], '2': ['수학Ⅰ'] });
    const E = (date: string, name: string, off = false) => ({ date, name, off });
    expect(examEvents([E('2026-11-03', '2차 지필평가'), E('2026-11-02', '2차 지필평가'), E('2026-11-05', '2차 지필평가'), E('2026-11-19', '전국연합학력평가'), E('2026-11-10', '체육대회')])).toEqual([
      { name: '2차 지필평가', date: '2026-11-02', end: '2026-11-05' },
      { name: '전국연합학력평가', date: '2026-11-19' },
    ]);
    expect(offDays([E('2026-12-25', '성탄절', true), E('2026-11-20', '재량휴업일', true), E('2026-11-10', '체육대회')])).toEqual(['2026-11-20', '2026-12-25']);
  });
});

describe('날씨 (Open-Meteo 응답)', () => {
  it('필요한 값만 꺼내고, 모양이 다르면 null', async () => {
    const { parseWeather, weatherText } = await import('../life/weather');
    expect(parseWeather({ current: { temperature_2m: 12.6, weather_code: 61 }, daily: { temperature_2m_max: [15.2], temperature_2m_min: [8.4], precipitation_probability_max: [70] } }, 1)).toEqual({ temp: 13, code: 61, max: 15, min: 8, rain: 70, at: 1 });
    expect(parseWeather({ current: {} })).toBeNull();
    expect(weatherText(61).text).toBe('비');
    expect(weatherText(0).text).toBe('맑음');
  });
});

describe('국어 단어장 읽기 (splitKoLine)', () => {
  it('구분자 · 첫 빈칸으로 나눈다', async () => {
    const { splitKoLine, parseWords } = await import('./wordParse');
    expect(splitKoLine('어엿브다 - 불쌍하다')).toEqual({ term: '어엿브다', meaning: '불쌍하다' });
    expect(splitKoLine('1. 나랏말ᄊᆞ미: 나라의 말이')).toEqual({ term: '나랏말ᄊᆞ미', meaning: '나라의 말이' });
    expect(splitKoLine('하놀 하늘')).toEqual({ term: '하놀', meaning: '하늘' });
    expect(parseWords('어리다 어리석다\n어리다 어리석다', [], 'ko').map((r) => r.problem)).toEqual([undefined, '중복']);
  });
});

describe('모의고사 보기 (mockView)', () => {
  it('수능 시각으로 흐르고, 탐구 2과목은 사이 회수 시간까지', async () => {
    const { mockView, hhmm } = await import('./mockExam');
    const v = mockView({ key: 'korean', startedAt: 0 }, 30 * 60_000)!;
    expect(hhmm(v.clockMin)).toBe('09:10');
    expect(v.leftMs).toBe(50 * 60_000);
    expect(mockView({ key: 'korean', startedAt: 0 }, 90 * 60_000)!.done).toBe(true);
    const t = mockView({ key: 'inquiry2', startedAt: 0 }, 31 * 60_000)!;
    expect(t.part.label).toBe('제1선택 답안지 회수');
    expect(mockView({ key: 'inquiry2', startedAt: 0 }, 33 * 60_000)!.part.label).toBe('탐구 영역 · 제2선택');
  });
});

describe('하루 몫으로 계획 (paceEnd · studyDays)', () => {
  it('쉬는 요일을 빼고 센다', async () => {
    const { paceEnd, studyDays } = await import('./plan');
    const ctx = { today: '2026-10-29', settings: { ...emptyStudy().settings, restDays: [0], offDates: ['2026-10-31'] }, exams: {}, tutors: [] } as unknown as PlanCtx;
    const plan = { target: 'book' } as Plan;
    // 목 29 · 금 30 · (토 31 빼는 날) · (일 1 쉬는 요일) · 월 2
    expect(paceEnd('2026-10-29', 3, plan, ctx)).toBe('2026-11-02');
    expect(studyDays('2026-10-29', '2026-11-02', plan, ctx)).toBe(3);
  });
});

describe('자세히 보기 (insights)', () => {
  it('최장 연속 · 공부 한눈에', async () => {
    const { longestStreak, studyInsights } = await import('../life/insights');
    expect(longestStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'])).toEqual({ days: 3, from: '2026-10-01', to: '2026-10-03' });
    const d = emptyStudy();
    d.subjects = { ma: { id: 'ma', name: '수학', color: '#000', order: 1, updatedAt: 1 } } as never;
    d.sessions = { a: { id: 'a', updatedAt: 1, subjectId: 'ma', start: 0, end: 0, minutes: 90, date: '2026-10-28', kind: 'manual' }, b: { id: 'b', updatedAt: 1, subjectId: 'ma', start: 0, end: 0, minutes: 30, date: '2026-10-29', kind: 'manual' } } as never;
    const s = studyInsights(d, '2026-10-29');
    expect(s[0].stats!.find((x) => x.label === '지금까지')!.value).toBe('2시간');
    expect(s[0].stats!.find((x) => x.label === '최장 연속')!.value).toBe('2일');
    expect(s[1].ranks![0].text).toBe('2시간 · 100% · 2번 · 한 번 1시간');
  });
});
