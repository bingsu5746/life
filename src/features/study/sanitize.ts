// 저장된 자료(이 기기·서버·백업 파일) 다듬기: 빠진 칸은 채우고, 모양이 틀린 항목은 버린다.
// 한 기기에서 잘못 들어간 자료가 동기화로 모든 기기의 화면을 멈추게 하지 않도록, 읽을 때마다 거친다.
import { isDate } from './dates';
import { DEFAULT_SETTINGS, type Collection, type DateStr, type Id, type Mark, type Range, type StudyData, type StudySettings, type Word, type WordsData } from './model';
import { clampRange, MAX_DAYS } from './pages';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fb = '') => (typeof v === 'string' ? v : fb);
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown) => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** 점수 칸: 범위 밖이면 버린다 */
const score = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const optDate = (v: unknown): DateStr | undefined => (isDate(v) ? v : undefined);
const dates = (v: unknown): DateStr[] => arr(v).filter(isDate);
const ints = (v: unknown, lo: number, hi: number): number[] => arr(v).filter((x): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi);

function range(v: unknown): Range | null {
  return Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number' ? clampRange(v[0], v[1]) : null;
}
const ranges = (v: unknown): Range[] => arr(v).map(range).filter((r): r is Range => !!r);
function marks(v: unknown): Mark[] {
  const out: Mark[] = [];
  for (const m of arr(v)) {
    const r = range(m);
    const at = Array.isArray(m) ? m[2] : undefined;
    if (r && typeof at === 'number' && Number.isFinite(at)) out.push([r[0], r[1], at]);
  }
  return out;
}

/** 다시 보기 상자 칸 (오답·카드·단어) */
function review(x: Obj) {
  return { box: Math.max(0, Math.round(num(x.box))), due: optDate(x.due) ?? '2000-01-01', wrong: Math.max(0, num(x.wrong)), learned: x.learned === true ? true : undefined };
}

type Fix = (x: Obj) => Obj | null;

