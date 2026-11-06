// 시장 계산: 은화(100 은화 = 1금화). 버는 것 · 쓰는 것 · 벌금 · 은행 · 과목 주식 · 신용 점수.
// 버는 것과 벌금은 기록(공부 · 오답 · 시험 범위 · 습관 · 할 일)에서 그때그때 계산하고, 사고판 것 · 적금 · 대출만 저장한다.
import { addDays, daysBetween, diffDays, weekStart, weekday } from '../study/dates';
import { examEnd, upcomingExams } from '../study/exams';
import { minutesText } from '../study/timer';
import { alive, type DateStr, type Id, type MarketItem, type MarketSettings, type StudyData } from '../study/model';

type D = Pick<StudyData, 'sessions' | 'habits' | 'todos' | 'notes' | 'exams' | 'assessments' | 'subjects' | 'grades'>;

/** 규칙 (은화). 바꾸면 지난 기록도 새 규칙으로 다시 센다 */
export const RULE = {
  perMin: 1,
  note: 20,
  scope: 10,
  habit: 10,
  todo: 5,
  /** 주급 (금화 → 은화): 목표 달성률 100% · 80% · 50% */
  pay: [
    [1, 500],
    [0.8, 300],
    [0.5, 100],
  ] as [number, number][],
  fineMin: 50,
  fineLate: 30,
  /** 대출이 밀린 날에 더해지는 하루 최소 공부 (분, 벌칙 공부) */
  penaltyMin: 60,
  /** 이용권 없이 게임한 분은 이용권 값의 몇 배 */
  rawGame: 3,
  /** 사치세: 기본 10%, 이번 주에 산 오락 1시간마다 +5%, 50% 까지 */
  luxBase: 0.1,
  luxPerHour: 0.05,
  luxMax: 0.5,
  stockFee: 0.01,
};

export const won = (silver: number) => {
  const neg = silver < 0;
  const v = Math.abs(Math.round(silver));
  const g = Math.floor(v / 100);
  const s = v % 100;
  return `${neg ? '−' : ''}${g ? `${g.toLocaleString('ko-KR')}금화` : ''}${g && s ? ' ' : ''}${s || !g ? `${s}은화` : ''}`;
};

export const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const isWeekend = (date: DateStr) => weekday(date) === 0 || weekday(date) === 6;

export const newMarket = (today: DateStr): MarketSettings => ({
  since: today,
  weeklyTarget: 30 * 60,
  minDay: { weekday: 60, weekend: 120 },
  wonPerGold: 3333,
  items: [
    { id: 'game30', name: '게임 30분', kind: 'game', minutes: 30, price: 225 },
    { id: 'yt30', name: '유튜브 30분', kind: 'fun', minutes: 30, price: 150 },
  ],
  priceV: 2,
  buys: [],
  savings: [],
  loans: [],
  trades: [],
  play: {},
});

// ===== 버는 것 =====

export interface DayIncome {
  date: DateStr;
  study: number;
  note: number;
  scope: number;
  habit: number;
  todo: number;
  fever?: number;
  total: number;
  minutes: number;
}

export function incomeByDay(d: D, m: MarketSettings, today: DateStr): Map<DateStr, DayIncome> {
  const map = new Map<DateStr, DayIncome>();
  const at = (date: DateStr) => {
    let x = map.get(date);
    if (!x) map.set(date, (x = { date, study: 0, note: 0, scope: 0, habit: 0, todo: 0, total: 0, minutes: 0 }));
    return x;
  };
  const ok = (date: DateStr) => date >= m.since && date <= today;
  for (const s of alive(d.sessions)) if (ok(s.date) && s.minutes > 0) at(s.date).minutes += s.minutes;
  for (const x of map.values()) x.study = x.minutes * RULE.perMin;
  // 피버타임 물약: 쓴 때부터 1시간 동안 한 공부는 은화 2배
  const fevers = m.buys.filter((b) => b.effect === 'fever' && b.usedAt).map((b) => [b.usedAt!, b.usedAt! + 3_600_000] as const);
  if (fevers.length)
    for (const s of alive(d.sessions)) {
      if (!ok(s.date) || !s.start || !s.end || s.end <= s.start) continue;
      const over = fevers.reduce((a, [f0, f1]) => a + Math.max(0, Math.min(s.end, f1) - Math.max(s.start, f0)), 0);
      const extra = Math.min(s.minutes, Math.round(over / 60_000)) * RULE.perMin;
      if (extra > 0) at(s.date).fever = (at(s.date).fever ?? 0) + extra;
    }
  for (const n of alive(d.notes)) if (n.learned && ok(kst(n.updatedAt))) at(kst(n.updatedAt)).note += RULE.note;
  for (const e of alive(d.exams)) for (const sc of e.scopes ?? []) for (const l of sc.lines) if (l.done && l.at && ok(kst(l.at))) at(kst(l.at)).scope += RULE.scope;
  for (const h of alive(d.habits)) for (const c of h.checks) if (ok(c)) at(c).habit += RULE.habit;
  for (const t of alive(d.todos)) if (t.done && t.doneAt && ok(kst(t.doneAt))) at(kst(t.doneAt)).todo += RULE.todo;
  for (const x of map.values()) x.total = x.study + x.note + x.scope + x.habit + x.todo + (x.fever ?? 0);
  return map;
}

/** 주급: since 뒤로 다 지난 주마다 (그다음 월요일에 받음) */
/**
 * 주급 + 연속 달성 보너스: 주 목표 100% 를 이어 가면 연속 주마다 +100은화(500까지).
 * 못 채운 주에 쓸 수 있는 연속 실드가 있으면(그 주가 끝나기 전에 산 것) 연속이 끊기지 않는다 (그 주 주급은 없음).
 */
