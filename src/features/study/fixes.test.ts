// 검토에서 찾은 문제들이 다시 생기지 않게 (C번호는 검토 목록의 번호)
import { describe, expect, it } from 'vitest';
import { parseWrong } from './actions';
import { addDays } from './dates';
import { scopeLines } from './exams';
import { mergeHabitChecks, toggleHabit } from './habits';
import { mergeStudy } from './merge';
import { DEFAULT_SETTINGS, emptyStudy, type Exam, type Habit, type Plan, type StudyData, type WordList } from './model';
import { clampRange, doneSet, expand, MAX_PAGE, parseRanges } from './pages';
import { lockToday, schedule, type PlanCtx, type Target } from './plan';
import { dueToday, newToday } from './review';
import { sanitizeWords } from './sanitize';
import { cardsToday, homeworkViews, reservedPages } from './select';
import { normalize } from './store';
import { josa } from './ui';
import { testNewToday } from './wordSession';

const T0 = '2026-10-24';
const ctx = (today = T0, over: Partial<PlanCtx> = {}): PlanCtx => ({ today, settings: { ...DEFAULT_SETTINGS }, tutors: [], exams: {}, ...over });
const plan = (over: Partial<Plan> = {}): Plan => ({ id: 'p', updatedAt: 1, target: 'book', targetId: 'b', range: [[1, 20]], start: T0, due: addDays(T0, 9), includeDue: true, baseline: 2, ...over });
const target = (over: Partial<Target> = {}): Target => ({ units: [{ name: 'u', from: 1, to: 20 }], done: new Set(), reserved: new Set(), ...over });

describe('C1 시작일이 미래인 계획', () => {
  const p = plan({ start: '2026-10-30', due: '2026-11-03' });
  it('오늘 분량을 고정하지 않는다', () => {
    expect(lockToday(p, target(), ctx())).toBeNull();
  });
  it('예전에 빈 분량으로 고정됐어도 시작일부터 나눈다', () => {
    const locked: Plan = { ...p, todayLock: { date: T0, items: [] } };
    const s = schedule(locked, target(), ctx());
    expect(s.today).toEqual([]);
    expect(s.days[0].date).toBe('2026-10-30');
    expect(s.days.map((d) => d.items.length)).toEqual([4, 4, 4, 4, 4]);
  });
});

describe('C2 큰 번호', () => {
  it('범위는 0~MAX_PAGE 안으로, 멈추지 않는다', () => {
    const t0 = Date.now();
    expect(doneSet([[1, 30_000_000, 1]], []).size).toBe(MAX_PAGE);
    expect(expand([[5, 1e12]]).length).toBe(MAX_PAGE - 4);
    expect(expand([[NaN, 3]])).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(clampRange(20_000, 30_000)).toBeNull();
    expect(parseRanges('12-30, 45 x 1-99999999')).toEqual([
      [12, 30],
      [45, 45],
      [1, MAX_PAGE],
    ]);
  });
});

describe('C5 · C21 시험에 맞춘 계획', () => {
  const exam: Exam = { id: 'e', updatedAt: 1, name: '기말', date: '2026-11-10', scopes: [{ id: 's1', subjectId: 'eng', date: '2026-11-12', lines: [] }] };
  const p = plan({ due: undefined, examId: 'e', includeDue: false });
  it('시험을 지워도 지운 표시에 남은 날짜까지 나눈다 (한꺼번에 오늘로 몰지 않는다)', () => {
    const s = schedule(p, target(), ctx(T0, { exams: { e: { ...exam, deleted: true } } }));
    expect(s.warning).toBeNull();
    expect(s.end).toBe('2026-11-09');
    expect(s.today.length).toBeLessThan(5);
  });
  it('시험이 끝나면 오늘 분량 없이 「끝남」 알림, 고정도 하지 않는다', () => {
    const c = ctx('2026-11-11', { exams: { e: exam } });
    const s = schedule(p, target(), c);
    expect(s.today).toEqual([]);
    expect(s.warning).toEqual({ kind: 'ended', due: '2026-11-10' });
    expect(lockToday(p, target(), c)).toBeNull();
  });
  it('그 과목 시험 날이 따로 있으면 그날까지', () => {
    expect(schedule(p, target({ subjectId: 'eng' }), ctx(T0, { exams: { e: exam } })).end).toBe('2026-11-11');
    expect(schedule(p, target({ subjectId: 'math' }), ctx(T0, { exams: { e: exam } })).end).toBe('2026-11-09');
  });
});

