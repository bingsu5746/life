import { describe, expect, it } from 'vitest';
import { apportion, slice, snapToUnits } from './allocate';
import { addDays, daysBetween, diffDays, studyDate, weekday } from './dates';
import { bestStreak, streak } from './habits';
import { mergeStudy, mergeWords } from './merge';
import { DEFAULT_SETTINGS, emptyStudy, type Exam, type Review, type Plan, type Tutor, type Word, type WordList } from './model';
import { compress, doneSet, expand, rangeText } from './pages';
import { baselineOf, lockToday, schedule, type PlanCtx, type Target } from './plan';
import { answer, dueToday } from './review';
import { finish, nextPhase, start, view } from './timer';
import { parseToc } from './toc';
import { homeworkDue, nextClass } from './tutor';
import { parseWords, splitWordLine, wordsText } from './wordParse';
import { pageToText, type TextPiece } from './wordPdf';
import { choicesFor, firstAnswer, inboxNewToday, requeue, testNewToday } from './wordSession';

const T0 = '2026-10-19'; // 월요일

function ctx(today = T0, over: Partial<PlanCtx> = {}): PlanCtx {
  return { today, settings: { ...DEFAULT_SETTINGS }, tutors: [], exams: {}, ...over };
}
function plan(over: Partial<Plan> = {}): Plan {
  return { id: 'p', updatedAt: 1, target: 'book', targetId: 'b', range: [[1, 40]], start: T0, due: addDays(T0, 4), includeDue: true, baseline: 8, ...over };
}
const target = (done: number[] = [], units = [{ name: '전체', from: 1, to: 40 }]): Target => ({ units, done: new Set(done), reserved: new Set() });
const tutor = (weekdays: number[], over: Partial<Tutor> = {}): Tutor => ({ id: 't', updatedAt: 1, name: '수학', subjectId: 's', weekdays, cancelled: [], extra: [], ...over });

describe('dates', () => {
  it('하루 시작 시각 전은 전날', () => {
    expect(studyDate(new Date(2026, 9, 23, 3, 59), 4)).toBe('2026-10-22');
    expect(studyDate(new Date(2026, 9, 23, 4, 0), 4)).toBe('2026-10-23');
    expect(studyDate(new Date(2026, 9, 23, 0, 30), 0)).toBe('2026-10-23');
  });
  it('월말·연말·윤년', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(diffDays('2026-12-30', '2027-01-02')).toBe(3);
    expect(weekday('2026-10-23')).toBe(5);
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('pages', () => {
  it('범위 ↔ 번호', () => {
    expect(expand([[3, 5], [4, 7]])).toEqual([3, 4, 5, 6, 7]);
    expect(compress([1, 2, 3, 7, 9, 10])).toEqual([[1, 3], [7, 7], [9, 10]]);
    expect(rangeText([34, 35, 36, 40], '쪽')).toBe('34~36쪽, 40쪽');
  });
  it('체크 기록: 가장 늦은 기록이 이긴다', () => {
    const s = doneSet([[1, 10, 100], [5, 6, 300]], [[4, 8, 200]]);
    expect([...s].sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 6, 9, 10]);
  });
});

describe('allocate', () => {
  it('40쪽 5일 → 8쪽씩, 41쪽 → 9,8,8,8,8', () => {
    expect(apportion(40, [1, 1, 1, 1, 1])).toEqual([8, 8, 8, 8, 8]);
    expect(apportion(41, [1, 1, 1, 1, 1])).toEqual([9, 8, 8, 8, 8]);
  });
  it('쉬는 날 0, 과외 날 절반', () => {
    expect(apportion(30, [1, 0, 0.5, 1])).toEqual([12, 0, 6, 12]);
  });
  it('무작위 입력에서도 합이 맞고, 무게가 같은 날끼리 차이는 1 이하', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 200; k++) {
      const n = Math.floor(rnd() * 500);
      const w = Array.from({ length: 1 + Math.floor(rnd() * 30) }, () => [0, 0.5, 1][Math.floor(rnd() * 3)]);
      const c = apportion(n, w);
      const total = w.reduce((a, b) => a + b, 0);
      expect(c.reduce((a, b) => a + b, 0)).toBe(total > 0 ? n : 0);
      const ones = c.filter((_, i) => w[i] === 1);
      if (ones.length) expect(Math.max(...ones) - Math.min(...ones)).toBeLessThanOrEqual(1);
      c.forEach((x, i) => w[i] === 0 && expect(x).toBe(0));
    }
  });
  it('단원 끝 맞추기는 합을 바꾸지 않는다', () => {
    // 1~10, 11~21, 22~30 단원, 30쪽을 3일: 10,10,10 → 첫날 끝(10)은 단원 끝, 둘째 날 끝(20)은 단원 끝(21)에서 1쪽 → 21 로
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const ends = new Set([10, 21, 30]);
    const c = snapToUnits([10, 10, 10], (k) => ends.has(items[k]), 30);
    expect(c).toEqual([10, 11, 9]);
    expect(slice(items, c)[1]).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });
});