export function weeklyPays(d: D, m: MarketSettings, today: DateStr, inc = incomeByDay(d, m, today)): { week: DateStr; minutes: number; ratio: number; pay: number; streak: number; shield?: boolean }[] {
  const out: { week: DateStr; minutes: number; ratio: number; pay: number; streak: number; shield?: boolean }[] = [];
  const shields = m.buys.filter((b) => b.effect === 'shield').map((b) => kst(b.at)).sort();
  let streak = 0;
  for (let w = weekStart(m.since); addDays(w, 7) <= today; w = addDays(w, 7)) {
    if (w < m.since) continue; // 중간에 시작한 첫 주는 빼기
    const minutes = daysBetween(w, addDays(w, 6)).reduce((a, x) => a + (inc.get(x)?.minutes ?? 0), 0);
    const ratio = m.weeklyTarget ? minutes / m.weeklyTarget : 0;
    let pay = RULE.pay.find(([r]) => ratio >= r)?.[1] ?? 0;
    let shield = false;
    if (ratio >= 1) {
      streak++;
      if (streak >= 2) pay += Math.min(500, (streak - 1) * 100);
    } else {
      const k = shields.findIndex((x) => x <= addDays(w, 6));
      if (k >= 0 && streak > 0) {
        shields.splice(k, 1);
        shield = true;
      } else streak = 0;
    }
    out.push({ week: w, minutes, ratio, pay, streak, shield: shield || undefined });
  }
  return out;
}

// ===== 대출 =====

/** 대출 하나: 빌린 날부터 하루하루 이자가 붙는다 (주 이율 ÷ 7). 기한을 넘긴 날은 이자 2배 */
function loanTotal(l: MarketSettings['loans'][number], date: DateStr): number {
  const days = Math.max(1, diffDays(kst(l.at), date));
  const late = Math.max(0, diffDays(l.due, date));
  return Math.round(l.amount * (1 + (l.rate * (days + late)) / 7));
}
export function loanOwed(l: MarketSettings['loans'][number], today: DateStr): { owed: number; interest: number; overdueDays: number; closed: boolean } {
  const paid = l.repays.reduce((a, r) => a + r.amount, 0);
  // 다 갚은 대출은 갚은 날에서 멈춘다
  const lastPay = l.repays.length ? kst(Math.max(...l.repays.map((r) => r.at))) : null;
  if (lastPay && paid >= loanTotal(l, lastPay)) return { owed: 0, interest: paid - l.amount, overdueDays: 0, closed: true };
  const total = loanTotal(l, today);
  const owed = Math.max(0, total - paid);
  return { owed, interest: total - l.amount, overdueDays: owed > 0 ? Math.max(0, diffDays(l.due, today)) : 0, closed: owed === 0 };
}

/** 밀린 대출이 있는 날 (벌칙 공부 · 상점 정지) */
export function overdueOn(m: MarketSettings, date: DateStr): boolean {
  return m.loans.some((l) => {
    if (date <= l.due) return false;
    const end = Date.parse(`${date}T23:59:59+09:00`);
    const paid = l.repays.filter((r) => r.at <= end).reduce((a, r) => a + r.amount, 0);
    return paid < loanTotal(l, date);
  });
}

// ===== 벌금 =====

export interface Fine {
  date: DateStr;
  why: string;
  amount: number;
}