describe('C7 지운 과외의 숙제', () => {
  it('오늘 화면·계획에서 빠진다', () => {
    const d = emptyStudy();
    d.tutors.t = { id: 't', updatedAt: 1, name: '수학', subjectId: 's', weekdays: [1], cancelled: [], extra: [], deleted: true };
    d.homework.h = { id: 'h', updatedAt: 1, tutorId: 't', given: T0, due: addDays(T0, 3), dueManual: true, includeDue: false, note: '', items: [{ id: 'i', kind: 'pages', bookId: 'b', range: [1, 5] }] };
    expect(homeworkViews(d, T0)).toEqual([]);
    expect(reservedPages(d, 'b').size).toBe(0);
  });
});

describe('C14 두 기기에서 따로 고친 것 합치기', () => {
  it('시험 범위 체크가 다른 기기의 시험 고침에 묻히지 않는다', () => {
    const a = emptyStudy();
    const b = emptyStudy();
    a.exams.e = { id: 'e', name: 'x', date: '2026-11-20', updatedAt: 100, scopes: [{ id: 's1', subjectId: 'm', lines: [{ id: 'l1', text: 'a', done: true, at: 100 }] }] };
    b.exams.e = { id: 'e', name: 'x2', date: '2026-11-20', updatedAt: 200, scopes: [{ id: 's1', subjectId: 'm', lines: [{ id: 'l1', text: 'a', done: false }] }, { id: 's2', subjectId: 'k', lines: [] }] };
    const m = mergeStudy(a, b).exams.e;
    expect(m.name).toBe('x2');
    expect(m.scopes!.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(m.scopes![0].lines[0].done).toBe(true);
  });
  it('습관: 두 기기에서 다른 날을 체크해도 둘 다, 해제도 늦은 쪽', () => {
    const h: Habit = { id: 'h', updatedAt: 1, name: '운동', icon: '', weekdays: [], checks: ['2026-10-01'], created: '2026-09-01' };
    const a = { ...toggleHabit(h, '2026-10-20', 100), updatedAt: 100 };
    const b = { ...toggleHabit(toggleHabit(h, '2026-10-21', 200), '2026-10-01', 210), updatedAt: 210 };
    const da = emptyStudy();
    const db = emptyStudy();
    da.habits.h = a;
    db.habits.h = b;
    expect(mergeStudy(da, db).habits.h.checks).toEqual(['2026-10-20', '2026-10-21']);
    // 기록 없는 옛 자료끼리는 합집합
    expect(mergeHabitChecks({ checks: ['2026-10-01'] }, { checks: ['2026-10-02'] }).checks).toEqual(['2026-10-01', '2026-10-02']);
  });
  it('숙제 줄·학교 진도도 줄마다', () => {
    const a = emptyStudy();
    const b = emptyStudy();
    a.homework.h = { id: 'h', updatedAt: 100, tutorId: 't', given: T0, due: T0, dueManual: true, includeDue: false, note: '', items: [{ id: 'i1', kind: 'text', text: '오답', done: true, at: 100 }] };
    b.homework.h = { ...a.homework.h, updatedAt: 200, note: '메모', items: [{ id: 'i1', kind: 'text', text: '오답', at: 50 }] };
    a.subjects.s = { id: 's', updatedAt: 300, name: '수학', color: '#000', order: 0, progress: [{ date: '2026-10-20', text: '2단원', at: 300 }] };
    b.subjects.s = { id: 's', updatedAt: 400, name: '수학', color: '#111', order: 0, progress: [{ date: '2026-10-20', text: '1단원', at: 10 }] };
    const m = mergeStudy(a, b);
    expect(m.homework.h.note).toBe('메모');
    expect(m.homework.h.items[0].done).toBe(true);
    expect(m.subjects.s.color).toBe('#111');
    expect(m.subjects.s.progress![0].text).toBe('2단원');
  });
});

describe('C16 잘못된 자료 다듬기', () => {
  it('단원 없는 문제집·이상한 체크·날짜 없는 시험', () => {
    const bad = {
      books: { b: { id: 'b', updatedAt: 1, name: '쎈', subjectId: 's', done: [[1, 30_000_000, 5], 'x', [1, 2]] }, x: 'nope' },
      exams: { e: { id: 'e', updatedAt: 1, name: 'x', date: 'soon' } },
      plans: { p: { id: 'p', updatedAt: 1, target: 'book', targetId: 'b', range: [[1, 1e9], 'x'], start: T0, includeDue: true, baseline: 1 } },
      settings: { intervals: 'x', pomo: { work: -5 } },
    } as unknown as StudyData;
    const d = normalize(bad);
    expect(d.books.b.units).toEqual([]);
    expect(d.books.b.done).toEqual([[1, MAX_PAGE, 5]]);
    expect(d.books.x).toBeUndefined();
    expect(d.exams.e).toBeUndefined();
    expect(d.plans.p.range).toEqual([[1, MAX_PAGE]]);
    expect(d.settings.intervals).toEqual(DEFAULT_SETTINGS.intervals);
    expect(d.settings.pomo.work).toBe(1);
    expect(d.todos).toEqual({});
  });
  it('뜻이 없거나 모양이 틀린 단어', () => {
    const w = sanitizeWords({ a: { id: 'a', term: 'apple', listId: 'L', updatedAt: 1 }, b: { id: 'b', term: 3 }, c: null });
    expect(Object.keys(w)).toEqual(['a']);
    expect(w.a).toMatchObject({ meaning: '', box: 0, wrong: 0, order: 0 });
  });
  it('옛 자료는 그대로', () => {
    const d = emptyStudy();
    d.todos.t = { id: 't', updatedAt: 5, title: '숙제', done: false, created: 1, star: true };
    d.plans.p = plan({ todayLock: { date: T0, items: [1, 2] } });
    const n = normalize(JSON.parse(JSON.stringify(d)));
    expect(JSON.parse(JSON.stringify(n))).toEqual(JSON.parse(JSON.stringify(d)));
  });
});

describe('C18 새 암기 카드', () => {
  it('오늘 볼 카드에 하루 정한 수만큼 새 카드가 들어간다', () => {
    const d = emptyStudy();
    for (let i = 0; i < 30; i++) d.cards[`c${i}`] = { id: `c${i}`, updatedAt: i, deckId: 'k', front: `${i}`, back: 'x', box: 0, due: T0, wrong: 0, created: i };
    expect(cardsToday(d, T0).length).toBe(20);
    expect(cardsToday(d, T0)[0].id).toBe('c0');
    d.cards.c0 = { ...d.cards.c0, box: 1, firstSeen: T0, due: addDays(T0, 1) };
    expect(newToday(Object.values(d.cards), T0).length).toBe(19);
  });
});

describe('C30 틀린 번호', () => {
  it('쪽을 쓰면 그 쪽, 안 쓰면 쪽 없이', () => {
    expect(parseWrong('3, 7')).toEqual([{ number: '3' }, { number: '7' }]);
    expect(parseWrong('p.37 5번 6 p38 2번 40쪽 1')).toEqual([
      { page: 37, number: '5' },
      { page: 37, number: '6' },
      { page: 38, number: '2' },
      { page: 40, number: '1' },
    ]);
    expect(parseWrong('p. 12 3')).toEqual([{ page: 12, number: '3' }]);
  });
});

describe('C31 같은 글의 범위 줄', () => {
  it('줄마다 따로 (하나를 체크해도 다른 줄은 그대로)', () => {
    const prev = [
      { id: 'a', text: '프린트', done: true },
      { id: 'b', text: '프린트', done: false },
    ];
    const lines = scopeLines('프린트\n프린트\n프린트', prev);
    expect(lines.map((l) => l.id).slice(0, 2)).toEqual(['a', 'b']);
    expect(lines[2].id).not.toBe('a');
    expect(lines[2].id).not.toBe('b');
    expect(lines.map((l) => l.done)).toEqual([true, false, false]);
  });
});

describe('C32 · C33 영단어', () => {
  it('지난 단어 시험은 새 단어를 내지 않는다', () => {
    const list: WordList = { id: 'L', updatedAt: 1, name: 't', kind: 'test', subjectId: '', done: [], undone: [], testDate: '2026-10-20' };
    const w = { id: 'w', updatedAt: 1, listId: 'L', term: 'a', meaning: 'b', order: 1, box: 0, due: T0, wrong: 0 };
    expect(testNewToday(list, [w], T0)).toEqual([]);
  });
  it('복습은 하루 50개까지 (100개와 101개가 뒤집히지 않게)', () => {
    const many = (n: number) => Array.from({ length: n }, () => ({ box: 1, due: T0, wrong: 0 }));
    expect(dueToday(many(100), T0).length).toBe(50);
    expect(dueToday(many(101), T0).length).toBe(50);
    expect(dueToday(many(30), T0).length).toBe(30);
  });
});

describe('C48 조사', () => {
  it('받침에 따라', () => {
    expect(josa('수학', '을', '를')).toBe('을');
    expect(josa('「이 오답」', '을', '를')).toBe('을');
    expect(josa('과외', '을', '를')).toBe('를');
    expect(josa('Day 3', '을', '를')).toBe('을');
    expect(josa('apple', '을', '를')).toBe('을(를)');
  });
});
