// 저장된 자료(이 기기·서버·백업 파일) 다듬기: 빠진 칸은 채우고, 모양이 틀린 항목은 버린다.
// 한 기기에서 잘못 들어간 자료가 동기화로 모든 기기의 화면을 멈추게 하지 않도록, 읽을 때마다 거친다.
import { isDate } from './dates';
import { DEFAULT_SETTINGS, type Collection, type DateStr, type Id, type Mark, type Range, type StudyData, type StudySettings, type Word, type WordsData } from './model';
import { clampRange, MAX_DAYS } from './pages';

type Obj = Record<string, unknown>;
const cl = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fb = '') => (typeof v === 'string' ? v : fb);
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown) => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** 체크 줄 목록 (시험 범위·수행평가 준비·백지 복습 핵심) */
const lines = (v: unknown) => arr(v).filter((l): l is Obj => isObj(l) && typeof l.id === 'string' && typeof l.text === 'string').map((l) => ({ ...l, done: bool(l.done) }));
/** 시각 HH:MM */
const hhmm = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined);
/** 농구 기록 칸 */
function bbStat(v: unknown) {
  if (!isObj(v)) return undefined;
  const n = (k: string) => score(v[k], 0, 500);
  // 슛 수는 연습에서 수백 개가 될 수 있다
  const s = (k: string) => score(v[k], 0, 20000);
  return {
    mode: v.mode === 'game' ? ('game' as const) : ('practice' as const),
    result: v.result === 'win' || v.result === 'lose' || v.result === 'draw' ? v.result : undefined,
    pts: n('pts'), reb: n('reb'), ast: n('ast'), stl: n('stl'), blk: n('blk'),
    fgm: s('fgm'), fga: s('fga'), tpm: s('tpm'), tpa: s('tpa'), ftm: s('ftm'), fta: s('fta'),
    court: typeof v.court === 'string' && v.court.trim() ? v.court.trim().slice(0, 30) : undefined,
    items: Array.isArray(v.items)
      ? v.items
          .filter((i): i is Obj => isObj(i) && typeof i.name === 'string' && !!i.name.trim())
          .slice(0, 30)
          .map((i) => ({ name: (i.name as string).trim().slice(0, 40), kind: i.kind === 'fg' || i.kind === 'tp' || i.kind === 'ft' ? i.kind : undefined, made: score(i.made, 0, 2000), att: score(i.att, 0, 2000) }))
      : undefined,
  };
}
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
          plan: isObj(x.plan)
            ? {
                on: x.plan.on === true,
                weekday: Math.round(cl(x.plan.weekday, 0, 900, 150)),
                weekend: Math.round(cl(x.plan.weekend, 0, 900, 240)),
                perLine: Math.round(cl(x.plan.perLine, 5, 300, 40)),
                review: cl(x.plan.review, 0, 2, 0.35),
                weights: isObj(x.plan.weights) ? Object.fromEntries(Object.entries(x.plan.weights).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, cl(v, 0.5, 2, 1)])) : undefined,
                done: isObj(x.plan.done) ? Object.fromEntries(Object.entries(x.plan.done).filter(([k, v]) => /^[A-Z]:[\w:-]{1,60}$/.test(k) && isDate(v))) : undefined,
                started: optDate(x.plan.started),
                lock: isObj(x.plan.lock) && isDate(x.plan.lock.date) ? { date: x.plan.lock.date, ids: arr(x.plan.lock.ids).filter((i): i is string => typeof i === 'string').slice(0, 200) } : undefined,
              }
            : undefined,
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
    okRun: score(x.okRun, 1, 99),
    comments: x.comments === undefined ? undefined : arr(x.comments).filter((c): c is Obj => isObj(c) && typeof c.id === 'string' && isDate(c.date) && typeof c.text === 'string').map((c) => ({ id: c.id as string, date: c.date as DateStr, text: (c.text as string).slice(0, 300), at: optNum(c.at) })).slice(-30),
    paperId: optStr(x.paperId),
    created: num(x.created),
  }),
  papers: (x) =>
    isDate(x.date)
      ? {
          ...x,
          subjectId: str(x.subjectId),
          kind: x.kind === 'csat' || x.kind === 'kice' || x.kind === 'edu' ? x.kind : 'other',
          level: x.level === '고1' || x.level === '고2' || x.level === '고3' ? x.level : undefined,
          title: str(x.title, '기출').slice(0, 60),
          bookId: optStr(x.bookId),
          score: score(x.score, 0, 1000),
          full: score(x.full, 1, 1000),
          grade: score(x.grade, 1, 9),
          minutes: score(x.minutes, 0, 600),
          wrong: ints(x.wrong, 1, 200).slice(0, 100),
          memo: optStr(x.memo),
          created: num(x.created),
        }
      : null,
  workouts: (x) =>
    isDate(x.date)
      ? { ...x, kind: str(x.kind, '운동').slice(0, 20), minutes: score(x.minutes, 0, 1440), distance: score(x.distance, 0, 1000), detail: optStr(x.detail)?.slice(0, 300), effort: score(x.effort, 1, 3), memo: optStr(x.memo)?.slice(0, 300), bb: bbStat(x.bb), created: num(x.created) }
      : null,
  bodyLogs: (x) => {
    const weight = score(x.weight, 10, 400);
    const height = score(x.height, 50, 250);
    return weight !== undefined || height !== undefined ? { ...x, weight, height } : null;
  },
  games: (x) => ({
    ...x,
    title: str(x.title, '게임').slice(0, 100),
    platform: optStr(x.platform)?.slice(0, 30),
    status: x.status === 'playing' || x.status === 'done' ? x.status : 'want',
    rating: typeof x.rating === 'number' && x.rating >= 0.5 && x.rating <= 5 ? Math.round(x.rating * 2) / 2 : undefined,
    hours: score(x.hours, 0, 100000),
    note: optStr(x.note)?.slice(0, 5000),
    started: optDate(x.started),
    finished: optDate(x.finished),
    created: num(x.created),
  }),
  places: (x) => ({
    ...x,
    name: str(x.name, '장소').slice(0, 80),
    kind: x.kind === 'food' || x.kind === 'cafe' || x.kind === 'sight' || x.kind === 'stay' ? x.kind : 'etc',
    region: optStr(x.region)?.slice(0, 40),
    status: x.status === 'visited' ? 'visited' : 'want',
    visited: optDate(x.visited),
    rating: typeof x.rating === 'number' && x.rating >= 0.5 && x.rating <= 5 ? Math.round(x.rating * 2) / 2 : undefined,
    note: optStr(x.note)?.slice(0, 3000),
    created: num(x.created),
  }),
  records: (x) => ({
    ...x,
    title: str(x.title, '앨범').slice(0, 100),
    artist: str(x.artist).slice(0, 100),
    format: x.format === 'cd' || x.format === 'tape' || x.format === 'digital' ? x.format : 'lp',
    status: x.status === 'want' ? 'want' : 'have',
    year: score(x.year, 1800, 2200),
    price: score(x.price, 0, 1e9),
    bought: optDate(x.bought),
    shop: optStr(x.shop)?.slice(0, 60),
    condition: optStr(x.condition)?.slice(0, 30),
    rating: typeof x.rating === 'number' && x.rating >= 0.5 && x.rating <= 5 ? Math.round(x.rating * 2) / 2 : undefined,
    note: optStr(x.note)?.slice(0, 5000),
    listens: x.listens === undefined ? undefined : dates(x.listens).slice(-1000),
    created: num(x.created),
  }),
  passages: (x) => ({ ...x, lang: x.lang === 'en' ? 'en' : 'ko', title: str(x.title, '지문').slice(0, 100), source: optStr(x.source)?.slice(0, 100), text: str(x.text).slice(0, 30000), note: optStr(x.note)?.slice(0, 5000), translation: optStr(x.translation)?.slice(0, 30000), confusing: bool(x.confusing), seen: x.seen === undefined ? undefined : dates(x.seen).slice(-100), photos: Array.isArray(x.photos) ? x.photos.filter((p): p is string => typeof p === 'string').slice(0, 6) : undefined, created: num(x.created) }),
  todoRules: (x) => (isDate(x.start) ? { ...x, title: str(x.title, '할 일').slice(0, 100), weekdays: ints(x.weekdays, 0, 6), paused: x.paused === true ? true : undefined, created: num(x.created) } : null),
  drillLogs: (x) =>
    isDate(x.date) && typeof x.drillId === 'string'
      ? { ...x, drillId: str(x.drillId).slice(0, 30), made: score(x.made, 0, 1000), shots: score(x.shots, 0, 1000), minutes: score(x.minutes, 0, 600), created: num(x.created) }
      : null,
  reads: (x) => ({
    ...x,
    title: str(x.title, '책').slice(0, 100),
    author: optStr(x.author)?.slice(0, 60),
    status: x.status === 'reading' || x.status === 'done' ? x.status : 'want',
    pages: score(x.pages, 1, 20000),
    read: score(x.read, 0, 20000),
    log: Array.isArray(x.log) ? x.log.filter((l): l is { date: string; read: number } => isObj(l) && isDate(l.date) && typeof l.read === 'number' && l.read >= 0 && l.read <= 20000).slice(-400).map((l) => ({ date: l.date, read: Math.round(l.read) })) : undefined,
    rating: typeof x.rating === 'number' && x.rating >= 0.5 && x.rating <= 5 ? Math.round(x.rating * 2) / 2 : undefined,
    comment: optStr(x.comment)?.slice(0, 2000),
    review: optStr(x.review)?.slice(0, 20000),
    started: optDate(x.started),
    finished: optDate(x.finished),
    created: num(x.created),
  }),
  movies: (x) => ({
    ...x,
    title: str(x.title, '영화').slice(0, 80),
    year: score(x.year, 1880, 2200),
    status: x.status === 'watched' ? 'watched' : 'want',
    rating: typeof x.rating === 'number' && x.rating >= 0.5 && x.rating <= 5 ? Math.round(x.rating * 2) / 2 : undefined,
    comment: optStr(x.comment)?.slice(0, 2000),
    quote: optStr(x.quote)?.slice(0, 1000),
    review: optStr(x.review)?.slice(0, 20000),
    rewish: x.rewish === true ? true : undefined,
    why: optStr(x.why)?.slice(0, 500),
    recBy: optStr(x.recBy)?.slice(0, 30),
    genre: optStr(x.genre)?.slice(0, 40),
    nation: optStr(x.nation)?.slice(0, 40),
    director: optStr(x.director)?.slice(0, 40),
    tags: Array.isArray(x.tags) ? x.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim().slice(0, 12)).slice(0, 10) : undefined,
    again: Array.isArray(x.again) ? x.again.filter((a): a is { date: string; where?: string } => isObj(a) && isDate(a.date)).map((a) => ({ date: a.date, where: optStr(a.where)?.slice(0, 20) })).slice(0, 50) : undefined,
    watched: optDate(x.watched),
    release: optDate(x.release),
    where: optStr(x.where)?.slice(0, 20),
    created: num(x.created),
  }),
  moneyTx: (x) =>
    isDate(x.date) && score(x.amount, 0, 1e10) !== undefined
      ? { ...x, type: x.type === 'in' ? 'in' : 'out', amount: Math.round(x.amount as number), category: str(x.category, '기타').slice(0, 20), memo: optStr(x.memo)?.slice(0, 200), ruleId: optStr(x.ruleId), created: num(x.created) }
      : null,
  moneyRules: (x) =>
    isDate(x.start) && score(x.amount, 1, 1e10) !== undefined && ['daily', 'weekly', 'monthly', 'yearly'].includes(x.freq as string)
      ? {
          ...x,
          name: str(x.name, '고정').slice(0, 30),
          type: x.type === 'in' ? 'in' : 'out',
          amount: Math.round(x.amount as number),
          category: str(x.category, '기타').slice(0, 20),
          day: x.freq === 'weekly' ? score(x.day, 0, 6) : x.freq === 'monthly' ? score(x.day, 1, 31) : undefined,
          end: optDate(x.end),
          paused: x.paused === true ? true : undefined,
          created: num(x.created),
        }
      : null,
  savings: (x) =>
    score(x.target, 1, 1e10) !== undefined
      ? {
          ...x,
          name: str(x.name, '모으기').slice(0, 40),
          deposits: arr(x.deposits)
            .filter((v): v is Obj => isObj(v) && typeof v.id === 'string' && isDate(v.date) && typeof v.amount === 'number' && Number.isFinite(v.amount) && Math.abs(v.amount) <= 1e10)
            .map((v) => ({ id: v.id as string, date: v.date as DateStr, amount: Math.round(v.amount as number), at: optNum(v.at) })),
          due: optDate(x.due),
          done: x.done === true ? true : undefined,
          autoPct: score(x.autoPct, 1, 100),
          autoSince: optDate(x.autoSince),
          created: num(x.created),
        }
      : null,
  hobbies: (x) => ({ ...x, name: str(x.name, '취미').slice(0, 30), weeklyGoal: score(x.weeklyGoal, 1, 10080), order: num(x.order) }),
  hobbyLogs: (x) => (isDate(x.date) && typeof x.hobbyId === 'string' ? { ...x, minutes: score(x.minutes, 0, 1440), memo: optStr(x.memo)?.slice(0, 300), created: num(x.created) } : null),
  wishes: (x) => ({
    ...x,
    kind: ['book', 'movie', 'show', 'game', 'place'].includes(x.kind as string) ? x.kind : 'other',
    title: str(x.title, '하고 싶은 것').slice(0, 80),
    status: x.status === 'doing' || x.status === 'done' ? x.status : 'want',
    rating: score(x.rating, 1, 5),
    note: optStr(x.note)?.slice(0, 500),
    doneDate: optDate(x.doneDate),
    created: num(x.created),
  }),
  diary: (x) => (isDate(x.id) ? { ...x, mood: score(x.mood, 1, 5), title: optStr(x.title)?.slice(0, 60), text: str(x.text).slice(0, 20000), parts: isObj(x.parts) ? Object.fromEntries(Object.entries(x.parts).filter(([k, v]) => /^[a-z]{2,12}$/.test(k) && typeof v === 'string' && v.trim()).slice(0, 12).map(([k, v]) => [k, (v as string).slice(0, 5000)])) : undefined, photos: Array.isArray(x.photos) ? x.photos.filter((p): p is string => typeof p === 'string').slice(0, 4) : undefined } : null),
  decks: (x) => ({ ...x, name: str(x.name, '카드 묶음'), subjectId: str(x.subjectId) }),
  cards: (x) => ({ ...x, ...review(x), deckId: str(x.deckId), front: str(x.front), back: str(x.back), created: optNum(x.created), firstSeen: optDate(x.firstSeen) }),
  wordLists: (x) => ({
    ...x,
    name: str(x.name, '단어 목록'),
    kind: x.kind === 'test' || x.kind === 'inbox' ? x.kind : 'book',
    lang: x.lang === 'ko' ? ('ko' as const) : undefined,
    subjectId: str(x.subjectId),
    days: optNum(x.days) === undefined ? undefined : Math.max(0, Math.min(MAX_DAYS, Math.round(x.days as number))),
    done: marks(x.done),
    undone: marks(x.undone),
    testDate: optDate(x.testDate),
    todayLock: isObj(x.todayLock) && isDate(x.todayLock.date) ? { date: x.todayLock.date, ids: arr(x.todayLock.ids).filter((i) => typeof i === 'string') } : undefined,
  }),
  sessions: (x) => (isDate(x.date) ? { ...x, subjectId: optStr(x.subjectId), bookId: optStr(x.bookId), start: num(x.start), end: num(x.end), minutes: Math.max(0, num(x.minutes)), kind: x.kind === 'pomo' || x.kind === 'watch' ? x.kind : 'manual', place: optStr(x.place)?.slice(0, 20), memo: optStr(x.memo)?.slice(0, 100) } : null),
  todos: (x) => ({ ...x, title: str(x.title), due: optDate(x.due), done: bool(x.done), doneAt: optNum(x.doneAt), star: x.star === true ? true : undefined, group: optStr(x.group)?.slice(0, 40), split: isObj(x.split) && typeof x.split.base === 'string' && Number.isFinite(x.split.from) && Number.isFinite(x.split.to) ? { base: String(x.split.base).slice(0, 80), unit: str(x.split.unit, '쪽').slice(0, 6), from: Number(x.split.from), to: Number(x.split.to) } : undefined, created: num(x.created) }),
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
  assessments: (x) =>
    isDate(x.due)
      ? { ...x, subjectId: str(x.subjectId), title: str(x.title, '수행평가'), steps: lines(x.steps), done: bool(x.done), memo: optStr(x.memo), created: num(x.created) }
      : null,
  blanks: (x) => ({
    ...x,
    ...review(x),
    subjectId: str(x.subjectId),
    title: str(x.title, '단원'),
    points: lines(x.points),
    tries: arr(x.tries)
      .filter((t): t is Obj => isObj(t) && typeof t.id === 'string' && isDate(t.date))
      .map((t) => ({ id: t.id as string, date: t.date as DateStr, missed: arr(t.missed).filter((i): i is string => typeof i === 'string'), at: optNum(t.at) }))
      .slice(-10),
    created: num(x.created),
  }),
  conditions: (x) => ({
    ...x,
    sleep: hhmm(x.sleep),
    wake: hhmm(x.wake),
    mood: Number.isInteger(x.mood) && (x.mood as number) >= 1 && (x.mood as number) <= 5 ? (x.mood as number) : undefined,
  }),
  weekNotes: (x) => ({ ...x, text: str(x.text).slice(0, 1000), change: optStr(x.change)?.slice(0, 100), kept: typeof x.kept === 'boolean' ? x.kept : undefined }),
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
          level: x.level === '고1' || x.level === '고2' || x.level === '고3' ? x.level : undefined,
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
              wrong: g.wrong === undefined ? undefined : ints(g.wrong, 1, 200).slice(0, 100),
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