/** 어제까지의 벌금: 하루 최소 공부 미달(대출이 밀린 날은 벌칙 공부만큼 더) · 마감 넘긴 할 일 · 수행평가 */
export function fines(d: D, m: MarketSettings, today: DateStr, inc = incomeByDay(d, m, today)): Fine[] {
  const out: Fine[] = [];
  const yesterday = addDays(today, -1);
  if (yesterday < m.since) return out;
  const rest = new Set(m.buys.filter((b) => b.kind === 'pass' && b.passDate).map((b) => b.passDate!));
  const half = new Set(m.buys.filter((b) => b.effect === 'half' && b.passDate).map((b) => b.passDate!));
  for (const date of daysBetween(m.since, yesterday)) {
    // 하루 쉬기권을 쓴 날은 최소 공부 벌금 없음 (밀린 대출의 벌칙 공부는 그대로)
    if (rest.has(date) && !overdueOn(m, date)) continue;
    // 내일 계획 반토막권을 쓴 날은 최소 공부가 절반
    const base = (isWeekend(date) ? m.minDay.weekend : m.minDay.weekday) * (half.has(date) ? 0.5 : 1);
    const need = Math.round(base) + (overdueOn(m, date) ? RULE.penaltyMin : 0);
    const got = inc.get(date)?.minutes ?? 0;
    if (need > 0 && got < need) out.push({ date, why: `하루 최소 공부 ${need}분 중 ${got}분${overdueOn(m, date) ? ' (벌칙 공부 포함)' : ''}`, amount: RULE.fineMin });
  }
  for (const t of alive(d.todos)) {
    if (!t.due || t.due < m.since || t.due > yesterday) continue;
    const doneDay = t.done && t.doneAt ? kst(t.doneAt) : null;
    if (!doneDay || doneDay > t.due) out.push({ date: addDays(t.due, 1), why: `마감 넘김: ${t.title}`, amount: RULE.fineLate });
  }
  for (const a of alive(d.assessments)) {
    if (a.due < m.since || a.due > yesterday) continue;
    if (!a.done || kst(a.updatedAt) > a.due) out.push({ date: addDays(a.due, 1), why: `수행평가 마감 넘김: ${a.title}`, amount: RULE.fineLate });
  }
  out.push(...gameUse(m, today).sameDay, ...funSameDayFines(m));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ===== 이용권 =====

/** 이용권은 산 날부터 7일 동안 */
export const VOUCHER_DAYS = 7;
export const voucherEnds = (at: number) => addDays(kst(at), VOUCHER_DAYS - 1);
/** 산 날 바로 쓰면 이용권 값의 절반을 벌금으로 */
export const SAME_DAY_FINE = 0.5;

/**
 * 게임 이용권 쓰기: 날마다 게임한 분을, 그날 쓸 수 있는 이용권(기한 안, 전날까지 산 것 먼저 · 기한 빠른 것 먼저)에서 뺀다.
 * 산 날 쓴 이용권은 벌금, 이용권이 모자란 분은 이용권 값의 rawGame 배.
 */
export function gameUse(m: MarketSettings, today?: DateStr) {
  const vs = m.buys
    .filter((b) => b.kind === 'game' && b.minutes)
    .map((b) => ({ id: b.id, day: kst(b.at), ends: b.expires ?? voucherEnds(b.at), left: b.minutes!, perMin: b.price / b.minutes! }))
    .sort((a, b) => a.ends.localeCompare(b.ends) || a.day.localeCompare(b.day));
  const item = m.items.find((x) => x.kind === 'game' && x.minutes);
  const basePerMin = item ? item.price / (item.minutes ?? 30) : 5;
  let raw = 0;
  let played = 0;
  const sameDay: Fine[] = [];
  for (const [date, min] of Object.entries(m.play)
    .filter(([k]) => k >= m.since && (!today || k <= today))
    .sort((a, b) => a[0].localeCompare(b[0]))) {
    played += min;
    let need = min;
    for (const pass of [0, 1]) {
      for (const v of vs) {
        if (!need) break;
        if (v.left <= 0 || v.ends < date || v.day > date || (pass === 0 ? v.day === date : v.day !== date)) continue;
        const use = Math.min(need, v.left);
        v.left -= use;
        need -= use;
        if (pass === 1) sameDay.push({ date, why: `산 날 바로 쓴 게임 이용권 ${use}분`, amount: Math.round(use * v.perMin * SAME_DAY_FINE) });
      }
    }
    raw += need;
  }
  const bought = vs.reduce((a, v) => a + (m.buys.find((b) => b.id === v.id)?.minutes ?? 0), 0);
  const left = vs.filter((v) => !today || v.ends >= today).reduce((a, v) => a + v.left, 0);
  const expired = vs.filter((v) => today && v.ends < today).reduce((a, v) => a + v.left, 0);
  return { bought, played, left, expired, raw, charge: Math.round(raw * basePerMin * RULE.rawGame), sameDay };
}

/** 오락 이용권(게임 말고): 쓴 날이 산 날과 같으면 벌금 */
export function funSameDayFines(m: MarketSettings): Fine[] {
  return m.buys
    .filter((b) => (b.kind === 'fun' || b.kind === 'meet') && b.usedAt && kst(b.usedAt) === kst(b.at))
    .map((b) => ({ date: kst(b.usedAt!), why: `산 날 바로 쓴 이용권: ${b.name}`, amount: Math.round(b.price * SAME_DAY_FINE) }));
}

// ===== 값 · 세금 =====

/** 시험이 가까우면 오락 값이 오른다: D-14 부터 하루마다, 시험 기간엔 2배 */
export function examSurge(d: Pick<StudyData, 'exams'>, today: DateStr): { factor: number; why: string } {
  let best = { factor: 1, why: '' };
  for (const e of upcomingExams(d as StudyData, today)) {
    const n = diffDays(today, e.date);
    const f = today >= e.date && today <= examEnd(e) ? 2 : n >= 0 && n <= 14 ? 1 + (15 - n) / 15 : 1;
    if (f > best.factor) best = { factor: Math.round(f * 100) / 100, why: today >= e.date ? `${e.name} 기간` : `${e.name} D-${n}` };
  }
  return best;
}

/** 이번 주에 산 오락 시간 (분) */
const funThisWeek = (m: MarketSettings, today: DateStr) =>
  m.buys.filter((b) => (b.kind === 'game' || b.kind === 'fun') && kst(b.at) >= weekStart(today)).reduce((a, b) => a + (b.minutes ?? 0), 0);

/** 물건 하나의 지금 값 · 세금 */
/** 시험이 끝난 주(끝난 날부터 7일)에는 할인 */
export function postExamSale(d: Pick<StudyData, 'exams'>, m: MarketSettings, today: DateStr): { rate: number; why: string } {
  for (const e of alive(d.exams)) {
    const end = examEnd(e);
    if (end < today && diffDays(end, today) <= 7) return { rate: m.postExamSale ?? 0.3, why: `${e.name} 끝난 주` };
  }
  return { rate: 0, why: '' };
}

/** 자정 할증: 오늘 최소 공부를 못 채운 채 저녁 6시가 지나면 오락 값이 자정까지 +50% 로 오른다 */
export function lateSurge(now: number, today: DateStr, todayMin: number, need: number): number {
  if (todayMin >= need) return 1;
  const t = (now - Date.parse(`${today}T18:00:00+09:00`)) / (6 * 3_600_000);
  return t <= 0 ? 1 : Math.round((1 + 0.5 * Math.min(1, t)) * 100) / 100;
}

/** 물건 하나의 지금 값 · 세금. ctx(지금 시각 · 오늘 공부 · 최소 공부)가 있으면 자정 할증도 */
export function priceOf(it: MarketItem, m: MarketSettings, d: Pick<StudyData, 'exams'>, today: DateStr, ctx?: { now: number; todayMin: number; need: number }): { price: number; tax: number; why: string; base: number } {
  if (it.kind === 'thing') {
    const whole = Math.max(1, Math.round(((it.won ?? 0) / m.wonPerGold) * 100));
    const p = it.pieces ? Math.ceil(whole / it.pieces) : whole;
    return { price: p, tax: 0, why: '', base: p };
  }
  const sale = postExamSale(d, m, today);
  const s = sale.rate ? { factor: 1, why: '' } : examSurge(d, today);
  const fun = it.kind === 'game' || it.kind === 'fun';
  const late = fun && ctx ? lateSurge(ctx.now, today, ctx.todayMin, ctx.need) : 1;
  const price = Math.max(1, Math.round(it.price * s.factor * late * (1 - sale.rate)));
  const why = [sale.rate ? `${sale.why} ${Math.round(sale.rate * 100)}% 할인` : s.why, late > 1 ? `자정 할증 ×${late}` : ''].filter(Boolean).join(' · ');
  // 약속 · 쉬기권 · 아이템은 사치세가 없다
  if (!fun) return { price, tax: 0, why, base: it.price };
  const rate = Math.min(RULE.luxMax, RULE.luxBase + RULE.luxPerHour * Math.floor(funThisWeek(m, today) / 60));
  return { price, tax: Math.round(price * rate), why, base: it.price };
}

// ===== 과목 주식 =====

/** 과목 → 회사 이름 (과목 이름 + 분야). 흔한 과목은 어울리는 분야, 나머지는 과목마다 정해진 분야 */
const FIELDS = ['전자', '바이오', '항공', '건설', '화학', '엔터', '모빌리티', '에너지', '식품', '게임즈', '증권', '통신', '로보틱스', '반도체'];
const FIELD_OF: [RegExp, string][] = [
  [/수학|미적|확통|기하/, '전자'],
  [/영어|english/i, '항공'],
  [/국어|문학|독서|언어|화작|언매/, '미디어'],
  [/물리/, '에너지'],
  [/화학/, '화학'],
  [/생명|생물/, '바이오'],
  [/지구/, '우주항공'],
  [/정보|코딩|컴퓨터/, '소프트'],
  [/역사|한국사/, '건설'],
  [/사회|경제|정치|법/, '증권'],
  [/윤리|철학/, '출판'],
  [/지리/, '모빌리티'],
  [/중국어|일본어|프랑스|독일|스페인|한문/, '무역'],
  [/음악|미술|체육/, '엔터'],
];
const hashOf = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};
export function companyName(name: string, id: Id): string {
  const f = FIELD_OF.find(([re]) => re.test(name))?.[1] ?? FIELDS[hashOf(id) % FIELDS.length];
  return `${name.replace(/\s+/g, '')}${f}`;
}
/** 종목 번호 (6자리, 과목마다 정해짐) */
export const tickerOf = (id: Id) => String(100000 + (hashOf(`t${id}`) % 900000));