describe('plan', () => {
  it('오늘 분량과 다음 날들', () => {
    const s = schedule(plan(), target(), ctx());
    expect(s.today).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.days.map((d) => d.items.length)).toEqual([8, 8, 8, 8]);
    expect(s.warning).toBeNull();
  });
  it('이틀 안 하면 남은 날 분량이 늘고, 더 하면 준다', () => {
    const late = schedule(plan(), target(), ctx(addDays(T0, 2)));
    expect(late.today.length).toBe(14);
    expect(late.days.map((d) => d.items.length)).toEqual([13, 13]);
    const ahead = schedule(plan(), target(expand([[1, 20]])), ctx(addDays(T0, 1)));
    expect(ahead.today).toEqual(expand([[21, 25]]));
  });
  it('오늘 분량은 고정: 오늘 중에 더 해도 그대로, 내일 이후만 준다', () => {
    const c = ctx();
    const locked = lockToday(plan(), target(), c)!;
    expect(locked.todayLock).toEqual({ date: T0, items: [1, 2, 3, 4, 5, 6, 7, 8] });
    const s = schedule(locked, target(expand([[1, 16]])), c);
    expect(s.today).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.days.reduce((a, d) => a + d.items.length, 0)).toBe(24);
    expect(lockToday(locked, target(), c)).toBeNull();
  });
  it('다음 날: 지난번 못 한 양을 carried 로 남긴다', () => {
    const locked = lockToday(plan(), target(), ctx())!;
    const next = lockToday(locked, target([1, 2, 3]), ctx(addDays(T0, 1)))!;
    expect(next.carried).toEqual({ date: addDays(T0, 1), count: 5 });
    expect(next.todayLock!.items[0]).toBe(4);
  });
  it('쉬는 요일·빼는 날짜·과외 날', () => {
    // 월~금(T0~T0+4), 수요일 쉬기, 목요일 빼기, 화요일 과외(절반)
    const c = ctx(T0, { settings: { ...DEFAULT_SETTINGS, restDays: [3], offDates: [addDays(T0, 3)] }, tutors: [tutor([2])] });
    const s = schedule(plan({ range: [[1, 25]] }), target(), c);
    const all = [s.today.length, ...s.days.map((d) => d.items.length)];
    expect(all).toEqual([10, 5, 0, 0, 10]);
  });
  it('푼 페이지·숙제 페이지를 건너뛰어 두 조각이 될 수 있다', () => {
    const t = { ...target([3, 4]), reserved: new Set([6, 7]) };
    const s = schedule(plan({ range: [[1, 12]], due: T0 }), t, ctx());
    expect(rangeText(s.today)).toBe('1~2, 5, 8~12');
  });
  it('마감 지남 / 남은 날이 전부 쉬는 날 → 경고, 오류 없음', () => {
    const over = schedule(plan(), target(), ctx(addDays(T0, 10)));
    expect(over.warning?.kind).toBe('overdue');
    expect(over.today.length).toBe(40);
    const c = ctx(T0, { settings: { ...DEFAULT_SETTINGS, restDays: [0, 1, 2, 3, 4, 5, 6] } });
    expect(schedule(plan(), target(), c).warning?.kind).toBe('nodays');
  });
  it('과외 날(무게가 작은 날)만으로는 경고하지 않는다', () => {
    const c = ctx(T0, { tutors: [tutor([1, 2, 3, 4, 5])] });
    const p = plan({ range: [[1, 40]], due: addDays(T0, 9) });
    expect(schedule({ ...p, baseline: baselineOf(p, target(), c) }, target(), c).warning).toBeNull();
  });
  it('너무 많아지면 경고', () => {
    const s = schedule(plan({ baseline: 8 }), target(), ctx(addDays(T0, 3)));
    expect(s.warning).toEqual({ kind: 'over', perDay: 20, baseline: 8 });
    expect(schedule(plan({ dailyMax: 5 }), target(), ctx()).warning?.kind).toBe('max');
  });
  it('시험 마감은 시험 전날까지 (includeDue=false)', () => {
    const exams: Record<string, Exam> = { e: { id: 'e', updatedAt: 1, name: '기말', date: addDays(T0, 4) } };
    const p = plan({ examId: 'e', due: undefined, includeDue: false });
    const s = schedule(p, target(), ctx(T0, { exams }));
    expect(s.end).toBe(addDays(T0, 3));
    expect(s.today.length).toBe(10);
    expect(baselineOf(p, target(), ctx(T0, { exams }))).toBe(10);
  });
  it('시작일이 미래면 오늘 분량 없음', () => {
    const s = schedule(plan({ start: addDays(T0, 1) }), target(), ctx());
    expect(s.today).toEqual([]);
    expect(s.days[0].items.length).toBe(10);
  });
});