function goals(v: unknown): Record<string, number> | undefined {
  if (!isObj(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => e[0].length <= 20 && typeof e[1] === 'number' && e[1] >= 1 && e[1] <= 9));
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
    schoolTimetable: isObj(x.schoolTimetable)
      ? Object.fromEntries(Object.entries(x.schoolTimetable).filter(([k, v]) => /^[0-6]$/.test(k) && Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((i): i is string => typeof i === 'string').slice(0, 12)]))
      : undefined,
    fitnessGoal: isObj(x.fitnessGoal) ? { perWeek: score((x.fitnessGoal as Obj).perWeek, 1, 14), minutes: score((x.fitnessGoal as Obj).minutes, 1, 10080) } : undefined,
    monthlyBudget: score(x.monthlyBudget, 1, 1e10),
    bbGoals: isObj(x.bbGoals) ? { ft: score((x.bbGoals as Obj).ft, 1, 100), fg: score((x.bbGoals as Obj).fg, 1, 100), tp: score((x.bbGoals as Obj).tp, 1, 100) } : undefined,
    readingGoal: score(x.readingGoal, 1, 1000),
    weeklyLimit: score(x.weeklyLimit, 1, 1e9),
    weatherPlace: isObj(x.weatherPlace) && typeof x.weatherPlace.lat === 'number' && Math.abs(x.weatherPlace.lat) <= 90 && typeof x.weatherPlace.lon === 'number' && Math.abs(x.weatherPlace.lon) <= 180 ? { lat: x.weatherPlace.lat, lon: x.weatherPlace.lon, name: typeof x.weatherPlace.name === 'string' ? x.weatherPlace.name.slice(0, 30) : '내 위치' } : undefined,
    school: isObj(x.school) && typeof x.school.name === 'string' && x.school.name.trim() ? { name: x.school.name.trim().slice(0, 40), grade: score(x.school.grade, 1, 3), cls: typeof x.school.cls === 'string' && /^\d{1,2}$/.test(x.school.cls) ? x.school.cls : undefined } : undefined,
    sleepGoal: score(x.sleepGoal, 3, 12),
    diaryTime: typeof x.diaryTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.diaryTime) ? x.diaryTime : undefined,
    checkinTime: typeof x.checkinTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.checkinTime) ? x.checkinTime : undefined,
    semesterGoals: isObj(x.semesterGoals)
      ? Object.fromEntries(
          Object.entries(x.semesterGoals)
            .filter(([, g]) => isObj(g) && typeof (g as Obj).target === 'number')
            .slice(0, 30)
            .map(([k, g]) => [
              k,
              {
                target: cl((g as Obj).target, 0, 100, 80),
                parts: arr((g as Obj).parts)
                  .filter((p): p is Obj => isObj(p) && typeof p.name === 'string')
                  .slice(0, 8)
                  .map((p) => ({ name: (p.name as string).slice(0, 20), weight: cl(p.weight, 0, 100, 0), score: score(p.score, 0, 100) })),
              },
            ]),
        )
      : undefined,
    lastBackup: optDate(x.lastBackup),
    examPlanDefaults: isObj(x.examPlanDefaults) ? { weekday: cl((x.examPlanDefaults as Obj).weekday, 0, 900, 150), weekend: cl((x.examPlanDefaults as Obj).weekend, 0, 900, 240), perLine: cl((x.examPlanDefaults as Obj).perLine, 5, 300, 40) } : undefined,
    diaryForm: isObj(x.diaryForm) ? { parts: arr((x.diaryForm as Obj).parts).filter((t): t is string => typeof t === 'string' && /^[a-z]{2,12}$/.test(t)).slice(0, 12), autoFill: (x.diaryForm as Obj).autoFill !== false } : undefined,
    hiddenAreas: x.hiddenAreas === undefined ? undefined : arr(x.hiddenAreas).filter((t): t is string => typeof t === 'string').slice(0, 10),
    gradeGoals: isObj(x.gradeGoals) ? { school: goals((x.gradeGoals as Obj).school), mock: goals((x.gradeGoals as Obj).mock) } : undefined,
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
    ? {
        ...x,
        ...review(x),
        example: isObj(x.example) && typeof x.example.s === 'string' && typeof x.example.ko === 'string' ? { s: x.example.s.slice(0, 300), ko: x.example.ko.slice(0, 300) } : undefined,
        from: typeof x.from === 'string' && x.from.trim() ? x.from.trim().slice(0, 60) : undefined,
        listId: str(x.listId),
        meaning: str(x.meaning),
        day: optNum(x.day) === undefined ? undefined : Math.max(0, Math.min(999, Math.round(x.day as number))),
        order: num(x.order),
        firstSeen: optDate(x.firstSeen),
      }
    : null;

/** 단어 묶음 다듬기 */
export function sanitizeWords(w: unknown): WordsData {
  return fixRecords(w, fixWord) as unknown as Record<Id, Word>;
}