export interface StockEvent {
  subjectId: Id;
  date: DateStr;
  pct: number;
  title: string;
  /** 왜 그랬는지 (그날 그 과목 공부 · 확률) */
  why: string;
}
const GOOD = ['깜짝 실적 발표', '신제품 대박', '대형 계약 따내', '해외 진출 성공', '기술 특허 등록', '목표 주가 상향'];
const BAD = ['실적 부진', '제품 리콜 사태', '공장 가동 멈춤', '대표 사임설', '목표 주가 하향', '소송에 휘말려'];

/**
 * 과목 주가 (은화): since 에 100 에서 시작해 날마다 무작위로 움직인다 (과목 · 날짜마다 정해진 난수라 어느 기기에서나 같다).
 * - 평소 흔들림 ±2% 쯤, 공부 10분마다 +0.3% (하루 +3% 까지)
 * - 호재(+5~12%) 확률: 기본 6%, 그날 그 과목 공부가 많을수록 올라 10시간이면 40%
 * - 악재(−5~12%) 확률: 공부한 날 3%, 안 한 날 14% (오늘 · 「시험 3주 전부터만」 과목의 평소에는 3%, 오늘은 악재 없음)
 * - 오답 해결 +2%, 성적이 오르면 +10%, 내리면 −10%
 */
export function stockPrices(d: D, m: MarketSettings, today: DateStr): Map<Id, { price: number; prev: number; hist: number[]; events: StockEvent[] }> {
  const out = new Map<Id, { price: number; prev: number; hist: number[]; events: StockEvent[] }>();
  const subs = alive(d.subjects);
  const days = today < m.since ? [] : daysBetween(m.since, today);
  const min = new Map<string, number>();
  for (const s of alive(d.sessions)) if (s.subjectId && s.date >= m.since && s.date <= today) min.set(`${s.subjectId}|${s.date}`, (min.get(`${s.subjectId}|${s.date}`) ?? 0) + s.minutes);
  const notes = new Map<string, number>();
  for (const n of alive(d.notes)) if (n.learned) notes.set(`${n.subjectId}|${kst(n.updatedAt)}`, (notes.get(`${n.subjectId}|${kst(n.updatedAt)}`) ?? 0) + 1);
  // 성적: 같은 과목 이름의 바로 앞 성적과 비교 (등급이 작아지면 오름)
  const gradeMove = new Map<string, number>();
  const recs = alive(d.grades).sort((a, b) => a.date.localeCompare(b.date));
  for (const sub of subs) {
    let prev: number | undefined;
    for (const r of recs) {
      const g = r.scores.find((x) => x.subject.replace(/\s/g, '') === sub.name.replace(/\s/g, ''))?.grade;
      if (g === undefined) continue;
      if (prev !== undefined && r.date >= m.since && g !== prev) gradeMove.set(`${sub.id}|${r.date}`, g < prev ? 0.1 : -0.1);
      prev = g;
    }
  }
  // 「시험 3주 전부터만」 과목: 그 과목 시험 날들
  const examDays = new Map<Id, DateStr[]>();
  for (const e of alive(d.exams)) for (const sc of e.scopes ?? []) examDays.set(sc.subjectId, [...(examDays.get(sc.subjectId) ?? []), sc.date ?? e.date]);
  const decays = (id: Id, date: DateStr) => !m.examOnly?.includes(id) || (examDays.get(id) ?? []).some((x) => x >= date && diffDays(date, x) <= 21);
  for (const sub of subs) {
    if (m.stockOff?.includes(sub.id)) continue;
    const co = companyName(sub.name, sub.id);
    let p = 100;
    // 처음 값(100)부터 적어 둔다 (첫날 오르내림도 비교할 수 있게)
    const hist: number[] = [100];
    const events: StockEvent[] = [];
    let prev = 100;
    for (const date of days) {
      const k = `${sub.id}|${date}`;
      const mm = min.get(k) ?? 0;
      const rnd = seeded(date, hashOf(sub.id));
      const calm = !decays(sub.id, date);
      // 평소 흔들림 (세 난수 평균이라 가운데가 많다)
      let r = ((rnd() + rnd() + rnd()) / 3 - 0.5) * (calm ? 0.03 : 0.06);
      r += Math.min(0.03, Math.floor(mm / 10) * 0.003);
      const u = rnd();
      const size = 0.05 + rnd() * 0.07;
      const pick = rnd();
      const pGood = 0.06 + Math.min(0.34, (mm / 600) * 0.34);
      const pBad = date === today ? 0 : mm > 0 || calm ? 0.03 : 0.14;
      const pg = `${Math.round(pGood * 100)}%`;
      if (u < pGood) {
        r += size;
        const why = mm > 0 ? `${sub.name} ${minutesText(mm)} 공부 → 호재 확률 ${pg}` : `${sub.name} 공부는 없었지만 운이 좋았어요 (호재 확률 ${pg})`;
        events.push({ subjectId: sub.id, date, pct: size, title: `${co} ${GOOD[Math.floor(pick * GOOD.length)]}`, why });
      } else if (u > 1 - pBad) {
        r -= size;
        const pb = `${Math.round(pBad * 100)}%`;
        const why = mm > 0 ? `${sub.name} ${minutesText(mm)} 공부했지만 운이 나빴어요 (악재 확률 ${pb})` : calm ? `${sub.name} 공부 안 함 · 시험 3주 전까지 잔잔 (악재 확률 ${pb})` : `${sub.name} 공부 안 함 → 악재 확률 ${pb}`;
        events.push({ subjectId: sub.id, date, pct: -size, title: `${co} ${BAD[Math.floor(pick * BAD.length)]}`, why });
      }
      r += (notes.get(k) ?? 0) * 0.02 + (gradeMove.get(k) ?? 0);
      prev = p;
      p = Math.max(10, p * (1 + r));
      hist.push(Math.round(p * 100) / 100);
    }
    out.set(sub.id, { price: Math.round(p), prev: Math.round(prev), hist, events });
  }
  return out;
}