describe('toc', () => {
  it('여러 줄 형식', () => {
    const rows = parseToc(['1. 집합 12-30', '2 명제 31~52', 'Ⅲ. 함수 ........ 53', '부록 200'].join('\n'), 220);
    expect(rows.map((r) => [r.name, r.from, r.to])).toEqual([
      ['1. 집합', 12, 30],
      ['2 명제', 31, 52],
      ['Ⅲ. 함수', 53, 199],
      ['부록', 200, 220],
    ]);
    expect(rows.every((r) => !r.problem)).toBe(true);
  });
  it('총 페이지만, 줄표 종류, 문제 표시', () => {
    expect(parseToc('1-240')[0]).toMatchObject({ from: 1, to: 240 });
    expect(parseToc('단원 정리 10 – 12')[0]).toMatchObject({ name: '단원 정리', from: 10, to: 12 });
    expect(parseToc('가 10-5')[0].problem).toBeTruthy();
    expect(parseToc('가 1-10\n나 8-12')[1].problem).toBe('앞 단원과 페이지가 겹쳐요');
    expect(parseToc('머리말')[0].problem).toBe('페이지를 못 찾았어요');
    expect(parseToc('가 5')[0].problem).toBe('끝 페이지를 알려 주세요');
  });
});

describe('tutor', () => {
  it('휴강 건너뛰기, 보강 포함', () => {
    const t = tutor([2, 5]); // 화·금
    expect(nextClass(t, T0)).toBe('2026-10-20');
    expect(nextClass({ ...t, cancelled: ['2026-10-20'] }, T0)).toBe('2026-10-23');
    expect(nextClass({ ...t, extra: ['2026-10-19'] }, '2026-10-18')).toBe('2026-10-19');
    expect(nextClass(t, '2026-10-20', true)).toBe('2026-10-20');
    expect(nextClass(tutor([]), T0)).toBeNull();
  });
  it('숙제 마감: 직접 바꾼 마감은 그대로', () => {
    const t = tutor([2, 5], { cancelled: ['2026-10-20'] });
    expect(homeworkDue({ given: T0, due: '2026-10-20', dueManual: false }, t)).toBe('2026-10-23');
    expect(homeworkDue({ given: T0, due: '2026-10-20', dueManual: true }, t)).toBe('2026-10-20');
  });
});

