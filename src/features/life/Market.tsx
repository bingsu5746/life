// 시장: 홈(지갑 · 알림) · 상점(오락 이용권 · 물건) · 은행(적금 · 대출 · 신용) · 주식(과목 주식) · 규칙
import { useEffect, useRef, useState } from 'react';
import { isLoggedIn, lolGames, lolProfile, steamMe } from '../auth/api';
import { addDays, diffDays, shortDate, weekStart } from '../study/dates';
import { alive, newId, type MarketItem, type MarketSettings, type MoneyTx } from '../study/model';
import { getStudy, put, setSettings, useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { confirmDelete, Empty, Field, go, Icon, Sheet, toast, useNow, useToday } from '../study/ui';
import { blackOpen } from './blackOpen';
import { lolDaily } from './GameTime';
import { companyName, tickerOf, avgDaily, betMult, betState, blackToday, contractMult, contractState, drawLotto, kst, lastGrade, loanOwed, LOTTO_PRICE, LOTTO_TABLE, marketNews, marketView, newMarket, piecesOf, priceOf, promoPrice, RULE, SAME_DAY_FINE, SAVING_PLANS, savingValue, seasonOf, TIERS, timeSale, voucherEnds, won } from './market';
import { dailyPlay } from './steamPlay';

const save = (p: Partial<MarketSettings>) => {
  const cur = getStudy().settings.market;
  if (cur) setSettings({ market: { ...cur, ...p } });
};

export function Market({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const m = d.settings.market;
  // 게임한 분을 받아 적어 둔다 (Steam · 롤, 하루 한 번쯤)
  useEffect(() => {
    if (!m || !isLoggedIn()) return;
    const sid = d.settings.steamId;
    const lid = d.settings.lolId;
    if (!sid && !lid) return;
    let gone = false;
    void Promise.all([
      sid ? steamMe(sid).then((r) => Object.fromEntries(dailyPlay(r.hist ?? {}).map((x) => [x.date, x.min]))).catch(() => ({})) : Promise.resolve({}),
      lid ? lolProfile(lid).then((p) => lolGames(p.puuid)).then((r) => lolDaily(r.games)).catch(() => ({})) : Promise.resolve({}),
    ]).then(([a, b]) => {
      if (gone) return;
      const cur = getStudy().settings.market;
      if (!cur) return;
      const play = { ...cur.play };
      let changed = false;
      for (const date of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (date < cur.since) continue;
        const v = ((a as Record<string, number>)[date] ?? 0) + ((b as Record<string, number>)[date] ?? 0);
        if (v > (play[date] ?? 0)) {
          play[date] = v;
          changed = true;
        }
      }
      if (changed) save({ play });
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!m, d.settings.steamId, d.settings.lolId]);
  // 대출이 밀렸으면 들어온 돈으로 먼저 갚는다 (압류)
  useEffect(() => {
    if (!m) return;
    const v = marketView(d, m, today);
    if (!v.overdue || v.balance <= 0) return;
    const l = m.loans.find((x) => loanOwed(x, today).overdueDays > 0);
    if (!l) return;
    const amount = Math.min(v.balance, loanOwed(l, today).owed);
    if (amount > 0) {
      save({ loans: m.loans.map((x) => (x.id === l.id ? { ...x, repays: [...x.repays, { at: Date.now(), amount }] } : x)) });
      toast(`밀린 대출에 ${won(amount)}을(를) 자동으로 갚았어요`);
    }
  }, [d, m, today]);

  if (!m)
    return (
      <div className="st-page narrow">
        <div className="st-page-head">
          <h2>시장</h2>
        </div>
        <Empty title="공부로 은화를 벌어서 오락 · 물건과 바꿔요">
          <p>공부 1분에 1은화(100은화 = 1금화), 오답 해결 · 시험 범위 체크 · 습관 · 할 일에 보너스, 주 목표를 채우면 금화 주급. 게임 · 유튜브는 이용권을 사서 하고, 은행에서 적금 · 대출, 과목 주식도 있어요. 오늘부터 세요.</p>
          <button className="btn btn-primary" onClick={() => setSettings({ market: newMarket(today) })}>
            시장 열기
          </button>
        </Empty>
      </div>
    );
  if (sub === 'shop') return <Shop m={m} />;
  if (sub === 'mine') return <Bag m={m} />;
  if (sub === 'dare') return <Dare m={m} />;
  if (sub === 'black') return <Black m={m} />;
  if (sub === 'bank') return <Bank m={m} />;
  if (sub === 'stocks') return <Stocks m={m} />;
  if (sub === 'rules') return <Rules m={m} />;
  return <MarketHome m={m} />;
}

/** 숫자가 바뀌면 부드럽게 올라가거나 내려가며 보이게 */
function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === target || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      from.current = target;
      setV(target);
      return;
    }
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(a + (target - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** 금화 · 은화를 크게 (금화 · 은화 따로) */
function Coins({ v, big }: { v: number; big?: boolean }) {
  const n = useCountUp(v);
  const a = Math.abs(n);
  return (
    <span className={`mt-coins ${big ? 'big' : ''} ${n < 0 ? 'neg' : ''}`}>
      {n < 0 && '−'}
      <b>{Math.floor(a / 100).toLocaleString('ko-KR')}</b>
      <i className="gold" aria-hidden />
      <small>금화</small>
      <b>{a % 100}</b>
      <i className="silver" aria-hidden />
      <small>은화</small>
    </span>
  );
}

function Wallet({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const t = v.todayInc?.total ?? 0;
  return (
    <section className="mt-hero">
      <small>가진 돈</small>
      <Coins v={v.balance} big />
      <div className="mt-hero-sub">
        {t > 0 && <span className="mt-pill up">오늘 +{won(t)}</span>}
        <span className="mt-pill">순자산 {won(v.net)}</span>
        <button className="mt-pill" onClick={() => go('/market/bank')}>
          신용 {v.credit.score}
        </button>
        <button className={`mt-pill tier r${v.rank}`} onClick={() => go('/market/shop')}>
          {TIERS[v.rank]}
        </button>
      </div>
    </section>
  );
}

/** 동그란 진행 고리 (채워지는 움직임) */
function Ring({ value, max, label, sub }: { value: number; max: number; label: string; sub: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const k = max ? Math.min(1, value / max) : 0;
  return (
    <div className="mt-ring">
      <svg viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r={r} className="track" />
        <circle cx="40" cy="40" r={r} className={`fill ${k >= 1 ? 'done' : ''}`} strokeDasharray={c} strokeDashoffset={c * (1 - k)} transform="rotate(-90 40 40)" />
      </svg>
      <div>
        <b>{Math.round(k * 100)}%</b>
      </div>
      <span>{label}</span>
      <small>{sub}</small>
    </div>
  );
}

function MarketHome({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const ws = weekStart(today);
  const weekMin = [...v.inc.values()].filter((x) => x.date >= ws && x.date <= today).reduce((a, x) => a + x.minutes, 0);
  const ratio = m.weeklyTarget ? weekMin / m.weeklyTarget : 0;
  const nextPay = RULE.pay.find(([r]) => ratio >= r)?.[1] ?? 0;
  // 날마다 과목별 공부 (거래 내역에 무엇을 공부했는지)
  const bySub = new Map<string, Map<string, number>>();
  for (const x of alive(d.sessions)) {
    if (x.date < m.since || x.date > today || x.minutes <= 0) continue;
    const day = bySub.get(x.date) ?? new Map<string, number>();
    const name = (x.subjectId && d.subjects[x.subjectId] && !d.subjects[x.subjectId].deleted && d.subjects[x.subjectId].name) || '기타';
    day.set(name, (day.get(name) ?? 0) + x.minutes);
    bySub.set(x.date, day);
  }
  const studyText = (date: string) =>
    [...(bySub.get(date) ?? new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .map(([n, mm]) => `${n} ${minutesText(mm)}`)
      .join(' · ');
  type Row = { k: string; date: string; kind: 'study' | 'pay' | 'fine' | 'buy' | 'bank' | 'stock' | 'dare'; text: string; sub?: string; amt: number };
  const ledger: Row[] = [
    ...[...v.inc.values()].map((x): Row => {
      const bonus = [x.note && `오답 ${won(x.note)}`, x.scope && `범위 ${won(x.scope)}`, x.habit && `습관 ${won(x.habit)}`, x.todo && `할 일 ${won(x.todo)}`, x.fever && `피버 ${won(x.fever)}`].filter(Boolean).join(' · ');
      return { k: `i${x.date}`, date: x.date, kind: 'study', text: `공부 ${minutesText(x.minutes)}`, sub: [studyText(x.date), bonus].filter(Boolean).join(' / '), amt: x.total };
    }),
    ...v.pays.filter((p) => p.pay).map((p): Row => ({ k: `p${p.week}`, date: addDays(p.week, 7), kind: 'pay', text: '주급', sub: `${shortDate(p.week)} 주 ${Math.round(p.ratio * 100)}%${p.streak >= 2 ? ` · ${p.streak}주 연속` : ''}`, amt: p.pay })),
    ...v.fines.map((f, i): Row => ({ k: `f${i}`, date: f.date, kind: 'fine', text: '벌금', sub: f.why, amt: -f.amount })),
    ...m.buys.map((b): Row => ({ k: b.id, date: kst(b.at), kind: 'buy', text: b.name, sub: b.tax ? `사치세 ${won(b.tax)}` : b.piece ? '조각' : undefined, amt: -(b.price + b.tax) })),
    ...m.loans.flatMap((l): Row[] => [{ k: `l${l.id}`, date: kst(l.at), kind: 'bank', text: '대출', amt: l.amount }, ...l.repays.map((r, i): Row => ({ k: `r${l.id}${i}`, date: kst(r.at), kind: 'bank', text: '대출 갚음', amt: -r.amount }))]),
    ...m.savings.flatMap((sv): Row[] => [{ k: `s${sv.id}`, date: kst(sv.at), kind: 'bank', text: `적금 ${sv.weeks}주`, amt: -sv.amount }, ...(sv.closedAt ? [{ k: `c${sv.id}`, date: kst(sv.closedAt), kind: 'bank' as const, text: '적금 찾음', amt: sv.closedAt >= Date.parse(`${savingValue(sv, today).ends}T00:00:00+09:00`) ? Math.round(sv.amount * (1 + sv.rate)) : sv.amount }] : [])]),
    ...m.trades.map((t): Row => ({ k: t.id, date: kst(t.at), kind: 'stock', text: `${companyName(d.subjects[t.subjectId]?.name ?? '과목', t.subjectId)} ${t.qty > 0 ? '매수' : '매도'}`, sub: `${Math.abs(t.qty)}주 × ${won(t.price)}`, amt: -t.qty * t.price - Math.round(Math.abs(t.qty * t.price) * RULE.stockFee) })),
    ...(v.game.charge ? [{ k: 'game', date: today, kind: 'fine' as const, text: '무단 게임', sub: minutesText(v.game.raw), amt: -v.game.charge }] : []),
    ...(m.contracts ?? []).map((c): Row => ({ k: c.id, date: c.date, kind: 'dare', text: '악마의 계약서', sub: `순공 ${minutesText(c.minutes)} · ×${c.mult}`, amt: contractState(c, v.inc, today) === 'won' ? Math.round(c.stake * c.mult) - c.stake : contractState(c, v.inc, today) === 'lost' ? -c.stake : -c.stake })),
    ...(m.lotto ?? []).map((l): Row => ({ k: l.id, date: kst(l.at), kind: 'dare', text: '공부 복권', sub: `당첨 ${won(l.prize)}`, amt: l.prize - l.price })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.amt - b.amt);
  const days = [...new Set(ledger.map((r) => r.date))].slice(0, 14);
  return (
    <div className="st-page narrow mt">
      <Wallet m={m} />
      {v.overdue && (
        <button className="mt-alert" onClick={() => go('/market/bank')}>
          <b>대출 연체</b>
          <span>상점 정지 · 벌칙 공부 +{RULE.penaltyMin}분 · 남은 빚 {won(v.owed)}</span>
        </button>
      )}
      {v.game.raw > 0 && (
        <div className="mt-alert">
          <b>무단 게임 {minutesText(v.game.raw)}</b>
          <span>−{won(v.game.charge)}</span>
        </div>
      )}
      <div className="mt-rings">
        <Ring value={v.todayInc?.minutes ?? 0} max={v.need} label="오늘" sub={`${minutesText(v.todayInc?.minutes ?? 0)} / ${minutesText(v.need)}`} />
        <Ring value={weekMin} max={m.weeklyTarget} label="이번 주" sub={`주급 ${won(nextPay)}`} />
      </div>
      <NewsBoard m={m} />
      <section className="mt-panel">
        <h3>거래 내역</h3>
        {days.map((day, di) => {
          const rows = ledger.filter((r) => r.date === day);
          const net = rows.reduce((x, r) => x + r.amt, 0);
          return (
            <div key={day} className="mt-day" style={{ ['--i' as string]: Math.min(di, 8) }}>
              <div className="mt-day-head">
                <span>{shortDate(day)}</span>
                <em className={net < 0 ? 'down' : 'up'}>
                  {net > 0 ? '+' : ''}
                  {won(net)}
                </em>
              </div>
              {rows.map((r) => (
                <div key={r.k} className="mt-row">
                  <i className={`mt-dot k-${r.kind}`} aria-hidden>
                    <Icon name={LEDGER_ICON[r.kind]} />
                  </i>
                  <span>
                    <b>{r.text}</b>
                    {r.sub && <small>{r.sub}</small>}
                  </span>
                  <em className={r.amt < 0 ? 'down' : 'up'}>
                    {r.amt > 0 ? '+' : ''}
                    {won(r.amt)}
                  </em>
                </div>
              ))}
            </div>
          );
        })}
        {!ledger.length && <p className="st-muted">공부를 기록하면 은화가 들어와요.</p>}
      </section>
    </div>
  );
}

const LEDGER_ICON = { study: 'books', pay: 'coin', fine: 'scale', buy: 'bag', bank: 'bank', stock: 'chart', dare: 'flag' } as const;

/** 오늘의 시장 뉴스 (실검처럼 1~10위, 하나씩 나타남) */
function NewsBoard({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const news = marketNews(d, m, today);
  if (!news.length) return null;
  return (
    <section className="mt-panel">
      <h3>시장 뉴스</h3>
      <ol className="mt-news">
        {news.map((n) => (
          <li key={n.rank} className={n.tone} style={{ ['--i' as string]: n.rank }}>
            <b>{n.rank}</b>
            <span>
              {n.title}
              {n.why && <small>{n.why}</small>}
            </span>
            <i aria-hidden>{n.tone === 'up' ? '▲' : n.tone === 'down' ? '▼' : n.tone === 'warn' ? '!' : '·'}</i>
          </li>
        ))}
      </ol>
    </section>
  );
}

const KIND_NAME: Record<MarketItem['kind'], string> = { game: '게임', fun: '오락', meet: '약속', pass: '쉬기권', perk: '아이템', thing: '물건' };

/** 눌러서 상점에 넣을 수 있는 것들 */
const IDEAS: Omit<MarketItem, 'id'>[] = [
  { name: '게임 30분', kind: 'game', minutes: 30, price: 225 },
  { name: '게임 1시간', kind: 'game', minutes: 60, price: 420 },
  { name: '게임 3시간 (주말)', kind: 'game', minutes: 180, price: 1125 },
  { name: '숏폼 20분', kind: 'fun', minutes: 20, price: 120 },
  { name: '유튜브 30분', kind: 'fun', minutes: 30, price: 150 },
  { name: '넷플릭스 · 드라마 한 편', kind: 'fun', minutes: 60, price: 270 },
  { name: '영화 한 편 (집)', kind: 'fun', minutes: 120, price: 450 },
  { name: '웹툰 30분', kind: 'fun', minutes: 30, price: 120 },
  { name: 'SNS 30분', kind: 'fun', minutes: 30, price: 150 },
  { name: '만화책 한 권', kind: 'fun', minutes: 60, price: 180 },
  { name: '늦잠 1시간', kind: 'fun', minutes: 60, price: 225 },
  { name: '늦게 자기 1시간', kind: 'fun', minutes: 60, price: 300 },
  { name: '배달 음식', kind: 'fun', minutes: 30, price: 375 },
  { name: '카페 디저트', kind: 'fun', minutes: 30, price: 225 },
  { name: '친구랑 놀기 반나절', kind: 'meet', minutes: 240, price: 750 },
  { name: '친구랑 노래방', kind: 'meet', minutes: 90, price: 375 },
  { name: '친구랑 PC방 2시간', kind: 'meet', minutes: 120, price: 600 },
  { name: '영화 보러 가기', kind: 'meet', minutes: 180, price: 600 },
  { name: '쇼핑하러 가기', kind: 'meet', minutes: 180, price: 525 },
  { name: '가족 외식', kind: 'meet', minutes: 120, price: 225 },
  { name: '하루 쉬기권', kind: 'pass', price: 2250 },
  { name: '피버타임 물약 (1시간 2배)', kind: 'perk', effect: 'fever', price: 600 },
  { name: '연속 달성 실드', kind: 'perk', effect: 'shield', price: 900 },
  { name: '음악 들으며 문제 풀기 1시간', kind: 'perk', effect: 'permit', price: 90 },
  { name: '게임 과금 허가권', kind: 'perk', effect: 'permit', price: 450 },
];

type Sort = 'rec' | 'low' | 'high' | 'long' | 'cheap';
const SORTS: [Sort, string][] = [
  ['rec', '기본'],
  ['low', '싼 순'],
  ['high', '비싼 순'],
  ['long', '긴 시간'],
  ['cheap', '분당 싼 순'],
];

/** 상점에서 사기 (타임 세일 · 암시장 값이면 price 로) */
function useBuy(m: MarketSettings) {
  const d = useStudy();
  const today = useToday();
  const now = useNow(30_000);
  const v = marketView(d, m, today);
  const ctx = { now, todayMin: v.todayInc?.minutes ?? 0, need: v.need };
  return {
    v,
    ctx,
    buy: (it: MarketItem, special?: { id: string; price: number; tax?: number }) => {
      if (v.overdue) return toast('대출 연체 중이라 상점을 쓸 수 없어요'), false;
      if (it.tier && v.rank < it.tier) return toast(`${TIERS[it.tier]} 티어부터 살 수 있어요`), false;
      const p = special ? { price: special.price, tax: special.tax ?? 0 } : priceOf(it, m, d, today, ctx);
      const cost = p.price + p.tax;
      if (v.balance < cost) return toast(`${won(cost - v.balance)} 모자라요`), false;
      const vch = it.kind !== 'thing';
      const piece = it.kind === 'thing' && !!it.pieces;
      if (!window.confirm(`${it.name}${piece ? ' 한 조각' : ''}\n${won(cost)}${p.tax ? ` (사치세 ${won(p.tax)} 포함)` : ''}${vch ? `\n${shortDate(voucherEnds(Date.now()))}까지` : ''}`)) return false;
      save({ buys: [...m.buys, { id: newId(), itemId: special?.id ?? it.id, name: it.name, kind: it.kind, minutes: it.minutes, price: p.price, tax: p.tax, at: Date.now(), expires: vch ? voucherEnds(Date.now()) : undefined, effect: it.effect, piece: piece || undefined }] });
      return true;
    },
  };
}

/** 조각: 산 만큼 아래에서부터 칠해지는 동그라미 */
function PieceFill({ name, got, of }: { name: string; got: number; of: number }) {
  const k = Math.min(1, got / of);
  return (
    <span className="mt-piece" style={{ ['--k' as string]: k }} aria-label={`${got}/${of}조각`}>
      <b>{[...name][0]}</b>
    </span>
  );
}

function Shop({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const { v, ctx, buy } = useBuy(m);
  const [edit, setEdit] = useState<MarketItem | 'new' | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<'all' | MarketItem['kind']>('all');
  const [sort, setSort] = useState<Sort>('rec');
  const [pop, setPop] = useState('');
  const sale = timeSale(m, today, ctx.now);
  const saleBought = sale && m.buys.some((b) => b.itemId === sale.id);
  const tap = (it: MarketItem) => {
    if (buy(it)) {
      setPop(it.id);
      setTimeout(() => setPop(''), 900);
    }
  };
  const cost = (it: MarketItem) => {
    const p = priceOf(it, m, d, today, ctx);
    return p.price + p.tax;
  };
  const list = m.items
    .filter((x) => kind === 'all' || x.kind === kind)
    .sort((a, b) => (sort === 'low' ? cost(a) - cost(b) : sort === 'high' ? cost(b) - cost(a) : sort === 'long' ? (b.minutes ?? 0) - (a.minutes ?? 0) : sort === 'cheap' ? cost(a) / (a.minutes || 1e6) - cost(b) / (b.minutes || 1e6) : 0));
  const kinds = (Object.keys(KIND_NAME) as MarketItem['kind'][]).filter((k) => m.items.some((x) => x.kind === k));
  const live = m.buys.filter((b) => b.kind !== 'thing' && b.kind !== 'game' && b.effect !== 'shield' && !b.usedAt && !b.passDate && (b.expires ?? voucherEnds(b.at)) >= today);
  const shields = m.buys.filter((b) => b.effect === 'shield').length - v.pays.filter((p) => p.shield).length;
  // 다 모은 조각 물건 · 한 번에 산 물건 중 아직 실제로 안 산 것
  const waiting = m.items
    .filter((it) => it.kind === 'thing')
    .flatMap((it) => {
      const bs = m.buys.filter((b) => b.itemId === it.id && !b.used);
      if (it.pieces) return piecesOf(m, it.id) >= it.pieces && bs.length ? [bs[bs.length - 1]] : [];
      return bs;
    });
  return (
    <div className="st-page narrow mt">
      <Wallet m={m} />
      {sale && !saleBought && (
        <button className="mt-sale" onClick={() => buy(sale.item, { id: sale.id, price: sale.price })}>
          <small>타임 세일 · {Math.ceil(sale.endsIn / 60_000)}분 남음</small>
          <b>{sale.item.name}</b>
          <span>
            <s>{won(sale.item.price)}</s> {won(sale.price)} <em>−{Math.round(sale.off * 100)}%</em>
          </span>
        </button>
      )}
      <button className="mt-baglink" onClick={() => go('/market/mine')}>
        <Icon name="ticket" />
        <span>
          <b>보관함</b>
          <small>{live.length + (v.game.left > 0 ? 1 : 0) + (shields > 0 ? 1 : 0) + waiting.length ? `쓸 수 있는 것 ${live.length + (v.game.left > 0 ? 1 : 0) + (shields > 0 ? 1 : 0)}개${waiting.length ? ` · 살 물건 ${waiting.length}개` : ''}` : '아직 산 것이 없어요'}</small>
        </span>
        <Icon name="chevron" />
      </button>
      <TierCard m={m} />
      <div className="mt-toolbar">
        <div className="mt-filter" role="group" aria-label="종류">
          {(['all', ...kinds] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'all' ? '전체' : KIND_NAME[k]}
            </button>
          ))}
        </div>
        <select className="mt-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          {SORTS.map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-goods">
        {list.map((it, i) => {
          const p = priceOf(it, m, d, today, ctx);
          const locked = !!it.tier && v.rank < it.tier;
          const got = it.pieces ? piecesOf(m, it.id) : 0;
          const full = !!it.pieces && got >= it.pieces;
          const short = v.balance < p.price + p.tax || v.overdue || locked || full;
          return (
            <div key={it.id} className={`mt-good ${it.kind} ${short ? 'short' : ''} ${pop === it.id ? 'pop' : ''} ${locked ? 'locked' : ''}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
              <button className="mt-good-buy" onClick={() => !full && tap(it)}>
                <small>
                  {KIND_NAME[it.kind]}
                  {locked && ` · ${TIERS[it.tier!]}부터`}
                </small>
                {it.pieces && <PieceFill name={it.name} got={got} of={it.pieces} />}
                <b>{it.name}</b>
                <span className="mt-good-meta">{it.kind === 'thing' ? `${(it.won ?? 0).toLocaleString('ko-KR')}원${it.pieces ? ` · ${got}/${it.pieces}조각` : ''}` : it.kind === 'pass' ? '하루' : it.kind === 'perk' ? '' : minutesText(it.minutes ?? 0)}</span>
                <span className="mt-price">
                  {full ? '다 모음' : `${won(p.price + p.tax)}${it.pieces ? ' / 조각' : ''}`}
                  {!full && p.price > p.base && <i className="up">▲</i>}
                  {!full && p.price < p.base && <i className="down">▼</i>}
                </span>
              </button>
              <button className="mt-good-edit" aria-label={`${it.name} 고치기`} onClick={() => setEdit(it)}>
                ···
              </button>
            </div>
          );
        })}
        <button className="mt-good add" onClick={() => setAdding(true)}>
          <b>＋</b>
          <span>더 넣기</span>
        </button>
      </div>
      {adding && (
        <Sheet title="상점에 넣기" onClose={() => setAdding(false)}>
          <div className="mt-ideas">
            {(['game', 'fun', 'meet', 'pass', 'perk'] as const).map((k) => {
              const xs = IDEAS.filter((x) => x.kind === k && !m.items.some((y) => y.name === x.name));
              return xs.length ? (
                <div key={k}>
                  <small>{KIND_NAME[k]}</small>
                  <div className="st-chips">
                    {xs.map((x) => (
                      <button key={x.name} className="st-chip" onClick={() => save({ items: [...m.items, { ...x, id: newId() }] })}>
                        {x.name} · {won(x.price)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
            <button className="btn" onClick={() => go('/money/wish')}>
              위시리스트에서 물건 올리기
            </button>
            <button
              className="btn"
              onClick={() => {
                setAdding(false);
                setEdit('new');
              }}
            >
              직접 만들기
            </button>
          </div>
        </Sheet>
      )}
      {edit && <ItemSheet m={m} item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** 보관함: 산 이용권 · 아이템 · 물건 (쓸 수 있는 것 · 쓸 날 정한 것 · 모으는 조각 · 지난 것) */
function Bag({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const [useDay, setUseDay] = useState<MarketSettings['buys'][number] | null>(null);
  const realBuy = (b: MarketSettings['buys'][number]) => {
    const it = m.items.find((x) => x.id === b.itemId);
    save({ buys: m.buys.map((x) => (x.id === b.id || (x.itemId === b.itemId && x.piece) ? { ...x, used: true } : x)) });
    if (it?.won) {
      put('moneyTx', { id: newId(), date: today, type: 'out', amount: it.won, category: '쇼핑', memo: `${b.name} (시장)`, created: Date.now() } as MoneyTx);
      if (it.wishId && d.wishes[it.wishId]) put('wishes', { ...d.wishes[it.wishId], status: 'done', doneDate: today });
      toast(`돈 › 쓴 돈에 ${it.won.toLocaleString('ko-KR')}원`);
    }
  };
  const live = m.buys.filter((b) => b.kind !== 'thing' && b.kind !== 'game' && b.effect !== 'shield' && !b.usedAt && !b.passDate && (b.expires ?? voucherEnds(b.at)) >= today);
  const shields = m.buys.filter((b) => b.effect === 'shield').length - v.pays.filter((p) => p.shield).length;
  // 다 모은 조각 물건 · 한 번에 산 물건 중 아직 실제로 안 산 것
  const waiting = m.items
    .filter((it) => it.kind === 'thing')
    .flatMap((it) => {
      const bs = m.buys.filter((b) => b.itemId === it.id && !b.used);
      if (it.pieces) return piecesOf(m, it.id) >= it.pieces && bs.length ? [bs[bs.length - 1]] : [];
      return bs;
    });
  const planned = m.buys.filter((b) => b.passDate && b.passDate >= today).sort((a, b) => a.passDate!.localeCompare(b.passDate!));
  const collecting = m.items.filter((it) => it.kind === 'thing' && it.pieces && piecesOf(m, it.id) > 0 && piecesOf(m, it.id) < it.pieces);
  const past = m.buys
    .filter((b) => b.kind !== 'thing' && b.kind !== 'game' && b.effect !== 'shield' && !live.includes(b) && !planned.includes(b))
    .sort((a, b) => (b.usedAt ?? b.at) - (a.usedAt ?? a.at))
    .slice(0, 30);
  const empty = !live.length && !v.game.left && shields <= 0 && !waiting.length && !planned.length && !collecting.length;
  return (
    <div className="st-page narrow mt">
      <div className="st-page-head">
        <h2>보관함</h2>
      </div>
      {empty && (
        <Empty title="쓸 수 있는 이용권이 없어요">
          <button className="btn btn-primary" onClick={() => go('/market/shop')}>
            상점 가기
          </button>
        </Empty>
      )}
      {(live.length > 0 || v.game.left > 0 || shields > 0) && (
        <section className="mt-panel">
          <h3>지금 쓸 수 있는 것</h3>
          <div className="mt-tickets">
          {v.game.left > 0 && (
            <div className="mt-ticket game">
              <small>게임</small>
              <b>{minutesText(v.game.left)}</b>
              <span>자동으로 써요</span>
            </div>
          )}
          {shields > 0 && (
            <div className="mt-ticket perk">
              <small>아이템</small>
              <b>연속 실드 {shields}개</b>
              <span>자동으로 써요</span>
            </div>
          )}
          {live.map((b) => {
            const ends = b.expires ?? voucherEnds(b.at);
            const left = diffDays(today, ends);
            const fresh = kst(b.at) === today;
            return (
              <div key={b.id} className={`mt-ticket ${b.kind}`}>
                <small>{KIND_NAME[b.kind]}</small>
                <b>{b.name}</b>
                <span>
                  {left === 0 ? '오늘까지' : `D-${left}`} · {shortDate(kst(b.at))} 삼
                </span>
                <button
                  onClick={() => {
                    if (b.kind === 'pass' || b.effect === 'half') return setUseDay(b);
                    if (b.kind !== 'perk' && fresh && !window.confirm(`오늘 산 이용권이에요. 쓰면 벌금 ${won(Math.round(b.price * SAME_DAY_FINE))}`)) return;
                    save({ buys: m.buys.map((x) => (x.id === b.id ? { ...x, usedAt: Date.now() } : x)) });
                    if (b.effect === 'fever') toast('피버타임! 1시간 동안 공부 은화 2배');
                  }}
                >
                  쓰기
                </button>
              </div>
            );
          })}
          </div>
        </section>
      )}
      {planned.length > 0 && (
        <section className="mt-panel">
          <h3>쓸 날 정해 둔 것</h3>
          {planned.map((b) => (
            <div key={b.id} className="mt-row">
              <span>
                <b>{b.name}</b>
                <small>{b.passDate === today ? '오늘' : shortDate(b.passDate!)}</small>
              </span>
            </div>
          ))}
        </section>
      )}
      {waiting.length > 0 && (
        <section className="mt-panel">
          <h3>실제로 살 물건</h3>
          {waiting.map((b) => (
            <div key={b.id} className="mt-row">
              <span>
                <b>{b.name}</b>
                <small>{shortDate(kst(b.at))}</small>
              </span>
              <button className="btn btn-sm" onClick={() => realBuy(b)}>
                실제로 샀어요
              </button>
            </div>
          ))}
        </section>
      )}
      {collecting.length > 0 && (
        <section className="mt-panel">
          <h3>모으는 조각</h3>
          {collecting.map((it) => (
            <div key={it.id} className="mt-row">
              <span>
                <b>{it.name}</b>
                <small>
                  {piecesOf(m, it.id)} / {it.pieces}조각
                </small>
              </span>
            </div>
          ))}
        </section>
      )}
      {past.length > 0 && (
        <section className="mt-panel">
          <h3>지난 것</h3>
          {past.map((b) => (
            <div key={b.id} className="mt-row lost">
              <span>
                <b>{b.name}</b>
                <small>{b.usedAt ? `${shortDate(kst(b.usedAt))} 씀` : `${shortDate(b.expires ?? voucherEnds(b.at))} 기한 지남`}</small>
              </span>
              <em>{won(b.price + b.tax)}</em>
            </div>
          ))}
        </section>
      )}
      {useDay && <DaySheet m={m} b={useDay} onClose={() => setUseDay(null)} />}
    </div>
  );
}

/** 하루 쉬기권 · 내일 계획 반토막권: 쓸 날 고르기 (기한 안. 쉬기권은 산 날이면 벌금, 반토막권은 내일부터) */
function DaySheet({ m, b, onClose }: { m: MarketSettings; b: MarketSettings['buys'][number]; onClose: () => void }) {
  const today = useToday();
  const ends = b.expires ?? voucherEnds(b.at);
  const half = b.effect === 'half';
  const first = half ? addDays(today, 1) : today;
  const days = Array.from({ length: Math.max(0, diffDays(first, ends)) + 1 }, (_, i) => addDays(first, i));
  const taken = new Set(m.buys.filter((x) => x.passDate && (x.effect === 'half') === half).map((x) => x.passDate));
  return (
    <Sheet title={half ? '계획을 반으로 줄일 날' : '쉴 날 고르기'} onClose={onClose}>
      <div className="st-chips">
        {days.map((x) => (
          <button
            key={x}
            className="st-chip"
            disabled={taken.has(x)}
            onClick={() => {
              if (!half && x === kst(b.at) && !window.confirm(`산 날 쓰면 벌금 ${won(Math.round(b.price * SAME_DAY_FINE))}`)) return;
              save({ buys: m.buys.map((y) => (y.id === b.id ? { ...y, passDate: x, usedAt: Date.parse(`${x}T12:00:00+09:00`) } : y)) });
              toast(half ? `${shortDate(x)}은(는) 최소 공부 절반` : `${shortDate(x)}은(는) 쉬는 날`);
              onClose();
            }}
          >
            {shortDate(x)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** 티어 카드: 지금 티어 · 점수 · 승급 심사 */
function TierCard({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const t = v.tier;
  const next = v.rank + 1;
  const can = next <= 3 && t.eligible >= next;
  const price = promoPrice(v.rank);
  return (
    <section className={`mt-tier r${v.rank}`}>
      <div>
        <small>{seasonOf(today)}</small>
        <b>{TIERS[v.rank]}</b>
      </div>
      <div className="mt-tier-bar" aria-label={`티어 점수 ${t.score}`}>
        <i style={{ width: `${t.score}%` }} />
        {[40, 60, 80].map((x) => (
          <em key={x} style={{ left: `${x}%` }} />
        ))}
      </div>
      <small className="st-muted">
        공부 {t.parts.study}/50 · 모의고사 {t.parts.mock}/30 · 자산 {t.parts.money}/20
      </small>
      {next <= 3 && (
        <button
          className="btn btn-sm"
          disabled={!can || v.balance < price || v.overdue}
          onClick={() => {
            if (!window.confirm(`${TIERS[next]} 승급 심사권 ${won(price)}`)) return;
            save({ buys: [...m.buys, { id: newId(), itemId: `promo:${seasonOf(today)}:${next}`, name: `${TIERS[next]} 승급 심사권`, kind: 'perk', price, tax: 0, at: Date.now() }], tier: { season: seasonOf(today), rank: next } });
            toast(`${TIERS[next]} 승급!`);
          }}
        >
          {can ? `${TIERS[next]} 승급 심사 · ${won(price)}` : `${TIERS[next]}까지 ${[40, 60, 80][v.rank] - t.score}점`}
        </button>
      )}
    </section>
  );
}

/** 도전: 악마의 계약서 · 성적 배당권 · 공부 복권 */
function Dare({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const [sheet, setSheet] = useState<'' | 'deal' | 'bet'>('');
  const [roll, setRoll] = useState<number | null>(null);
  const avg = avgDaily(v.inc, today);
  const deals = [...(m.contracts ?? [])].reverse().slice(0, 10);
  const bets = [...(m.bets ?? [])].reverse();
  const lotto = m.lotto ?? [];
  const STATE = { won: '성공', lost: '실패', open: '진행 중' };
  return (
    <div className="st-page narrow mt">
      <Wallet m={m} />
      <section className="mt-panel mt-dare">
        <h3>악마의 계약서</h3>
        {deals.map((c) => {
          const s = contractState(c, v.inc, today);
          const got = v.inc.get(c.date)?.minutes ?? 0;
          return (
            <div key={c.id} className={`mt-row ${s}`}>
              <span>
                <b>
                  {shortDate(c.date)} 순공 {minutesText(c.minutes)}
                </b>
                <small>
                  {won(c.stake)} × {c.mult} · {s === 'open' ? `${minutesText(got)} 했어요` : STATE[s]}
                </small>
              </span>
              {s === 'open' ? <div className="mt-meter wide"><i style={{ width: `${Math.min(100, (got / c.minutes) * 100)}%` }} /></div> : <em className={s === 'won' ? 'up' : 'down'}>{s === 'won' ? `+${won(Math.round(c.stake * c.mult) - c.stake)}` : `−${won(c.stake)}`}</em>}
            </div>
          );
        })}
        <button className="btn btn-sm" disabled={v.overdue || (m.contracts ?? []).some((c) => c.date === today)} onClick={() => setSheet('deal')}>
          오늘 계약하기
        </button>
      </section>
      <section className="mt-panel mt-dare">
        <h3>성적 배당권</h3>
        {bets.map((b) => {
          const s = betState(b, d, today);
          return (
            <div key={b.id} className={`mt-row ${s.state}`}>
              <span>
                <b>
                  {b.kind === 'mock' ? '모의고사' : '내신'} {b.subject} {b.target}등급 이내
                </b>
                <small>
                  {won(b.stake)} × {b.mult} · {s.state === 'open' ? `${shortDate(b.until)}까지` : `${s.name ?? ''} ${s.got ? `${s.got}등급` : ''} ${STATE[s.state]}`}
                </small>
              </span>
              {s.state !== 'open' && <em className={s.state === 'won' ? 'up' : 'down'}>{s.state === 'won' ? `+${won(Math.round(b.stake * b.mult) - b.stake)}` : `−${won(b.stake)}`}</em>}
            </div>
          );
        })}
        <button className="btn btn-sm" disabled={v.overdue} onClick={() => setSheet('bet')}>
          배당권 사기
        </button>
      </section>
      <section className="mt-panel mt-dare">
        <h3>공부 복권 · 한 장 {won(LOTTO_PRICE)}</h3>
        <div className={`mt-lotto ${roll !== null ? 'show' : ''}`} key={lotto.length}>
          {roll !== null ? <b className={roll >= LOTTO_PRICE ? 'up' : ''}>{won(roll)}</b> : <b>?</b>}
        </div>
        <button
          className="btn btn-primary"
          disabled={v.balance < LOTTO_PRICE || v.overdue}
          onClick={() => {
            const prize = drawLotto();
            save({ lotto: [...lotto, { id: newId(), at: Date.now(), price: LOTTO_PRICE, prize }] });
            setRoll(prize);
          }}
        >
          긁기
        </button>
        <div className="mt-odds">
          {LOTTO_TABLE.map((x) => (
            <span key={x.prize}>
              {won(x.prize)} <small>{(x.p * 100).toFixed(1)}%</small>
            </span>
          ))}
        </div>
        {lotto.length > 0 && (
          <small className="st-muted">
            {lotto.length}장 · 낸 돈 {won(lotto.reduce((a, l) => a + l.price, 0))} · 받은 돈 {won(lotto.reduce((a, l) => a + l.prize, 0))}
          </small>
        )}
      </section>
      {sheet === 'deal' && <DealSheet m={m} avg={avg} studied={v.todayInc?.minutes ?? 0} balance={v.balance} onClose={() => setSheet('')} />}
      {sheet === 'bet' && <BetSheet m={m} balance={v.balance} onClose={() => setSheet('')} />}
    </div>
  );
}

function DealSheet({ m, avg, studied, balance, onClose }: { m: MarketSettings; avg: number; studied: number; balance: number; onClose: () => void }) {
  const today = useToday();
  // 이미 한 것보다 1시간 이상 더 해야 하는 목표만 (거의 다 한 걸로 쉽게 벌지 않게)
  const opts = [120, 180, 240, 300, 360, 480].filter((x) => x >= studied + 60);
  const [target, setTarget] = useState(opts[0] ?? 0);
  const [amt, setAmt] = useState('');
  const a = silver(amt);
  const mult = contractMult(target, avg);
  return (
    <Sheet title="악마의 계약서" onClose={onClose}>
      <div className="st-form">
        <p className="st-sub">오늘 밤 12시까지 순공</p>
        <div className="mt-plans">
          {opts.map((x) => (
            <button key={x} className={target === x ? 'on' : ''} onClick={() => setTarget(x)}>
              <b>{minutesText(x)}</b>
              <span>×{contractMult(x, avg)}</span>
            </button>
          ))}
        </div>
        {!opts.length && <p className="st-hint">오늘은 더 걸 수 있는 목표가 없어요.</p>}
        <div className="mt-amount">
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" aria-label="걸 금화" />
          <span>금화</span>
        </div>
        {a > 0 && (
          <p className="st-sub">
            성공하면 {won(Math.round(a * mult))} · 실패하면 {won(a)} 사라짐 (지금 {minutesText(studied)})
          </p>
        )}
        <button
          className="btn btn-primary"
          disabled={!target || !a || a > balance}
          onClick={() => {
            save({ contracts: [...(m.contracts ?? []), { id: newId(), at: Date.now(), date: today, minutes: target, stake: a, mult }] });
            toast('계약했어요');
            onClose();
          }}
        >
          서명하기
        </button>
      </div>
    </Sheet>
  );
}

function BetSheet({ m, balance, onClose }: { m: MarketSettings; balance: number; onClose: () => void }) {
  const d = useStudy();
  const today = useToday();
  const [kind, setKind] = useState<'school' | 'mock'>('mock');
  const names = [...new Set([...(kind === 'mock' ? ['국어', '수학', '영어', '한국사', '탐구1', '탐구2'] : []), ...alive(d.grades).filter((r) => r.kind === kind).flatMap((r) => r.scores.map((s) => s.subject)), ...(kind === 'school' ? alive(d.subjects).map((s) => s.name) : [])])].slice(0, 20);
  const [subject, setSubject] = useState(names[0] ?? '');
  const [target, setTarget] = useState(1);
  const [until, setUntil] = useState(addDays(today, 60));
  const [amt, setAmt] = useState('');
  const now = subject ? lastGrade(d, kind, subject) : null;
  const mult = betMult(now, target);
  const a = silver(amt);
  return (
    <Sheet title="성적 배당권" onClose={onClose}>
      <div className="st-form">
        <div className="st-seg">
          {(['mock', 'school'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'mock' ? '모의고사' : '내신'}
            </button>
          ))}
        </div>
        <div className="st-chips">
          {names.map((n) => (
            <button key={n} className={`st-chip ${subject === n ? 'on' : ''}`} onClick={() => setSubject(n)}>
              {n}
            </button>
          ))}
        </div>
        <div className="mt-plans">
          {[1, 2, 3].map((g) => (
            <button key={g} className={target === g ? 'on' : ''} onClick={() => setTarget(g)}>
              <b>{g}등급</b>
              <span>×{betMult(now, g)}</span>
            </button>
          ))}
        </div>
        <small className="st-muted">지금 {now ? `${now}등급` : '성적 없음'} · 성적 칸에 넣은 그 기간의 첫 성적으로 판정</small>
        <label className="st-cond-time">
          언제까지
          <input className="st-input sm" type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <div className="mt-amount">
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" aria-label="걸 금화" />
          <span>금화</span>
        </div>
        {a > 0 && <p className="st-sub">달성하면 {won(Math.round(a * mult))}</p>}
        <button
          className="btn btn-primary"
          disabled={!subject || !a || a > balance || until < today}
          onClick={() => {
            save({ bets: [...(m.bets ?? []), { id: newId(), at: Date.now(), kind, subject, target, stake: a, mult, until }] });
            toast('배당권을 샀어요');
            onClose();
          }}
        >
          사기
        </button>
      </div>
    </Sheet>
  );
}

/** 암시장: 오늘 목표를 채운 날, 잘 시각 2시간 전부터만 */
function Black({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const now = useNow(30_000);
  const { buy } = useBuy(m);
  const b = blackOpen(d, today, now);
  const hm = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(11, 16);
  if (!b.open)
    return (
      <div className="st-page narrow mt">
        <section className="mt-black closed">
          <b>암시장은 닫혀 있어요</b>
          <small>
            {b.done ? `${hm(b.from)} ~ ${hm(b.to)}에 열려요` : `오늘 ${minutesText(b.goal)} 공부하면 ${hm(b.from)}에 열려요 (지금 ${minutesText(b.studied)})`}
          </small>
        </section>
      </div>
    );
  const items = blackToday(today);
  return (
    <div className="st-page narrow mt mt-dark">
      <section className="mt-black">
        <small>
          {hm(b.from)} ~ {hm(b.to)} · {Math.ceil((b.to - now) / 60_000)}분 남음
        </small>
        <b>암시장</b>
      </section>
      <div className="mt-goods">
        {items.map((x, i) => {
          const sold = m.buys.some((y) => y.itemId === x.id);
          return (
            <div key={x.id} className={`mt-good black ${sold ? 'short' : ''}`} style={{ ['--i' as string]: i }}>
              <button className="mt-good-buy" disabled={sold} onClick={() => buy({ ...x.item, id: x.id }, { id: x.id, price: x.price })}>
                <small>{sold ? '샀어요' : `−${Math.round(x.off * 100)}%`}</small>
                <b>{x.item.name}</b>
                <span className="mt-price">
                  <s>{won(x.item.price)}</s> {won(x.price)}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 신용 점수 반원 게이지 (바늘이 움직임) */
function Gauge({ score }: { score: number }) {
  const s = useCountUp(score);
  const k = Math.max(0, Math.min(1, s / 1000));
  return (
    <svg className="mt-gauge" viewBox="0 0 120 70" aria-hidden>
      <path d="M14 60a46 46 0 0 1 92 0" className="track" />
      <path d="M14 60a46 46 0 0 1 92 0" className="fill" pathLength={1} strokeDasharray={`${k} 1`} />
      <text x="60" y="56" textAnchor="middle" className="num">
        {s}
      </text>
    </svg>
  );
}

function Bank({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const [sheet, setSheet] = useState<'' | 'loan' | 'save'>('');
  const loans = m.loans.map((l) => ({ l, o: loanOwed(l, today) })).filter((x) => !x.o.closed);
  const open = m.savings.filter((s) => !s.closedAt);
  return (
    <div className="st-page narrow mt">
      <section className="mt-panel mt-credit">
        <Gauge score={v.credit.score} />
        <div>
          <b>{v.band.name}</b>
          <small>{v.band.mult ? `한도 ${won(v.limit)} · 이자 주 ${Math.round(v.band.rate * 100)}%` : '680점부터 대출'}</small>
        </div>
      </section>
      <div className="mt-accounts">
        <div className="mt-acct main">
          <small>입출금</small>
          <Coins v={v.balance} />
        </div>
        {open.map((s) => {
          const sv = savingValue(s, today);
          const total = s.weeks * 7;
          const gone = Math.min(total, diffDays(kst(s.at), today));
          return (
            <div key={s.id} className="mt-acct save">
              <small>
                적금 {s.weeks}주 · {Math.round(s.rate * 100)}%
              </small>
              <Coins v={s.amount} />
              <div className="mt-meter">
                <i style={{ width: `${(gone / total) * 100}%` }} />
              </div>
              <span>{sv.matured ? `만기 · ${won(Math.round(s.amount * (1 + s.rate)))}` : `D-${diffDays(today, sv.ends)}`}</span>
              <button onClick={() => (sv.matured || window.confirm('지금 깨면 이자가 없어요')) && save({ savings: m.savings.map((x) => (x.id === s.id ? { ...x, closedAt: Date.now() } : x)) })}>{sv.matured ? '찾기' : '깨기'}</button>
            </div>
          );
        })}
        {loans.map(({ l, o }) => (
          <div key={l.id} className={`mt-acct loan ${o.overdueDays ? 'late' : ''}`}>
            <small>대출 · 주 {Math.round(l.rate * 100)}%</small>
            <Coins v={-o.owed} />
            <span>{o.overdueDays ? `${o.overdueDays}일 연체` : `D-${diffDays(today, l.due)}`} · 이자 {won(o.interest)}</span>
            <button
              disabled={v.balance <= 0}
              onClick={() => {
                const pay = Math.min(v.balance, o.owed);
                save({ loans: m.loans.map((x) => (x.id === l.id ? { ...x, repays: [...x.repays, { at: Date.now(), amount: pay }] } : x)) });
                toast(`${won(pay)} 갚았어요`);
              }}
            >
              갚기
            </button>
          </div>
        ))}
      </div>
      <div className="mt-actions">
        <button className="btn" disabled={!v.band.mult || v.limit <= 0} onClick={() => setSheet('loan')}>
          빌리기
        </button>
        <button className="btn btn-primary" disabled={v.balance <= 0} onClick={() => setSheet('save')}>
          적금 들기
        </button>
      </div>
      {sheet === 'loan' && <LoanSheet m={m} limit={v.limit} rate={v.band.rate} onClose={() => setSheet('')} />}
      {sheet === 'save' && <SaveSheet m={m} balance={v.balance} onClose={() => setSheet('')} />}
    </div>
  );
}

const silver = (s: string) => Math.round(Number(s.replace(/[^\d.]/g, '')) * 100) || 0;

function LoanSheet({ m, limit, rate, onClose }: { m: MarketSettings; limit: number; rate: number; onClose: () => void }) {
  const today = useToday();
  const [amt, setAmt] = useState('');
  const [weeks, setWeeks] = useState(1);
  const a = silver(amt);
  return (
    <Sheet title="빌리기" onClose={onClose}>
      <div className="st-form">
        <div className="mt-amount">
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" autoFocus aria-label="금화" />
          <span>금화</span>
        </div>
        <small className={a > limit ? 'mt-minus' : 'st-muted'}>한도 {won(limit)}</small>
        <div className="st-seg">
          {[1, 2].map((w) => (
            <button key={w} className={weeks === w ? 'on' : ''} onClick={() => setWeeks(w)}>
              {w}주
            </button>
          ))}
        </div>
        {a > 0 && (
          <p className="st-sub">
            {shortDate(addDays(today, weeks * 7))}까지 {won(Math.round(a * (1 + rate * weeks)))}
          </p>
        )}
        <button
          className="btn btn-primary"
          disabled={!a || a > limit}
          onClick={() => {
            save({ loans: [...m.loans, { id: newId(), amount: a, at: Date.now(), due: addDays(today, weeks * 7), rate, repays: [] }] });
            toast('빌렸어요');
            onClose();
          }}
        >
          빌리기
        </button>
      </div>
    </Sheet>
  );
}

function SaveSheet({ m, balance, onClose }: { m: MarketSettings; balance: number; onClose: () => void }) {
  const [amt, setAmt] = useState('');
  const [plan, setPlan] = useState(SAVING_PLANS[1]);
  const a = silver(amt);
  return (
    <Sheet title="적금 들기" onClose={onClose}>
      <div className="st-form">
        <div className="mt-amount">
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" autoFocus aria-label="금화" />
          <span>금화</span>
        </div>
        <small className={a > balance ? 'mt-minus' : 'st-muted'}>가진 돈 {won(balance)}</small>
        <div className="mt-plans">
          {SAVING_PLANS.map((p) => (
            <button key={p.weeks} className={plan.weeks === p.weeks ? 'on' : ''} onClick={() => setPlan(p)}>
              <b>{p.weeks}주</b>
              <span>+{Math.round(p.rate * 100)}%</span>
            </button>
          ))}
        </div>
        {a > 0 && <p className="st-sub">만기에 {won(Math.round(a * (1 + plan.rate)))}</p>}
        <button
          className="btn btn-primary"
          disabled={!a || a > balance}
          onClick={() => {
            save({ savings: [...m.savings, { id: newId(), amount: a, at: Date.now(), weeks: plan.weeks, rate: plan.rate }] });
            toast('적금에 넣었어요');
            onClose();
          }}
        >
          넣기
        </button>
      </div>
    </Sheet>
  );
}

// ===== 주식 (토스증권 · 야후 파이낸스 느낌) =====

const pct = (a: number, b: number) => (b ? (a - b) / b : 0);
const signed = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;

function Stocks({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const [open, setOpen] = useState<string | null>(null);
  const tt = new Set(Object.values(d.settings.schoolTimetable ?? {}).flat());
  const off = m.stockOff ?? [];
  const all = alive(d.subjects).sort((a, b) => a.order - b.order);
  const subs = all.filter((s) => v.prices.has(s.id) && ((v.hold.get(s.id)?.qty ?? 0) > 0 || (!off.includes(s.id) && (!tt.size || tt.has(s.id)))));
  const hidden = all.filter((s) => !subs.includes(s));
  const cost = [...v.hold].reduce((a, [, h]) => a + h.cost, 0);
  const gain = v.stockValue - cost;
  if (open && v.prices.has(open)) return <StockDetail m={m} id={open} onBack={() => setOpen(null)} />;
  return (
    <div className="st-page narrow mt">
      <section className="mt-port">
        <small>내 투자</small>
        <Coins v={v.stockValue} big />
        {cost > 0 && (
          <span className={gain >= 0 ? 'up' : 'down'}>
            {gain >= 0 ? '+' : '−'}
            {won(Math.abs(gain))} ({signed(pct(v.stockValue, cost))})
          </span>
        )}
      </section>
      <section className="mt-panel">
        <h3>과목</h3>
        {subs.map((s, i) => {
          const p = v.prices.get(s.id)!;
          const ch = pct(p.price, p.prev);
          const h = v.hold.get(s.id);
          return (
            <button key={s.id} className="mt-tick" style={{ ['--i' as string]: i }} onClick={() => setOpen(s.id)}>
              <span className="mt-tick-name">
                <i style={{ background: s.color }} aria-hidden />
                <span>
                  <b>{companyName(s.name, s.id)}</b>
                  <small>{h?.qty ? `${h.qty}주` : tickerOf(s.id)}</small>
                </span>
              </span>
              <Spark ys={p.hist.slice(-14)} tone={ch < 0 ? 'down' : ch > 0 ? 'up' : 'flat'} />
              <span className="mt-tick-price">
                <b>{won(p.price)}</b>
                <em className={ch > 0 ? 'up' : ch < 0 ? 'down' : ''}>{ch ? signed(ch) : '0.00%'}</em>
              </span>
            </button>
          );
        })}
        {hidden.length > 0 && (
          <small className="st-muted">
            숨김: {hidden.map((x) => x.name).join(' · ')}{' '}
            {hidden.some((x) => off.includes(x.id)) && (
              <button className="st-link" onClick={() => save({ stockOff: [] })}>
                다시 보이기
              </button>
            )}
          </small>
        )}
      </section>
    </div>
  );
}

function StockDetail({ m, id, onBack }: { m: MarketSettings; id: string; onBack: () => void }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const s = d.subjects[id];
  const p = v.prices.get(id)!;
  const h = v.hold.get(id);
  const [range, setRange] = useState<7 | 30 | 90 | 0>(30);
  const [trade, setTrade] = useState<'buy' | 'sell' | null>(null);
  // hist[0] 은 시작 전날(100), hist[i] 는 since + (i−1)일
  const dates = p.hist.map((_, i) => addDays(m.since, i - 1));
  const from = range ? Math.max(0, p.hist.length - range - 1) : 0;
  const ys = p.hist.slice(from);
  const ds = dates.slice(from);
  const first = ys[0] ?? p.price;
  const ch = pct(p.price, first);
  const avg = h?.qty ? h.cost / h.qty : 0;
  const ex = (m.examOnly ?? []).includes(id);
  const toggle = (k: 'stockOff' | 'examOnly') => {
    const cur = m[k] ?? [];
    save({ [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  return (
    <div className="st-page narrow mt">
      <div className="st-page-head">
        <button className="st-back" onClick={onBack} aria-label="과목 목록">
          ‹
        </button>
        <h2>{companyName(s?.name ?? '', id)}</h2>
        <small className="st-muted">{tickerOf(id)} · {s?.name} 공부로 움직여요</small>
      </div>
      <section className="mt-quote">
        <Coins v={p.price} big />
        <span className={ch > 0 ? 'up' : ch < 0 ? 'down' : ''}>
          {ch >= 0 ? '+' : '−'}
          {won(Math.abs(p.price - Math.round(first)))} ({signed(ch)})
          <small> {range ? `${range}일` : '전체'}</small>
        </span>
      </section>
      <Chart ys={ys} ds={ds} tone={ch < 0 ? 'down' : 'up'} />
      <div className="mt-range" role="group" aria-label="기간">
        {([7, 30, 90, 0] as const).map((r) => (
          <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
            {r === 7 ? '1주' : r === 30 ? '1달' : r === 90 ? '3달' : '전체'}
          </button>
        ))}
      </div>
      <section className="mt-panel">
        <h3>소식</h3>
        {p.events.length ? (
          <ul className="mt-events">
            {[...p.events].reverse().slice(0, 8).map((e) => (
              <li key={e.date} className={e.pct > 0 ? 'up' : 'down'}>
                <span>
                  <small>{shortDate(e.date)}</small>
                  {e.title}
                  <i>{e.why}</i>
                </span>
                <em>{signed(e.pct)}</em>
              </li>
            ))}
          </ul>
        ) : (
          <p className="st-muted">아직 소식이 없어요. {s?.name} 공부를 하면 호재가 뜰 확률이 올라가요.</p>
        )}
      </section>
      {h && h.qty > 0 && (
        <section className="mt-panel mt-hold">
          <h3>내 주식</h3>
          <div>
            <span>
              <small>평가금</small>
              <b>{won(h.qty * p.price)}</b>
            </span>
            <span>
              <small>수익</small>
              <b className={p.price >= avg ? 'up' : 'down'}>{signed(pct(p.price, avg))}</b>
            </span>
            <span>
              <small>보유</small>
              <b>{h.qty}주</b>
            </span>
            <span>
              <small>평균 단가</small>
              <b>{won(Math.round(avg))}</b>
            </span>
          </div>
        </section>
      )}
      <div className="mt-links">
        <button className="st-link" onClick={() => toggle('examOnly')}>
          {ex ? '늘 똑같이 흔들리게' : '시험 3주 전까지는 잔잔하게'}
        </button>
        {!h?.qty && (
          <button
            className="st-link"
            onClick={() => {
              toggle('stockOff');
              onBack();
            }}
          >
            목록에서 빼기
          </button>
        )}
      </div>
      <div className="mt-trade">
        <button className="sell" disabled={!h?.qty} onClick={() => setTrade('sell')}>
          팔기
        </button>
        <button className="buy" onClick={() => setTrade('buy')}>
          사기
        </button>
      </div>
      {trade && <TradeSheet m={m} id={id} side={trade} onClose={() => setTrade(null)} />}
    </div>
  );
}

function TradeSheet({ m, id, side, onClose }: { m: MarketSettings; id: string; side: 'buy' | 'sell'; onClose: () => void }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const p = v.prices.get(id)?.price ?? 0;
  const have = v.hold.get(id)?.qty ?? 0;
  const max = side === 'buy' ? Math.floor(v.balance / (p * (1 + RULE.stockFee)) || 0) : have;
  const [n, setN] = useState(Math.min(1, max));
  const fee = Math.round(n * p * RULE.stockFee);
  const total = side === 'buy' ? n * p + fee : n * p - fee;
  return (
    <Sheet title={`${companyName(d.subjects[id]?.name ?? '', id)} ${side === 'buy' ? '사기' : '팔기'}`} onClose={onClose}>
      <div className="st-form">
        <div className="mt-step">
          <button onClick={() => setN(Math.max(0, n - 1))} aria-label="하나 빼기">
            −
          </button>
          <b>{n}주</b>
          <button onClick={() => setN(Math.min(max, n + 1))} aria-label="하나 더">
            ＋
          </button>
        </div>
        <div className="mt-chips">
          {[0.25, 0.5, 1].map((k) => (
            <button key={k} className="st-chip" disabled={!max} onClick={() => setN(Math.max(1, Math.floor(max * k)))}>
              {k === 1 ? '최대' : `${k * 100}%`}
            </button>
          ))}
        </div>
        <p className="st-sub">
          1주 {won(p)} · 수수료 {won(fee)} · {side === 'buy' ? '내는 돈' : '받는 돈'} <b>{won(total)}</b>
        </p>
        <button
          className={`btn mt-go ${side}`}
          disabled={!n || n > max}
          onClick={() => {
            save({ trades: [...m.trades, { id: newId(), subjectId: id, qty: side === 'buy' ? n : -n, price: p, at: Date.now() }] });
            toast(`${n}주 ${side === 'buy' ? '샀어요' : '팔았어요'}`);
            onClose();
          }}
        >
          {side === 'buy' ? '사기' : '팔기'}
        </button>
      </div>
    </Sheet>
  );
}

/** 작은 꺾은선 (목록) */
function Spark({ ys, tone }: { ys: number[]; tone: 'up' | 'down' | 'flat' }) {
  if (ys.length < 2) return <span className="mt-spark" />;
  const lo = Math.min(...ys),
    hi = Math.max(...ys);
  const pts = ys.map((y, i) => `${(i / (ys.length - 1)) * 100},${hi === lo ? 14 : 28 - ((y - lo) / (hi - lo)) * 24 - 2}`).join(' ');
  return (
    <svg className={`mt-spark ${tone}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} />
    </svg>
  );
}

/** 큰 차트: 넓이 그래프 + 누르거나 손을 대면 그날 값 */
function Chart({ ys, ds, tone }: { ys: number[]; ds: string[]; tone: 'up' | 'down' }) {
  const [at, setAt] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (ys.length < 2) return <div className="mt-chart empty">기록이 쌓이면 그래프가 그려져요</div>;
  const W = 300,
    H = 140;
  const lo = Math.min(...ys),
    hi = Math.max(...ys);
  const x = (i: number) => (i / (ys.length - 1)) * W;
  // 값이 다 같으면 가운데에 평평하게
  const y = (v: number) => (hi === lo ? H / 2 : H - 8 - ((v - lo) / (hi - lo)) * (H - 24));
  const line = ys.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${W},${H}L0,${H}Z`;
  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setAt(Math.max(0, Math.min(ys.length - 1, Math.round(((e.clientX - r.left) / r.width) * (ys.length - 1)))));
  };
  return (
    <div className="mt-chart">
      {at !== null && (
        <div className="mt-chart-tip" style={{ left: `${(at / (ys.length - 1)) * 100}%` }}>
          <b>{won(Math.round(ys[at]))}</b>
          <small>{shortDate(ds[at])}</small>
        </div>
      )}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={tone} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setAt(null)} key={ys.length}>
        <defs>
          <linearGradient id={`mt-g-${tone}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="g0" />
            <stop offset="1" className="g1" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#mt-g-${tone})`} className="area" />
        <path d={line} className="line" pathLength={1} />
        {at !== null && <line x1={x(at)} x2={x(at)} y1="0" y2={H} className="cross" />}
        {at !== null && <circle cx={x(at)} cy={y(ys[at])} r="3.5" className="dot" />}
      </svg>
    </div>
  );
}

function ItemSheet({ m, item, onClose }: { m: MarketSettings; item?: MarketItem; onClose: () => void }) {
  const [kind, setKind] = useState<MarketItem['kind']>(item?.kind ?? 'thing');
  const [name, setName] = useState(item?.name ?? '');
  const [minutes, setMinutes] = useState(String(item?.minutes ?? 30));
  const [price, setPrice] = useState(String(item?.price ?? 100));
  const [wonV, setWon] = useState(String(item?.won ?? ''));
  const [pieces, setPieces] = useState(String(item?.pieces ?? ''));
  const [tier, setTier] = useState(item?.tier ?? 0);
  const [effect, setEffect] = useState<NonNullable<MarketItem['effect']>>(item?.effect ?? 'permit');
  const noMin = kind === 'pass' || kind === 'perk';
  const ok = name.trim() && (kind === 'thing' ? Number(wonV) > 0 : Number(price) > 0 && (noMin || Number(minutes) > 0));
  return (
    <Sheet title={item ? '고치기' : '상점에 넣기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-seg">
          {(Object.keys(KIND_NAME) as MarketItem['kind'][]).map((k) => (
            <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {KIND_NAME[k]}
            </button>
          ))}
        </div>
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'thing' ? '예: 무선 이어폰' : kind === 'game' ? '예: 게임 30분' : '예: 유튜브 30분'} />
        </Field>
        {kind === 'thing' ? (
          <Field label="실제 가격 (원)" hint={`1금화 = ${m.wonPerGold.toLocaleString('ko-KR')}원으로 바꿔요 (규칙에서 바꿀 수 있어요). 지금 ${won(Math.round(((Number(wonV) || 0) / m.wonPerGold) * 100))}`}>
            <input className="st-input sm" inputMode="numeric" value={wonV} onChange={(e) => setWon(e.target.value.replace(/\D/g, ''))} />
          </Field>
        ) : null}
        {kind === 'thing' && (
          <div className="st-inline wrap">
            <label className="st-cond-time">
              조각 (선택)
              <input className="st-input xs" inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value.replace(/\D/g, ''))} placeholder="한 번에" />
            </label>
            <label className="st-cond-time">
              티어
              <select className="st-input sm" value={tier} onChange={(e) => setTier(Number(e.target.value))}>
                {TIERS.map((t, i) => (
                  <option key={t} value={i}>
                    {i ? `${t}부터` : '누구나'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {kind === 'perk' && (
          <div className="st-seg">
            {(
              [
                ['permit', '허가권'],
                ['fever', '피버타임'],
                ['shield', '연속 실드'],
                ['half', '계획 반토막'],
              ] as const
            ).map(([k, n]) => (
              <button key={k} type="button" className={effect === k ? 'on' : ''} onClick={() => setEffect(k)}>
                {n}
              </button>
            ))}
          </div>
        )}
        {kind === 'thing' ? null : (
          <div className="st-inline wrap">
            {!noMin && (
              <label className="st-cond-time">
                시간 (분)
                <input className="st-input xs" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
              </label>
            )}
            <label className="st-cond-time">
              기본 값 (은화)
              <input className="st-input xs" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
        )}
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.name}」`) && (save({ items: m.items.filter((x) => x.id !== item.id) }), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              const pc = Number(pieces);
              const it: MarketItem = { id: item?.id ?? newId(), name: name.trim().slice(0, 30), kind, minutes: kind === 'thing' || noMin ? undefined : Math.min(600, Number(minutes)), price: kind === 'thing' ? 0 : Math.min(1_000_000, Number(price)), won: kind === 'thing' ? Number(wonV) : undefined, pieces: kind === 'thing' && pc >= 2 ? Math.min(100, pc) : undefined, tier: kind === 'thing' && tier ? tier : undefined, wishId: item?.wishId, effect: kind === 'perk' ? effect : undefined };
              save({ items: item ? m.items.map((x) => (x.id === item.id ? it : x)) : [...m.items, it] });
              onClose();
            }}
          >
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function Rules({ m }: { m: MarketSettings }) {
  const [target, setTarget] = useState(String(m.weeklyTarget / 60));
  const [wd, setWd] = useState(String(m.minDay.weekday));
  const [we, setWe] = useState(String(m.minDay.weekend));
  const [wpg, setWpg] = useState(String(m.wonPerGold));
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>규칙</h2>
      </div>
      <section className="st-card st-form">
        <label className="st-inline between">
          <span>일주일 공부 목표 (주급 기준)</span>
          <span className="st-inline">
            <input className="st-input xs" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} />
            시간
          </span>
        </label>
        <label className="st-inline between">
          <span>하루 최소 공부 · 평일</span>
          <span className="st-inline">
            <input className="st-input xs" inputMode="numeric" value={wd} onChange={(e) => setWd(e.target.value.replace(/\D/g, ''))} />분
          </span>
        </label>
        <label className="st-inline between">
          <span>하루 최소 공부 · 주말</span>
          <span className="st-inline">
            <input className="st-input xs" inputMode="numeric" value={we} onChange={(e) => setWe(e.target.value.replace(/\D/g, ''))} />분
          </span>
        </label>
        <label className="st-inline between">
          <span>실제 물건: 1금화 =</span>
          <span className="st-inline">
            <input className="st-input sm" inputMode="numeric" value={wpg} onChange={(e) => setWpg(e.target.value.replace(/\D/g, ''))} />원
          </span>
        </label>
        <div className="st-row end">
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              save({ weeklyTarget: Math.round(Math.min(100, Math.max(1, Number(target) || 30)) * 60), minDay: { weekday: Math.min(900, Number(wd) || 0), weekend: Math.min(900, Number(we) || 0) }, wonPerGold: Math.max(100, Number(wpg) || 5000) });
              toast('규칙을 바꿨어요');
            }}
          >
            저장
          </button>
        </div>
      </section>
      <section className="st-card">
        <h3 className="st-h">버는 것</h3>
        <ul className="gm-check">
          <li>공부 1분 = {RULE.perMin}은화 (100은화 = 1금화)</li>
          <li>
            오답 해결 {RULE.note} · 시험 범위 한 줄 체크 {RULE.scope} · 습관 {RULE.habit} · 할 일 {RULE.todo}은화
          </li>
          <li>주급(월요일): 지난주 목표 100% {won(RULE.pay[0][1])} · 80% {won(RULE.pay[1][1])} · 50% {won(RULE.pay[2][1])}</li>
          <li>적금 이자 · 과목 주식</li>
        </ul>
        <h3 className="st-h">나가는 것</h3>
        <ul className="gm-check">
          <li>오락 이용권 + 사치세 (기본 {Math.round(RULE.luxBase * 100)}%, 이번 주 오락 1시간마다 +{Math.round(RULE.luxPerHour * 100)}%, {Math.round(RULE.luxMax * 100)}%까지), 시험 2주 전부터 값 오름 · 시험 기간 2배</li>
          <li>이용권 없이 게임(Steam · 롤 기록): 이용권 값의 {RULE.rawGame}배</li>
          <li>벌금: 하루 최소 공부 미달 {won(RULE.fineMin)} · 할 일 · 수행평가 마감 넘김 {won(RULE.fineLate)}</li>
          <li>대출이 밀리면: 상점 정지 · 하루 최소 공부 +{RULE.penaltyMin}분(벌칙 공부) · 신용 하락 · 들어오는 돈으로 먼저 갚기</li>
        </ul>
        <small className="st-muted">{shortDate(m.since)}부터 센 기록이에요. 규칙을 바꾸면 지난 기록도 새 규칙으로 다시 세요.</small>
      </section>
      <button className="st-link" onClick={() => window.confirm('시장을 처음부터 다시 시작할까요? 돈 · 산 것 · 적금 · 대출 · 주식이 모두 지워져요.') && setSettings({ market: newMarket(getStudy().settings.market ? (new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)) : m.since) })}>
        시장 처음부터 다시 시작
      </button>
    </div>
  );
}