export function holdings(m: MarketSettings): Map<Id, { qty: number; cost: number }> {
  const out = new Map<Id, { qty: number; cost: number }>();
  for (const t of m.trades) {
    const h = out.get(t.subjectId) ?? { qty: 0, cost: 0 };
    if (t.qty > 0) {
      h.cost += t.qty * t.price;
      h.qty += t.qty;
    } else {
      const avg = h.qty ? h.cost / h.qty : 0;
      h.qty += t.qty;
      h.cost = Math.max(0, h.cost + t.qty * avg);
    }
    out.set(t.subjectId, h);
  }
  return out;
}

// ===== 적금 =====

/** 적금 이율 (주): 1주 1% · 4주 6% · 8주 15% (중간에 깨면 이자 없음) */
export const SAVING_PLANS: { weeks: number; rate: number }[] = [
  { weeks: 1, rate: 0.01 },
  { weeks: 4, rate: 0.06 },
  { weeks: 8, rate: 0.15 },
];
export function savingValue(s: MarketSettings['savings'][number], today: DateStr): { matured: boolean; value: number; ends: DateStr } {
  const ends = addDays(kst(s.at), s.weeks * 7);
  const matured = today >= ends;
  return { matured, value: Math.round(s.amount * (matured ? 1 + s.rate : 1)), ends };
}

// ===== 신용 점수 =====

/** 신용 점수 (0~1000, 처음 700). 기한 안에 갚으면 +, 밀리면 −, 주 목표를 채우면 +, 벌금마다 − */
export function creditScore(d: D, m: MarketSettings, today: DateStr, f = fines(d, m, today), pays = weeklyPays(d, m, today)): { score: number; log: { why: string; delta: number }[] } {
  const log: { why: string; delta: number }[] = [];
  for (const l of m.loans) {
    const o = loanOwed(l, today);
    const lastPay = l.repays.length ? kst(Math.max(...l.repays.map((r) => r.at))) : null;
    if (o.closed && lastPay && lastPay <= l.due) log.push({ why: '대출을 기한 안에 갚음', delta: 15 });
    else if (today > l.due && (!o.closed || (lastPay && lastPay > l.due))) {
      const late = o.closed && lastPay ? diffDays(l.due, lastPay) : o.overdueDays;
      log.push({ why: `대출 ${late}일 밀림`, delta: -60 - 5 * late });
    }
  }
  for (const p of pays) if (p.ratio >= 1) log.push({ why: `${p.week} 주 목표 달성`, delta: 10 });
  if (f.length) log.push({ why: `벌금 ${f.length}번`, delta: -3 * f.length });
  const score = Math.max(0, Math.min(1000, 700 + log.reduce((a, x) => a + x.delta, 0)));
  return { score, log };
}

/** 신용 구간 (이 앱의 규칙. 680점은 2021년 신용점수제 전환 때 신용카드 발급 기준으로 쓰인 NICE 점수) */
export function creditBand(score: number): { name: string; mult: number; rate: number } {
  if (score >= 900) return { name: '최우량', mult: 4, rate: 0.02 };
  if (score >= 800) return { name: '우량', mult: 3, rate: 0.04 };
  if (score >= 680) return { name: '보통', mult: 2, rate: 0.07 };
  return { name: '대출 불가', mult: 0, rate: 0.15 };
}

// ===== 지갑 =====