const FIX: Record<Collection, Fix> = {
  subjects: (x) => ({
    ...x,
    name: str(x.name, '과목'),
    color: str(x.color, '#71717a'),
    order: num(x.order),
    weeklyGoal: optNum(x.weeklyGoal),
    progress: x.progress === undefined ? undefined : arr(x.progress).filter((p): p is Obj => isObj(p) && isDate(p.date) && typeof p.text === 'string'),
  }),
  exams: (x) =>
    isDate(x.date)
      ? {
          ...x,
          name: str(x.name, '시험'),
          end: isDate(x.end) && x.end > x.date ? x.end : undefined,
          kind: x.kind === 'school' || x.kind === 'mock' || x.kind === 'other' ? x.kind : undefined,
          days:
            x.days === undefined
              ? undefined
              : arr(x.days)
                  .filter((d): d is Obj => isObj(d) && isDate(d.date))
                  .map((d) => ({ date: d.date as DateStr, subjectIds: arr(d.subjectIds).filter((i): i is string => typeof i === 'string'), at: optNum(d.at) })),
          scopes:
            x.scopes === undefined
              ? undefined
              : arr(x.scopes)
                  .filter((s): s is Obj => isObj(s) && typeof s.id === 'string')
                  .map((s) => ({ ...s, subjectId: str(s.subjectId), date: optDate(s.date), note: optStr(s.note), lines: arr(s.lines).filter((l): l is Obj => isObj(l) && typeof l.id === 'string' && typeof l.text === 'string').map((l) => ({ ...l, done: bool(l.done) })) })),
        }
      : null,
  books: (x) => ({
    ...x,
    name: str(x.name, '문제집'),
    subjectId: str(x.subjectId),
    units: arr(x.units).flatMap((u) => {
      if (!isObj(u)) return [];
      const r = range([u.from, u.to]);
      return r ? [{ ...u, name: str(u.name), from: r[0], to: r[1], skip: u.skip === true ? true : undefined }] : [];
    }),
    done: marks(x.done),
    undone: marks(x.undone),
  }),
  plans: (x) => {
    if ((x.target !== 'book' && x.target !== 'words') || typeof x.targetId !== 'string' || !isDate(x.start)) return null;
    const lock = isObj(x.todayLock) && isDate(x.todayLock.date) ? { date: x.todayLock.date, items: arr(x.todayLock.items).filter((p): p is number => Number.isInteger(p) && (p as number) >= 0 && (p as number) <= 9999) } : undefined;
    const carried = isObj(x.carried) && isDate(x.carried.date) ? { date: x.carried.date, count: num(x.carried.count) } : undefined;
    return {
      ...x,
      range: ranges(x.range),
      examId: optStr(x.examId),
      due: optDate(x.due),
      includeDue: bool(x.includeDue),
      restDays: x.restDays === undefined ? undefined : ints(x.restDays, 0, 6),
      dailyMax: x.dailyMax === undefined ? undefined : (optNum(x.dailyMax) ?? null),
      todayLock: lock,
      carried,
      baseline: num(x.baseline),
      finished: x.finished === true ? true : undefined,
    };
  },
  tutors: (x) => ({ ...x, name: str(x.name, '과외'), subjectId: str(x.subjectId), weekdays: ints(x.weekdays, 0, 6), time: optStr(x.time), cancelled: dates(x.cancelled), extra: dates(x.extra) }),
  homework: (x) => {
    if (!isDate(x.given) || !isDate(x.due)) return null;
    return {
      ...x,
      tutorId: str(x.tutorId),
      dueManual: bool(x.dueManual),
      includeDue: bool(x.includeDue),
      note: str(x.note),
      items: arr(x.items)
        .filter((i): i is Obj => isObj(i) && typeof i.id === 'string' && (i.kind === 'pages' || i.kind === 'text' || i.kind === 'words'))
        .map((i) => ({ ...i, range: range(i.range) ?? undefined, doneRanges: i.doneRanges === undefined ? undefined : ranges(i.doneRanges), text: optStr(i.text), bookId: optStr(i.bookId), bookName: optStr(i.bookName), wordListId: optStr(i.wordListId), question: optStr(i.question), done: i.done === true ? true : undefined })),
    };
  },
  notes: (x) => ({
    ...x,
    ...review(x),
    subjectId: str(x.subjectId),
    bookId: optStr(x.bookId),
    page: optNum(x.page),
    number: optStr(x.number),
    question: str(x.question),
    photos: arr(x.photos).filter((p): p is string => typeof p === 'string'),
    myAnswer: str(x.myAnswer),
    answer: str(x.answer),
    reason: typeof x.reason === 'string' ? x.reason : null,
    memo: str(x.memo),
    created: num(x.created),
  }),
  decks: (x) => ({ ...x, name: str(x.name, '카드 묶음'), subjectId: str(x.subjectId) }),
  cards: (x) => ({ ...x, ...review(x), deckId: str(x.deckId), front: str(x.front), back: str(x.back), created: optNum(x.created), firstSeen: optDate(x.firstSeen) }),
  wordLists: (x) => ({
    ...x,
    name: str(x.name, '단어 목록'),
    kind: x.kind === 'test' || x.kind === 'inbox' ? x.kind : 'book',
    subjectId: str(x.subjectId),
    days: optNum(x.days) === undefined ? undefined : Math.max(0, Math.min(MAX_DAYS, Math.round(x.days as number))),
    done: marks(x.done),
    undone: marks(x.undone),
    testDate: optDate(x.testDate),
    todayLock: isObj(x.todayLock) && isDate(x.todayLock.date) ? { date: x.todayLock.date, ids: arr(x.todayLock.ids).filter((i) => typeof i === 'string') } : undefined,
  }),
  sessions: (x) => (isDate(x.date) ? { ...x, subjectId: optStr(x.subjectId), bookId: optStr(x.bookId), start: num(x.start), end: num(x.end), minutes: Math.max(0, num(x.minutes)), kind: x.kind === 'pomo' || x.kind === 'watch' ? x.kind : 'manual' } : null),
  todos: (x) => ({ ...x, title: str(x.title), due: optDate(x.due), done: bool(x.done), doneAt: optNum(x.doneAt), star: x.star === true ? true : undefined, created: num(x.created) }),
  habits: (x) => ({
    ...x,
    name: str(x.name, '습관'),
    icon: str(x.icon),
    weekdays: ints(x.weekdays, 0, 6),
    checks: dates(x.checks),
    log: isObj(x.log) ? Object.fromEntries(Object.entries(x.log).filter(([d, t]) => isDate(d) && typeof t === 'number' && Number.isFinite(t))) : undefined,
    created: optDate(x.created) ?? '2000-01-01',
    archived: x.archived === true ? true : undefined,
  }),
  previews: (x) =>
    isDate(x.date)
      ? {
          ...x,
          subjectId: str(x.subjectId),
          text: str(x.text),
          done: bool(x.done),
          doneAt: optNum(x.doneAt),
          questions: optStr(x.questions),
          after: x.after === 'ok' || x.after === 'some' || x.after === 'no' ? x.after : undefined,
          created: num(x.created),
        }
      : null,
  grades: (x) =>
    isDate(x.date)
      ? {
          ...x,
          kind: x.kind === 'mock' ? 'mock' : 'school',
          name: str(x.name, '시험'),
          examId: optStr(x.examId),
          memo: optStr(x.memo),
          scores: arr(x.scores)
            .filter((g): g is Obj => isObj(g) && typeof g.id === 'string' && typeof g.subject === 'string')
            .map((g) => ({
              id: g.id,
              subject: g.subject,
              raw: score(g.raw, 0, 1000),
              full: score(g.full, 1, 1000),
              grade: score(g.grade, 1, 9),
              average: score(g.average, 0, 1000),
              standard: score(g.standard, 0, 300),
              percentile: score(g.percentile, 0, 100),
              at: optNum(g.at),
            })),
        }
      : null,
};