describe('review', () => {
  const r: Review = { box: 0, due: T0, wrong: 0 };
  it('상자 오르내리기, 5번 → 익힘', () => {
    let x = answer(r, true, 'card', T0, DEFAULT_SETTINGS.intervals);
    expect(x).toMatchObject({ box: 1, due: addDays(T0, 1) });
    for (let i = 0; i < 4; i++) x = answer(x, true, 'card', T0, DEFAULT_SETTINGS.intervals);
    expect(x).toMatchObject({ box: 5, due: addDays(T0, 30), learned: false });
    x = answer(x, true, 'card', T0, DEFAULT_SETTINGS.intervals);
    expect(x.learned).toBe(true);
    expect(answer(x, false, 'card', T0, DEFAULT_SETTINGS.intervals)).toMatchObject({ box: 1, wrong: 1, learned: false });
  });
  it('객관식은 3번 상자까지만', () => {
    expect(answer({ ...r, box: 2 }, true, 'quiz', T0, DEFAULT_SETTINGS.intervals).box).toBe(3);
    expect(answer({ ...r, box: 3 }, true, 'quiz', T0, DEFAULT_SETTINGS.intervals).box).toBe(3);
    expect(answer({ ...r, box: 4 }, true, 'quiz', T0, DEFAULT_SETTINGS.intervals).box).toBe(4);
    expect(answer({ ...r, box: 3 }, true, 'card', T0, DEFAULT_SETTINGS.intervals).box).toBe(4);
  });
  it('하루 50개까지, 오래 밀린 것부터', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ box: 1, due: addDays(T0, -(i % 5)), wrong: 0 }));
    expect(dueToday(many, T0).length).toBe(50);
    expect(dueToday(many, T0)[0].due).toBe(addDays(T0, -4));
    expect(dueToday(many.slice(0, 40), T0).length).toBe(40);
  });
});

describe('wordParse', () => {
  it('줄 형식', () => {
    expect(splitWordLine('apple 사과')).toEqual({ term: 'apple', meaning: '사과' });
    expect(splitWordLine('apple - 사과, 사과나무')).toEqual({ term: 'apple', meaning: '사과, 사과나무' });
    expect(splitWordLine('1. give up 포기하다')).toEqual({ term: 'give up', meaning: '포기하다' });
    expect(splitWordLine('abandon\t(동) 버리다')).toEqual({ term: 'abandon', meaning: '(동) 버리다' });
    expect(splitWordLine('abandon: v. 버리다')).toEqual({ term: 'abandon', meaning: 'v. 버리다' });
    expect(splitWordLine('12\tresilience\t회복력')).toEqual({ term: 'resilience', meaning: '회복력' });
    expect(splitWordLine('well-known [wélnóun] 잘 알려진')).toEqual({ term: 'well-known', meaning: '잘 알려진' });
    expect(splitWordLine('abandon v. 버리다')).toEqual({ term: 'abandon', meaning: 'v. 버리다' });
  });
  it('Day 줄, 뜻 없는 줄, 중복', () => {
    const ws = parseWords('Day 3\napple 사과\nresilience\nDAY 04\nApple 사과', ['banana']);
    expect(ws.map((w) => [w.term, w.day, w.problem])).toEqual([
      ['apple', 3, undefined],
      ['resilience', 3, '뜻이 비어 있어요'],
      ['Apple', 4, '중복'],
    ]);
    expect(wordsText([{ term: 'a', meaning: '가', day: 1 }, { term: 'b', meaning: '나', day: 2 }])).toBe('Day 1\na\t가\nDay 2\nb\t나');
  });
});