export function marketView(d: D, m: MarketSettings, today: DateStr) {
  const inc = incomeByDay(d, m, today);
  const income = [...inc.values()].reduce((a, x) => a + x.total, 0);
  const pays = weeklyPays(d, m, today, inc);
  const pay = pays.reduce((a, x) => a + x.pay, 0);
  const f = fines(d, m, today, inc);
  const fine = f.reduce((a, x) => a + x.amount, 0);
  const game = gameUse(m, today);
  const spent = m.buys.reduce((a, b) => a + b.price + b.tax, 0);
  const saveIn = m.savings.reduce((a, s) => a + s.amount, 0);
  const saveOut = m.savings.filter((s) => s.closedAt).reduce((a, s) => a + (s.closedAt! >= Date.parse(`${savingValue(s, today).ends}T00:00:00+09:00`) ? Math.round(s.amount * (1 + s.rate)) : s.amount), 0);
  const loanIn = m.loans.reduce((a, l) => a + l.amount, 0);
  const loanOut = m.loans.reduce((a, l) => a + l.repays.reduce((x, r) => x + r.amount, 0), 0);
  const prices = stockPrices(d, m, today);
  const stockNet = m.trades.reduce((a, t) => a - t.qty * t.price - Math.round(Math.abs(t.qty * t.price) * RULE.stockFee), 0);
  const gamble = gambleNet(d, m, today, inc);
  const balance = income + pay - fine - game.charge - spent - saveIn + saveOut + loanIn - loanOut + stockNet + gamble;
  const owed = m.loans.reduce((a, l) => a + loanOwed(l, today).owed, 0);
  const overdue = overdueOn(m, today) || m.loans.some((l) => loanOwed(l, today).overdueDays > 0);
  const credit = creditScore(d, m, today, f, pays);
  const band = creditBand(credit.score);
  // 대출 한도: 최근 4주 평균 주간 수입 × 신용 배수 (기록이 모자라면 500은화 × 배수) − 지금 빚
  const last4 = daysBetween(addDays(today, -28), addDays(today, -1)).reduce((a, x) => a + (inc.get(x)?.total ?? 0), 0) / 4;
  const weekly = Math.max(500, Math.round(last4));
  const limit = Math.max(0, weekly * band.mult - owed);
  const hold = holdings(m);
  const stockValue = [...hold].reduce((a, [id, h]) => a + h.qty * (prices.get(id)?.price ?? 0), 0);
  const savingNow = m.savings.filter((s) => !s.closedAt).reduce((a, s) => a + s.amount, 0);
  const todayInc = inc.get(today);
  const halfToday = m.buys.some((b) => b.effect === 'half' && b.passDate === today);
  const need = Math.round((isWeekend(today) ? m.minDay.weekend : m.minDay.weekday) * (halfToday ? 0.5 : 1)) + (overdue ? RULE.penaltyMin : 0);
  const net = balance + stockValue + savingNow - owed;
  const tier = tierScore(d, m, today, inc, net);
  return { inc, income, pays, pay, fines: f, fine, game, spent, balance, owed, overdue, credit, band, limit, weekly, prices, hold, stockValue, savingNow, todayInc, need, net, gamble, tier, rank: tierNow(m, today) };
}

// ===== 시장 뉴스 (실검처럼) =====

export interface News {
  rank: number;
  title: string;
  /** up · down · hot · warn */
  tone: 'up' | 'down' | 'hot' | 'warn';
  /** 이유 (작게) */
  why?: string;
}

/** 오늘의 시장 뉴스: 내 기록에서 만든 소식들, 크기(점수) 순 */
export function marketNews(d: D, m: MarketSettings, today: DateStr): News[] {
  const v = marketView(d, m, today);
  const items: { score: number; title: string; tone: News['tone']; why?: string }[] = [];
  // 과목별 공부한 날 (연속 상승 · 내림세 이유)
  const studied = new Set<string>();
  for (const x of alive(d.sessions)) if (x.subjectId && x.minutes > 0) studied.add(`${x.subjectId}|${x.date}`);
  const daysStudied = (id: Id, n: number, end: DateStr) => daysBetween(addDays(end, -(n - 1)), end).filter((x) => studied.has(`${id}|${x}`)).length;
  const yday = addDays(today, -1);
  const subName = (id: Id) => d.subjects[id]?.name ?? '과목';
  for (const [id, p] of v.prices) {
    // 오늘 아직 움직이지 않았으면 어제까지로
    const h = p.hist.length > 1 && p.hist[p.hist.length - 1] === p.hist[p.hist.length - 2] ? p.hist.slice(0, -1) : p.hist;
    if (h.length < 2) continue;
    let run = 0;
    for (let i = h.length - 1; i > 0 && h[i] > h[i - 1]; i--) run++;
    let fall = 0;
    for (let i = h.length - 1; i > 0 && h[i] < h[i - 1]; i--) fall++;
    // h 의 마지막 칸 날짜 (hist[i] = since + (i−1)일)
    const end = addDays(m.since, h.length - 2);
    if (run >= 3) items.push({ score: 50 + run * 5, title: `${companyName(subName(id), id)} ${run}일 연속 상승`, tone: 'up', why: `${run}일 가운데 ${daysStudied(id, run, end)}일 ${subName(id)} 공부` });
    if (fall >= 3) items.push({ score: 45 + fall * 5, title: `${companyName(subName(id), id)} ${fall}일째 내림세`, tone: 'down', why: daysStudied(id, fall, end) ? `${fall}일 가운데 ${daysStudied(id, fall, end)}일만 ${subName(id)} 공부` : `${fall}일 동안 ${subName(id)} 공부 없음` });
  }
  // 과목 주식 호재 · 악재 (오늘 · 어제)
  for (const [, p] of v.prices)
    for (const e of p.events)
      if (e.date === today || e.date === yday) items.push({ score: (e.date === today ? 85 : 60) + Math.abs(e.pct) * 100, title: `${e.title} ${e.pct > 0 ? '+' : ''}${(e.pct * 100).toFixed(1)}%`, tone: e.pct > 0 ? 'up' : 'down', why: `${e.date === today ? '오늘' : '어제'} ${e.why}` });
  const s = examSurge(d, today);
  if (s.factor > 1) items.push({ score: 70, title: `오락 값 ${s.factor}배`, tone: 'warn', why: s.why });
  const yInc = v.inc.get(yday);
  if (yInc && yInc.minutes >= 300) items.push({ score: 60, title: `어제 ${Math.floor(yInc.minutes / 60)}시간 공부 · 은화 ${yInc.total} 벌어`, tone: 'hot' });
  const yFines = v.fines.filter((f) => f.date === yday);
  if (yFines.length) items.push({ score: 65, title: `어제 벌금 ${yFines.length}건 · ${won(yFines.reduce((a, f) => a + f.amount, 0))}`, tone: 'down', why: yFines.map((f) => f.why).join(' · ') });
  if (v.overdue) items.push({ score: 90, title: `대출 연체 · 상점 영업 정지`, tone: 'down', why: '갚을 날이 지난 대출이 있어요' });
  if (v.game.raw > 0) items.push({ score: 55, title: `무단 게임 ${v.game.raw}분 적발 · ${RULE.rawGame}배 청구`, tone: 'down', why: '게임 기록보다 쓴 게임 이용권이 모자라요' });
  const lastPay = v.pays[v.pays.length - 1];
  if (lastPay && addDays(lastPay.week, 7) === weekStart(today)) items.push({ score: 75, title: `주급 지급 ${won(lastPay.pay)} · 지난주 목표 ${Math.round(lastPay.ratio * 100)}%`, tone: lastPay.pay ? 'up' : 'down', why: `지난주 공부 ${minutesText(lastPay.minutes)} / 목표 ${minutesText(m.weeklyTarget)}${lastPay.streak >= 2 ? ` · ${lastPay.streak}주 연속 달성` : ''}` });
  if (v.credit.score >= 900) items.push({ score: 30, title: `신용 ${v.credit.score}점 최우량`, tone: 'up' });
  else if (v.credit.score < 680) items.push({ score: 50, title: `신용 ${v.credit.score}점 · 대출 불가`, tone: 'down' });
  const bestStock = [...v.prices].sort((a, b) => b[1].price - a[1].price)[0];
  if (bestStock) items.push({ score: 20, title: `시가 1위 ${companyName(subName(bestStock[0]), bestStock[0])} ${won(bestStock[1].price)}`, tone: 'hot' });
  const today0 = v.todayInc?.minutes ?? 0;
  if (today0 < v.need) items.push({ score: 35, title: `오늘 최소 공부까지 ${v.need - today0}분 남아`, tone: 'warn' });
  return items
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x, i) => ({ rank: i + 1, title: x.title, tone: x.tone, why: x.why }));
}