/** 항목들: id 가 있는 객체만, 지운 표시는 그대로 (그 안의 칸은 화면에 쓰지 않는다) */
function fixRecords(rec: unknown, fix: Fix): Record<Id, unknown> {
  const out: Record<Id, unknown> = {};
  if (!isObj(rec)) return out;
  for (const [key, x] of Object.entries(rec)) {
    if (!isObj(x)) continue;
    const id = typeof x.id === 'string' && x.id ? x.id : key;
    const updatedAt = num(x.updatedAt);
    if (x.deleted === true) {
      out[id] = { ...x, id, updatedAt, deleted: true };
      continue;
    }
    try {
      const v = fix(x);
      if (v) out[id] = { ...v, id, updatedAt, deleted: undefined };
    } catch {
      // 다듬을 수도 없으면 버린다
    }
  }
  return out;
}

export function sanitizeSettings(s: unknown): StudySettings & { updatedAt: number } {
  const x = isObj(s) ? s : {};
  const d = DEFAULT_SETTINGS;
  const intervals = arr(x.intervals).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 365).map(Math.round);
  const pomo = isObj(x.pomo) ? x.pomo : {};
  const clamp = (v: unknown, lo: number, hi: number, fb: number) => Math.min(hi, Math.max(lo, num(v, fb)));
  return {
    ...x,
    updatedAt: num(x.updatedAt),
    dayStart: Math.round(clamp(x.dayStart, 0, 6, d.dayStart)),
    restDays: x.restDays === undefined ? d.restDays : ints(x.restDays, 0, 6),
    offDates: dates(x.offDates),
    tutorRatio: clamp(x.tutorRatio, 0, 1, d.tutorRatio),
    dailyMax: optNum(x.dailyMax) && (x.dailyMax as number) > 0 ? (x.dailyMax as number) : null,
    intervals: intervals.length ? intervals : d.intervals,
    quizMaxBox: Math.round(clamp(x.quizMaxBox, 1, 5, d.quizMaxBox)),
    inboxPerDay: Math.round(clamp(x.inboxPerDay, 1, 200, d.inboxPerDay)),
    wordsUseTutorRatio: bool(x.wordsUseTutorRatio),
    hiddenTabs: x.hiddenTabs === undefined ? undefined : arr(x.hiddenTabs).filter((t): t is string => typeof t === 'string' && t !== 'today').slice(0, 20),
    pomo: {
      work: clamp(pomo.work, 1, 180, d.pomo.work),
      short: clamp(pomo.short, 1, 180, d.pomo.short),
      long: clamp(pomo.long, 1, 180, d.pomo.long),
      every: clamp(pomo.every, 1, 180, d.pomo.every),
    },
  };
}

/** 공부 자료 묶음의 각 모음을 다듬는다 (normalize 가 부른다) */
export function sanitizeCollections(d: Partial<StudyData>): Record<Collection, Record<Id, unknown>> {
  const out = {} as Record<Collection, Record<Id, unknown>>;
  for (const c of Object.keys(FIX) as Collection[]) out[c] = fixRecords((d as Record<string, unknown>)[c], FIX[c]);
  return out;
}

const fixWord: Fix = (x) =>
  typeof x.term === 'string'
    ? { ...x, ...review(x), listId: str(x.listId), meaning: str(x.meaning), day: optNum(x.day) === undefined ? undefined : Math.max(0, Math.min(999, Math.round(x.day as number))), order: num(x.order), firstSeen: optDate(x.firstSeen) }
    : null;

/** 단어 묶음 다듬기 */
export function sanitizeWords(w: unknown): WordsData {
  return fixRecords(w, fixWord) as unknown as Record<Id, Word>;
}