describe('wordPdf', () => {
  const p = (str: string, x: number, y: number, w = str.length * 6): TextPiece => ({ str, x, y, w, h: 10 });
  it('단어 칸 / 뜻 칸 → 탭', () => {
    const t = pageToText([p('Day 1', 50, 800), p('apple', 50, 780), p('사과', 200, 780), p('give up', 50, 760), p('포기하다', 200, 760)], 600);
    expect(t).toBe('Day 1\napple\t사과\ngive up\t포기하다');
    expect(parseWords(t).map((w) => [w.term, w.meaning, w.day])).toEqual([
      ['apple', '사과', 1],
      ['give up', '포기하다', 1],
    ]);
  });
  it('두 단은 왼쪽 단을 먼저, 넘어간 뜻은 앞 줄에 붙이고, 예문은 뺀다', () => {
    const ps: TextPiece[] = [];
    const L = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
    const R = ['golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];
    L.forEach((w, i) => ps.push(p(w, 40, 800 - i * 30), p('뜻' + i, 140, 800 - i * 30)));
    R.forEach((w, i) => ps.push(p(w, 340, 800 - i * 30), p('뜻R' + i, 440, 800 - i * 30)));
    ps.push(p('이어지는 뜻', 140, 785));
    ps.push(p('This is an example sentence.', 40, 615, 170));
    const t = pageToText(ps, 600);
    const lines = t.split('\n');
    expect(lines[0]).toBe('alpha\t뜻0 이어지는 뜻');
    expect(lines.slice(0, 6).map((l) => l.split('\t')[0])).toEqual(L);
    expect(lines.slice(6).map((l) => l.split('\t')[0])).toEqual(R);
    expect(t).not.toContain('example');
  });
});

describe('wordSession', () => {
  const w = (id: string, term: string, meaning: string, over: Partial<Word> = {}): Word => ({ id, updatedAt: 1, listId: 'L', term, meaning, order: Number(id.replace(/\D/g, '')) || 0, box: 0, due: T0, wrong: 0, ...over });
  it('틀린 단어는 세션 안에서 다시', () => {
    expect(requeue(['a', 'b', 'c', 'd', 'e'], false)).toEqual(['b', 'c', 'd', 'a', 'e']);
    expect(requeue(['a', 'b'], false)).toEqual(['b', 'a']);
    expect(requeue(['a', 'b'], true)).toEqual(['b']);
  });
  it('객관식 보기: 같은 뜻은 빼고, 후보가 모자라면 null', () => {
    const pool = [w('w1', 'big', '큰'), w('w2', 'large', '큰'), w('w3', 'small', '작은'), w('w4', 'red', '빨간'), w('w5', 'blue', '파란')];
    const c = choicesFor(pool[0], pool, () => 0.3)!;
    expect(c).toHaveLength(4);
    expect(c.filter((x) => x === '큰')).toHaveLength(1);
    expect(choicesFor(pool[0], pool.slice(0, 3))).toBeNull();
  });
  it('시험 대비는 상자를 올리지 않는다, 처음 맞히면 1번 상자', () => {
    const x = w('w1', 'a', '가', { box: 2, due: T0 });
    expect(firstAnswer(x, true, 'card', 'prep', T0, DEFAULT_SETTINGS).box).toBe(2);
    expect(firstAnswer(x, false, 'card', 'prep', T0, DEFAULT_SETTINGS).box).toBe(1);
    expect(firstAnswer(w('w2', 'b', '나'), true, 'quiz', 'learn', T0, DEFAULT_SETTINGS)).toMatchObject({ box: 1, firstSeen: T0 });
  });
  it('단어 시험: 이틀 전까지 나누기, 하루 안에서는 수가 그대로', () => {
    const list: WordList = { id: 'L', updatedAt: 1, name: '학원', kind: 'test', subjectId: 's', done: [], undone: [], testDate: addDays(T0, 6) };
    const words = Array.from({ length: 50 }, (_, i) => w('w' + i, 'x' + i, '뜻' + i));
    // 오늘~시험 이틀 전 = 5일 → 10개씩
    expect(testNewToday(list, words, T0).length).toBe(10);
    const after = words.map((x, i) => (i < 4 ? { ...x, box: 1, firstSeen: T0 } : x));
    expect(testNewToday(list, after, T0).length).toBe(6);
    expect(testNewToday(list, words, addDays(T0, 5)).length).toBe(50);
    expect(inboxNewToday(after, T0, 10).length).toBe(6);
  });
});

describe('merge', () => {
  it('늦게 고친 쪽, 지운 표시, 진도는 합집합', () => {
    const a = emptyStudy();
    const b = emptyStudy();
    a.subjects.s = { id: 's', updatedAt: 5, name: '수학', color: '#f00', order: 0 };
    b.subjects.s = { id: 's', updatedAt: 9, name: '수학2', color: '#f00', order: 0 };
    a.exams.e = { id: 'e', updatedAt: 5, name: '기말', date: T0, deleted: true };
    b.exams.e = { id: 'e', updatedAt: 4, name: '기말', date: T0 };
    a.books.b = { id: 'b', updatedAt: 5, name: '쎈', subjectId: 's', units: [], done: [[1, 5, 10]], undone: [] };
    b.books.b = { id: 'b', updatedAt: 3, name: '쎈(옛)', subjectId: 's', units: [], done: [[6, 9, 11]], undone: [[2, 2, 12]] };
    const m = mergeStudy(a, b, 100);
    expect(m.subjects.s.name).toBe('수학2');
    expect(m.exams.e.deleted).toBe(true);
    expect(m.books.b.name).toBe('쎈');
    expect([...doneSet(m.books.b.done, m.books.b.undone)].sort((x, y) => x - y)).toEqual([1, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('60일 지난 지운 표시는 정리', () => {
    const a = emptyStudy();
    a.exams.e = { id: 'e', updatedAt: 0, name: 'x', date: T0, deleted: true };
    expect(mergeStudy(a, emptyStudy(), 61 * 86_400_000).exams.e).toBeUndefined();
    expect(mergeWords({}, { x: { id: 'x', updatedAt: 1, listId: 'L', term: 'a', meaning: '', order: 0, box: 0, due: T0, wrong: 0 } }).x.term).toBe('a');
  });
});

describe('timer', () => {
  const pomo = DEFAULT_SETTINGS.pomo;
  it('새로고침 뒤에도 남은 시간이 맞다 (시작 시각으로 계산)', () => {
    const t = start('pomo', '수학', 0);
    expect(view(t, 10 * 60_000, pomo).shownMs).toBe(15 * 60_000);
    expect(view(JSON.parse(JSON.stringify(t)), 26 * 60_000, pomo)).toMatchObject({ finished: true, overMs: 60_000 });
  });
  it('뽀모도로 순서: 공부 → 짧은 휴식 … 4번째 공부 뒤 긴 휴식', () => {
    let t = start('pomo', '', 0);
    const phases: string[] = [];
    let now = 0;
    for (let i = 0; i < 8; i++) {
      now += 30 * 60_000;
      t = nextPhase(t, now, pomo).state;
      phases.push(t.phase);
    }
    expect(phases).toEqual(['short', 'work', 'short', 'work', 'short', 'work', 'long', 'work']);
    expect(finish(t, now + 10 * 60_000, pomo)).toBe(4 * 25 + 10);
  });
});

describe('habits', () => {
  it('연속 일수: 하지 않는 요일은 건너뛰고, 오늘 아직 안 했어도 끊기지 않음', () => {
    const h = { weekdays: [1, 3, 5], checks: ['2026-10-12', '2026-10-14', '2026-10-16'], created: '2026-10-01' };
    expect(streak(h, '2026-10-19')).toBe(3);
    expect(streak({ ...h, checks: [...h.checks, '2026-10-19'] }, '2026-10-19')).toBe(4);
    expect(streak(h, '2026-10-21')).toBe(0);
    expect(bestStreak({ ...h, checks: [...h.checks, '2026-10-19'] }, '2026-10-21')).toBe(4);
  });
});

describe('시험 범위', () => {
  it('줄 나누기와 체크 유지, 진행·끝나는 날', async () => {
    const { scopeLines, examProgress, examEnd, nextSubjects, addProgress } = await import('./exams');
    const a = scopeLines('- 교과서 12~80쪽\n\n2) 프린트 1~5\n학습지');
    expect(a.map((l) => l.text)).toEqual(['교과서 12~80쪽', '프린트 1~5', '학습지']);
    a[1].done = true;
    const b = scopeLines('교과서 12~80쪽\n프린트 1~5\n노트 정리', a);
    expect(b.map((l) => l.done)).toEqual([false, true, false]);
    const exam = { id: 'e', updatedAt: 1, name: '기말', date: '2026-12-01', scopes: [
      { id: 's1', subjectId: 'm', lines: b },
      { id: 's2', subjectId: 'k', date: '2026-12-03', lines: [{ id: 'x', text: 'a', done: true }] },
    ] };
    expect(examProgress(exam)).toEqual({ done: 2, total: 4 });
    expect(examEnd(exam)).toBe('2026-12-03');
    expect(nextSubjects(exam, '2026-12-02').map((s) => s.id)).toEqual(['s2']);
    expect(addProgress([{ date: '2026-10-01', text: 'a' }], '2026-10-01', 'b', 7)).toEqual([{ date: '2026-10-01', text: 'b', at: 7 }]);
  });
});