// ===== 악마의 계약서 · 성적 배당권 · 복권 =====

/** 최근 14일 하루 평균 공부 (분) */
export function avgDaily(inc: Map<DateStr, DayIncome>, today: DateStr): number {
  const days = daysBetween(addDays(today, -14), addDays(today, -1));
  return Math.round(days.reduce((a, x) => a + (inc.get(x)?.minutes ?? 0), 0) / days.length);
}
/** 계약서 배율: 목표가 평소(최근 14일 평균)보다 클수록 크게 (1.3 ~ 5배) */
export function contractMult(target: number, avg: number): number {
  if (avg < 30) return 3;
  return Math.round(Math.max(1.3, Math.min(5, 1 + (target / avg - 1) * 1.5)) * 10) / 10;
}
export function contractState(c: NonNullable<MarketSettings['contracts']>[number], inc: Map<DateStr, DayIncome>, today: DateStr): 'won' | 'lost' | 'open' {
  if ((inc.get(c.date)?.minutes ?? 0) >= c.minutes) return 'won';
  return c.date < today ? 'lost' : 'open';
}

/** 그 과목의 가장 최근 등급 (내신 · 모의고사) */
export function lastGrade(d: Pick<StudyData, 'grades'>, kind: 'school' | 'mock', subject: string): number | null {
  const k = (x: string) => x.replace(/\s/g, '');
  const recs = alive(d.grades)
    .filter((r) => r.kind === kind)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const r of recs) {
    const g = r.scores.find((s) => k(s.subject) === k(subject))?.grade;
    if (g !== undefined) return g;
  }
  return null;
}
/** 배당 배율: 지금 등급보다 얼마나 높은 목표인지 (같거나 쉬우면 1.2배 · 1등급 위 2배 · 2등급 3.5배 · 3등급 이상 5배, 지금 등급을 모르면 2.5배) */
export function betMult(now: number | null, target: number): number {
  if (now === null) return 2.5;
  const up = now - target;
  return up <= 0 ? 1.2 : up === 1 ? 2 : up === 2 ? 3.5 : 5;
}
export function betState(b: NonNullable<MarketSettings['bets']>[number], d: Pick<StudyData, 'grades'>, today: DateStr): { state: 'won' | 'lost' | 'open'; got?: number; name?: string } {
  const k = (x: string) => x.replace(/\s/g, '');
  const from = kst(b.at);
  const recs = alive(d.grades)
    .filter((r) => r.kind === b.kind && r.date >= from && r.date <= b.until)
    .sort((a, b2) => a.date.localeCompare(b2.date));
  for (const r of recs) {
    const g = r.scores.find((s) => k(s.subject) === k(b.subject))?.grade;
    if (g === undefined) continue;
    return { state: g <= b.target ? 'won' : 'lost', got: g, name: r.name };
  }
  return { state: b.until < today ? 'lost' : 'open' };
}

/** 복권 상금표 (공개): 한 장 100은화, 기대값 약 95은화 */
export const LOTTO_PRICE = 100;
export const LOTTO_TABLE: { prize: number; p: number }[] = [
  { prize: 20, p: 0.4 },
  { prize: 60, p: 0.3 },
  { prize: 120, p: 0.18 },
  { prize: 250, p: 0.09 },
  { prize: 600, p: 0.025 },
  { prize: 2000, p: 0.005 },
];
export function drawLotto(r = Math.random()): number {
  let acc = 0;
  for (const x of LOTTO_TABLE) {
    acc += x.p;
    if (r < acc) return x.prize;
  }
  return LOTTO_TABLE[LOTTO_TABLE.length - 1].prize;
}

