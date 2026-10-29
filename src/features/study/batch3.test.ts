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
    expect(hoop.some((x) => x.id === 'ft')).toBe(true);
    expect(hoop.some((x) => x.area === 'three')).toBe(true);
    expect(totalMinutes(hoop)).toBeLessThanOrEqual(55);
    const none = buildSession({ minutes: 30, have: 'any', weak: [{ area: 'ft', why: '' }], salt: 2, maxLevel: 3 });
    expect(none.every((x) => x.need === 'any')).toBe(true);
    expect(none.length).toBeGreaterThan(0);
    expect(buildSession({ minutes: 30, have: 'hoop', weak: [], salt: 5, maxLevel: 2 }).map((x) => x.id)).toEqual(buildSession({ minutes: 30, have: 'hoop', weak: [], salt: 5, maxLevel: 2 }).map((x) => x.id));
  });
});
