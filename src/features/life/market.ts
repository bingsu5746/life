// 시장 계산: 은화(100 은화 = 1금화). 버는 것 · 쓰는 것 · 벌금 · 은행 · 과목 주식 · 신용 점수.
// 버는 것과 벌금은 기록(공부 · 오답 · 시험 범위 · 습관 · 할 일)에서 그때그때 계산하고, 사고판 것 · 적금 · 대출만 저장한다.
import { addDays, daysBetween, diffDays, weekStart, weekday } from '../study/dates';
import { examEnd, upcomingExams } from '../study/exams';
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

const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const isWeekend = (date: DateStr) => weekday(date) === 0 || weekday(date) === 6;

export const newMarket = (today: DateStr): MarketSettings => ({
  since: today,
  weeklyTarget: 30 * 60,
  minDay: { weekday: 60, weekend: 120 },
  wonPerGold: 5000,
  items: [
    { id: 'game30', name: '게임 30분', kind: 'game', minutes: 30, price: 150 },
    { id: 'yt30', name: '유튜브 30분', kind: 'fun', minutes: 30, price: 100 },
  ],
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
  for (const n of alive(d.notes)) if (n.learned && ok(kst(n.updatedAt))) at(kst(n.updatedAt)).note += RULE.note;
  for (const e of alive(d.exams)) for (const sc of e.scopes ?? []) for (const l of sc.lines) if (l.done && l.at && ok(kst(l.at))) at(kst(l.at)).scope += RULE.scope;
  for (const h of alive(d.habits)) for (const c of h.checks) if (ok(c)) at(c).habit += RULE.habit;
  for (const t of alive(d.todos)) if (t.done && t.doneAt && ok(kst(t.doneAt))) at(kst(t.doneAt)).todo += RULE.todo;
  for (const x of map.values()) x.total = x.study + x.note + x.scope + x.habit + x.todo;
  return map;
}

/** 주급: since 뒤로 다 지난 주마다 (그다음 월요일에 받음) */
export function weeklyPays(d: D, m: MarketSettings, today: DateStr, inc = incomeByDay(d, m, today)): { week: DateStr; minutes: number; ratio: number; pay: number }[] {
  const out: { week: DateStr; minutes: number; ratio: number; pay: number }[] = [];
  for (let w = weekStart(m.since); addDays(w, 7) <= today; w = addDays(w, 7)) {
    if (w < m.since) continue; // 중간에 시작한 첫 주는 빼기
    const minutes = daysBetween(w, addDays(w, 6)).reduce((a, x) => a + (inc.get(x)?.minutes ?? 0), 0);
    const ratio = m.weeklyTarget ? minutes / m.weeklyTarget : 0;
    const pay = RULE.pay.find(([r]) => ratio >= r)?.[1] ?? 0;
    out.push({ week: w, minutes, ratio, pay });
  }
  return out;
}

// ===== 대출 =====

/** 대출 하나: 갚을 돈 (기한까지 이자 한 번, 넘기면 밀린 주마다 이자를 더) */
export function loanOwed(l: MarketSettings['loans'][number], today: DateStr): { owed: number; overdueDays: number; closed: boolean } {
  const late = Math.max(0, diffDays(l.due, today));
  const weeks = 1 + Math.ceil(late / 7);
  const total = Math.round(l.amount * (1 + l.rate * weeks));
  const paid = l.repays.reduce((a, r) => a + r.amount, 0);
  const owed = Math.max(0, total - paid);
  return { owed, overdueDays: owed > 0 ? late : 0, closed: owed === 0 };
}

/** 밀린 대출이 있는 날 (벌칙 공부 · 상점 정지) */
export function overdueOn(m: MarketSettings, date: DateStr): boolean {
  return m.loans.some((l) => {
    if (date <= l.due) return false;
    // 그날까지 다 갚았으면 밀린 것 아님
    const end = Date.parse(`${date}T23:59:59+09:00`);
    const paid = l.repays.filter((r) => r.at <= end).reduce((a, r) => a + r.amount, 0);
    const weeks = 1 + Math.ceil(diffDays(l.due, date) / 7);
    return paid < Math.round(l.amount * (1 + l.rate * weeks));
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
  for (const date of daysBetween(m.since, yesterday)) {
    const need = (isWeekend(date) ? m.minDay.weekend : m.minDay.weekday) + (overdueOn(m, date) ? RULE.penaltyMin : 0);
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
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ===== 게임 =====

/** 게임 이용권: 산 분 − 한 분. 모자라면 그 분만큼 이용권 값의 rawGame 배 */
export function gameUse(m: MarketSettings) {
  const bought = m.buys.filter((b) => b.kind === 'game').reduce((a, b) => a + (b.minutes ?? 0), 0);
  const played = Object.entries(m.play)
    .filter(([k]) => k >= m.since)
    .reduce((a, [, v]) => a + v, 0);
  const item = m.items.find((x) => x.kind === 'game' && x.minutes);
  const perMin = item ? item.price / (item.minutes ?? 30) : 5;
  const raw = Math.max(0, played - bought);
  return { bought, played, left: Math.max(0, bought - played), raw, charge: Math.round(raw * perMin * RULE.rawGame) };
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
export function priceOf(it: MarketItem, m: MarketSettings, d: Pick<StudyData, 'exams'>, today: DateStr): { price: number; tax: number; why: string } {
  if (it.kind === 'thing') return { price: Math.max(1, Math.round(((it.won ?? 0) / m.wonPerGold) * 100)), tax: 0, why: '' };
  const s = examSurge(d, today);
  const price = Math.round(it.price * s.factor);
  const rate = Math.min(RULE.luxMax, RULE.luxBase + RULE.luxPerHour * Math.floor(funThisWeek(m, today) / 60));
  return { price, tax: Math.round(price * rate), why: s.why };
}

// ===== 과목 주식 =====

/** 과목 주가 (은화): since 에 100 에서 시작해 날마다 — 공부 10분 +0.5%(하루 +8% 까지), 오답 해결 +2%, 그날 공부 안 하면 −1.5%(오늘은 빼고). 성적이 오르면 +10%, 내리면 −10% */
export function stockPrices(d: D, m: MarketSettings, today: DateStr): Map<Id, { price: number; prev: number; hist: number[] }> {
  const out = new Map<Id, { price: number; prev: number; hist: number[] }>();
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
  for (const sub of subs) {
    let p = 100;
    const hist: number[] = [];
    let prev = 100;
    for (const date of days) {
      const k = `${sub.id}|${date}`;
      const mm = min.get(k) ?? 0;
      // 오늘은 아직 끝나지 않았으니 안 한 날 내림은 내일부터
      let r = mm > 0 ? Math.min(0.08, Math.floor(mm / 10) * 0.005) : date === today ? 0 : -0.015;
      r += (notes.get(k) ?? 0) * 0.02 + (gradeMove.get(k) ?? 0);
      prev = p;
      p = Math.max(10, p * (1 + r));
      hist.push(Math.round(p * 100) / 100);
    }
    out.set(sub.id, { price: Math.round(p), prev: Math.round(prev), hist: hist.slice(-30) });
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
  const game = gameUse(m);
  const spent = m.buys.reduce((a, b) => a + b.price + b.tax, 0);
  const saveIn = m.savings.reduce((a, s) => a + s.amount, 0);
  const saveOut = m.savings.filter((s) => s.closedAt).reduce((a, s) => a + (s.closedAt! >= Date.parse(`${savingValue(s, today).ends}T00:00:00+09:00`) ? Math.round(s.amount * (1 + s.rate)) : s.amount), 0);
  const loanIn = m.loans.reduce((a, l) => a + l.amount, 0);
  const loanOut = m.loans.reduce((a, l) => a + l.repays.reduce((x, r) => x + r.amount, 0), 0);
  const prices = stockPrices(d, m, today);
  const stockNet = m.trades.reduce((a, t) => a - t.qty * t.price - Math.round(Math.abs(t.qty * t.price) * RULE.stockFee), 0);
  const balance = income + pay - fine - game.charge - spent - saveIn + saveOut + loanIn - loanOut + stockNet;
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
  const need = (isWeekend(today) ? m.minDay.weekend : m.minDay.weekday) + (overdue ? RULE.penaltyMin : 0);
  return { inc, income, pays, pay, fines: f, fine, game, spent, balance, owed, overdue, credit, band, limit, weekly, prices, hold, stockValue, savingNow, todayInc, need, net: balance + stockValue + savingNow - owed };
}