/** 계약서 · 배당 · 복권으로 들어오고 나간 돈 */
export function gambleNet(d: D, m: MarketSettings, today: DateStr, inc: Map<DateStr, DayIncome>): number {
  let n = 0;
  for (const c of m.contracts ?? []) {
    n -= c.stake;
    if (contractState(c, inc, today) === 'won') n += Math.round(c.stake * c.mult);
  }
  for (const b of m.bets ?? []) {
    n -= b.stake;
    if (betState(b, d, today).state === 'won') n += Math.round(b.stake * b.mult);
  }
  for (const l of m.lotto ?? []) n += l.prize - l.price;
  return n;
}

// ===== 티어 (3달마다 시즌) =====

export const TIERS = ['브론즈', '실버', '골드', '다이아'];
export const seasonOf = (date: DateStr) => `${date.slice(0, 4)}-${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}시즌`;
/** 티어 점수 (0~100): 최근 2주 공부(50) · 최근 모의고사 평균 등급(30) · 순자산(20) */
export function tierScore(d: D, m: MarketSettings, today: DateStr, inc: Map<DateStr, DayIncome>, net: number): { score: number; parts: { study: number; mock: number; money: number }; eligible: number } {
  const two = daysBetween(addDays(today, -13), today).reduce((a, x) => a + (inc.get(x)?.minutes ?? 0), 0);
  const study = Math.round(Math.min(1, two / Math.max(1, 2 * m.weeklyTarget)) * 50);
  const mocks = alive(d.grades)
    .filter((r) => r.kind === 'mock')
    .sort((a, b) => b.date.localeCompare(a.date));
  const gs = mocks[0]?.scores.map((s) => s.grade).filter((g): g is number => typeof g === 'number') ?? [];
  const mock = gs.length ? Math.round(((9 - gs.reduce((a, b) => a + b, 0) / gs.length) / 8) * 30) : 10;
  const money = Math.round(Math.max(0, Math.min(1, net / 20000)) * 20);
  const score = study + mock + money;
  const eligible = score >= 80 ? 3 : score >= 60 ? 2 : score >= 40 ? 1 : 0;
  return { score, parts: { study, mock, money }, eligible };
}
export const tierNow = (m: MarketSettings, today: DateStr) => (m.tier && m.tier.season === seasonOf(today) ? m.tier.rank : 0);
/** 승급 심사권 값 (다음 티어로) */
export const promoPrice = (rank: number) => [500, 1200, 2500][rank] ?? 0;

// ===== 암시장 · 타임 세일 =====

/** 날짜로 정해지는 섞기 (그날은 늘 같은 결과) */
function seeded(date: DateStr, salt: number) {
  let x = (Number(date.replace(/-/g, '')) * 2654435761 + salt * 97) >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

export const BLACK_ITEMS: (Omit<MarketItem, 'id'> & { key: string })[] = [
  { key: 'half', name: '내일 계획 반토막권', kind: 'perk', effect: 'half', price: 1200 },
  { key: 'yt11', name: '유튜브 1+1 이용권', kind: 'fun', minutes: 60, price: 150 },
  { key: 'game11', name: '게임 1+1 이용권', kind: 'game', minutes: 60, price: 225 },
  { key: 'fever', name: '피버타임 물약', kind: 'perk', effect: 'fever', price: 600 },
  { key: 'shield', name: '연속 달성 실드', kind: 'perk', effect: 'shield', price: 900 },
  { key: 'rest', name: '하루 쉬기권', kind: 'pass', price: 2250 },
  { key: 'sleep2', name: '늦잠 2시간', kind: 'fun', minutes: 120, price: 330 },
];
/** 오늘의 암시장 3개 (20~50% 할인) */
export function blackToday(today: DateStr): { item: Omit<MarketItem, 'id'> & { key: string }; off: number; price: number; id: string }[] {
  const r = seeded(today, 7);
  const pool = [...BLACK_ITEMS];
  const out: { item: (typeof BLACK_ITEMS)[number]; off: number; price: number; id: string }[] = [];
  while (out.length < 3 && pool.length) {
    const it = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const off = Math.round((0.2 + r() * 0.3) * 100) / 100;
    out.push({ item: it, off, price: Math.max(1, Math.round(it.price * (1 - off))), id: `black:${today}:${it.key}` });
  }
  return out;
}
/** 암시장이 열려 있는지: 오늘 하루 목표(주 목표 ÷ 7)를 채웠고, 잘 시각 2시간 전 ~ 잘 시각 (잘 시각을 모르면 21시 ~ 23시) */
export function blackWindow(today: DateStr, bed: number | null): { from: number; to: number } {
  const to = bed ?? Date.parse(`${today}T23:00:00+09:00`);
  return { from: to - 2 * 3_600_000, to };
}
export const dailyGoal = (m: MarketSettings) => Math.round(m.weeklyTarget / 7);

/** 타임 세일: 저녁 6시부터 1시간, 오늘 고른 이용권 하나가 1분마다 1%씩 내려간다 (60%까지) */
export function timeSale(m: MarketSettings, today: DateStr, now: number): { item: MarketItem; off: number; price: number; id: string; endsIn: number } | null {
  const start = Date.parse(`${today}T18:00:00+09:00`);
  if (now < start || now >= start + 3_600_000) return null;
  const pool = m.items.filter((x) => x.kind === 'game' || x.kind === 'fun');
  if (!pool.length) return null;
  const item = pool[Math.floor(seeded(today, 3)() * pool.length)];
  const off = Math.min(0.6, Math.floor((now - start) / 60_000) * 0.01);
  return { item, off, price: Math.max(1, Math.round(item.price * (1 - off))), id: `sale:${today}`, endsIn: start + 3_600_000 - now };
}

/** 조각 산 수 (물건마다) */
export const piecesOf = (m: MarketSettings, itemId: Id) => m.buys.filter((b) => b.itemId === itemId && b.piece).length;
