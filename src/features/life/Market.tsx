// 시장: 홈(지갑 · 알림) · 상점(오락 이용권 · 물건) · 은행(적금 · 대출 · 신용) · 주식(과목 주식) · 규칙
import { useEffect, useState } from 'react';
import { isLoggedIn, lolGames, lolProfile, steamMe } from '../auth/api';
import { addDays, shortDate } from '../study/dates';
import { alive, newId, type MarketItem, type MarketSettings, type MoneyTx } from '../study/model';
import { getStudy, put, setSettings, useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { Bar, confirmDelete, Empty, Field, Sheet, toast, useToday } from '../study/ui';
import { lolDaily } from './GameTime';
import { kst, loanOwed, marketNews, marketView, newMarket, priceOf, RULE, SAME_DAY_FINE, SAVING_PLANS, savingValue, VOUCHER_DAYS, voucherEnds, won } from './market';
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
  if (sub === 'bank') return <Bank m={m} />;
  if (sub === 'stocks') return <Stocks m={m} />;
  if (sub === 'rules') return <Rules m={m} />;
  return <MarketHome m={m} />;
}

function Wallet({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  return (
    <section className="st-card mk-wallet">
      <small>가진 돈</small>
      <b className={v.balance < 0 ? 'mk-minus' : ''}>{won(v.balance)}</b>
      <span className="st-muted">
        순자산 {won(v.net)} · 신용 {v.credit.score}점 ({v.band.name})
      </span>
    </section>
  );
}

function MarketHome({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const weekMin = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((x) => x >= addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7))).reduce((a, x) => a + (v.inc.get(x)?.minutes ?? 0), 0);
  const ratio = m.weeklyTarget ? weekMin / m.weeklyTarget : 0;
  const nextPay = RULE.pay.find(([r]) => ratio >= r)?.[1] ?? 0;
  const ledger = [
    ...[...v.inc.values()].map((x) => ({ k: `i${x.date}`, date: x.date, text: `공부 ${minutesText(x.minutes)}${x.note + x.scope + x.habit + x.todo ? ` · 보너스 ${won(x.note + x.scope + x.habit + x.todo)}` : ''}`, amt: x.total })),
    ...v.pays.filter((p) => p.pay).map((p) => ({ k: `p${p.week}`, date: addDays(p.week, 7), text: `주급 (${shortDate(p.week)} 주 ${Math.round(p.ratio * 100)}%)`, amt: p.pay })),
    ...v.fines.map((f, i) => ({ k: `f${i}`, date: f.date, text: `벌금 · ${f.why}`, amt: -f.amount })),
    ...m.buys.map((b) => ({ k: b.id, date: kst(b.at), text: `${b.name}${b.tax ? ` (사치세 ${won(b.tax)})` : ''}`, amt: -(b.price + b.tax) })),
    ...m.loans.flatMap((l) => [{ k: `l${l.id}`, date: kst(l.at), text: '대출 받음', amt: l.amount }, ...l.repays.map((r, i) => ({ k: `r${l.id}${i}`, date: kst(r.at), text: '대출 갚음', amt: -r.amount }))]),
    ...m.savings.flatMap((s) => [{ k: `s${s.id}`, date: kst(s.at), text: `적금 넣음 (${s.weeks}주)`, amt: -s.amount }, ...(s.closedAt ? [{ k: `c${s.id}`, date: kst(s.closedAt), text: '적금 찾음', amt: s.closedAt >= Date.parse(`${savingValue(s, today).ends}T00:00:00+09:00`) ? Math.round(s.amount * (1 + s.rate)) : s.amount }] : [])]),
    ...m.trades.map((t) => ({ k: t.id, date: kst(t.at), text: `${d.subjects[t.subjectId]?.name ?? '과목'} 주식 ${Math.abs(t.qty)}주 ${t.qty > 0 ? '삼' : '팜'}`, amt: -t.qty * t.price - Math.round(Math.abs(t.qty * t.price) * RULE.stockFee) })),
    ...(v.game.charge ? [{ k: 'game', date: today, text: `이용권 없이 게임 ${minutesText(v.game.raw)} (${RULE.rawGame}배)`, amt: -v.game.charge }] : []),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.amt - b.amt);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>시장</h2>
      </div>
      <Wallet m={m} />
      <NewsBoard m={m} />
      {v.overdue && (
        <section className="st-card mk-alert">
          <b>대출이 밀렸어요</b>
          <p className="st-sub">갚을 때까지 상점을 쓸 수 없고, 하루 최소 공부에 벌칙 공부 {RULE.penaltyMin}분이 더해져요. 들어오는 돈은 먼저 빚을 갚아요. 남은 빚 {won(v.owed)}</p>
        </section>
      )}
      {v.game.raw > 0 && (
        <section className="st-card mk-alert">
          <b>이용권 없이 게임 {minutesText(v.game.raw)}</b>
          <p className="st-sub">이용권 값의 {RULE.rawGame}배인 {won(v.game.charge)}이(가) 빠졌어요. 다음엔 상점에서 미리 사요.</p>
        </section>
      )}
      <section className="st-card">
        <h3 className="st-h">오늘</h3>
        <Bar value={v.todayInc?.minutes ?? 0} max={v.need} label="하루 최소 공부" />
        <p className="st-hint">
          공부 {minutesText(v.todayInc?.minutes ?? 0)} / 최소 {minutesText(v.need)}
          {v.overdue ? ' (벌칙 공부 포함)' : ''} · 오늘 번 돈 {won(v.todayInc?.total ?? 0)} · 못 채우면 벌금 {won(RULE.fineMin)}
        </p>
        <h3 className="st-h">이번 주</h3>
        <Bar value={weekMin} max={m.weeklyTarget} label="주 목표" />
        <p className="st-hint">
          {minutesText(weekMin)} / {minutesText(m.weeklyTarget)} · 이대로면 다음 월요일 주급 {won(nextPay)}
          {v.game.bought > 0 && ` · 게임 이용권 남은 시간 ${minutesText(v.game.left)}`}
        </p>
      </section>
      <section className="st-card">
        <h3 className="st-h">돈 흐름</h3>
        {!ledger.length && <p className="st-hint">{shortDate(m.since)}부터 세요. 공부를 기록하면 은화가 들어와요.</p>}
        {ledger.slice(0, 40).map((r) => (
          <div key={r.k} className="st-item">
            <div className="st-item-main">
              <div className="st-item-title">{r.text}</div>
              <div className="st-item-sub">{shortDate(r.date)}</div>
            </div>
            <b className={r.amt < 0 ? 'mk-minus' : 'mk-plus'}>
              {r.amt > 0 ? '+' : ''}
              {won(r.amt)}
            </b>
          </div>
        ))}
      </section>
    </div>
  );
}

/** 오늘의 시장 뉴스 (실검처럼 1~10위) */
function NewsBoard({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const news = marketNews(d, m, today);
  if (!news.length) return null;
  return (
    <section className="st-card mk-news">
      <h3 className="st-h">오늘의 시장 뉴스</h3>
      <ol>
        {news.map((n) => (
          <li key={n.rank} className={`mk-n ${n.tone}`}>
            <b>{n.rank}</b>
            <span>{n.title}</span>
            <i aria-hidden>{n.tone === 'up' ? '▲' : n.tone === 'down' ? '▼' : n.tone === 'warn' ? '!' : '•'}</i>
          </li>
        ))}
      </ol>
    </section>
  );
}

const KIND_NAME: Record<MarketItem['kind'], string> = { game: '게임 이용권', fun: '오락 이용권', meet: '약속', thing: '물건' };

/** 넣을 수 있는 이용권 (눌러서 상점에 넣기) */
const VOUCHER_IDEAS: Omit<MarketItem, 'id'>[] = [
  { name: '게임 30분', kind: 'game', minutes: 30, price: 150 },
  { name: '게임 1시간', kind: 'game', minutes: 60, price: 280 },
  { name: '유튜브 30분', kind: 'fun', minutes: 30, price: 100 },
  { name: '넷플릭스 · 드라마 한 편', kind: 'fun', minutes: 60, price: 180 },
  { name: '웹툰 30분', kind: 'fun', minutes: 30, price: 80 },
  { name: 'SNS 30분', kind: 'fun', minutes: 30, price: 100 },
  { name: '늦잠 1시간', kind: 'fun', minutes: 60, price: 150 },
  { name: '배달 음식', kind: 'fun', minutes: 30, price: 250 },
  { name: '친구랑 놀기 반나절', kind: 'meet', minutes: 240, price: 500 },
  { name: '친구랑 노래방', kind: 'meet', minutes: 90, price: 250 },
  { name: '영화 보러 가기', kind: 'meet', minutes: 180, price: 400 },
  { name: '가족 외식', kind: 'meet', minutes: 120, price: 150 },
];

function Shop({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const [edit, setEdit] = useState<MarketItem | 'new' | null>(null);
  const buy = (it: MarketItem) => {
    if (v.overdue) return toast('대출이 밀려서 상점을 쓸 수 없어요');
    const p = priceOf(it, m, d, today);
    const cost = p.price + p.tax;
    if (v.balance < cost) return toast(`${won(cost - v.balance)} 모자라요 (은행에서 빌릴 수도 있어요)`);
    const vch = it.kind !== 'thing';
    if (!window.confirm(`「${it.name}」 ${won(p.price)}${p.tax ? ` + 사치세 ${won(p.tax)}` : ''} = ${won(cost)} 에 살까요?${vch ? `\n${shortDate(voucherEnds(Date.now()))}까지 쓸 수 있고, 오늘 바로 쓰면 이용권 값의 절반이 벌금이에요.` : ''}`)) return;
    save({ buys: [...m.buys, { id: newId(), itemId: it.id, name: it.name, kind: it.kind, minutes: it.minutes, price: p.price, tax: p.tax, at: Date.now(), expires: vch ? voucherEnds(Date.now()) : undefined }] });
    toast(`${it.name} 샀어요`);
  };
  const realBuy = (b: MarketSettings['buys'][number]) => {
    const it = m.items.find((x) => x.id === b.itemId);
    save({ buys: m.buys.map((x) => (x.id === b.id ? { ...x, used: true } : x)) });
    // 실제로 산 것은 돈 영역 지출로
    if (it?.won) {
      put('moneyTx', { id: newId(), date: today, type: 'out', amount: it.won, category: '쇼핑', memo: `${b.name} (시장)`, created: Date.now() } as MoneyTx);
      toast(`돈 › 쓴 돈에 ${it.won.toLocaleString('ko-KR')}원을 적었어요`);
    }
  };
  const fun = m.items.filter((x) => x.kind === 'game' || x.kind === 'fun');
  const meets = m.items.filter((x) => x.kind === 'meet');
  const things = m.items.filter((x) => x.kind === 'thing');
  const live = m.buys.filter((b) => (b.kind === 'fun' || b.kind === 'meet') && !b.usedAt && (b.expires ?? voucherEnds(b.at)) >= today);
  const waiting = m.buys.filter((b) => b.kind === 'thing' && !b.used);
  const card = (it: MarketItem) => {
    const p = priceOf(it, m, d, today);
    return (
      <div key={it.id} className={`mk-shop-item ${v.balance < p.price + p.tax || v.overdue ? 'short' : ''}`}>
        <button className="mk-shop-buy" onClick={() => buy(it)}>
          <small className="st-muted">{it.kind === 'thing' ? `${(it.won ?? 0).toLocaleString('ko-KR')}원` : `${it.kind === 'game' ? '게임 · ' : it.kind === 'meet' ? '약속 · ' : ''}${minutesText(it.minutes ?? 0)}`}</small>
          <b>{it.name}</b>
          <span>{won(p.price + p.tax)}</span>
          {p.why && <small className="mk-minus">{p.why} 값 오름</small>}
        </button>
        <button className="st-link" onClick={() => setEdit(it)}>
          고치기
        </button>
      </div>
    );
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>상점</h2>
        <button className="btn btn-sm" onClick={() => setEdit('new')}>
          ＋ 넣기
        </button>
      </div>
      <Wallet m={m} />
      <p className="st-hint">
        이용권은 산 날부터 {VOUCHER_DAYS}일 동안 쓸 수 있어요. 산 날 바로 쓰면 이용권 값의 절반이 벌금이니 미리 사 두세요. 오락은 사치세 {Math.round(RULE.luxBase * 100)}%(이번 주 오락 1시간마다 +{Math.round(RULE.luxPerHour * 100)}%), 시험 2주 전부터 값이 올라 시험 기간엔 2배. 이용권 없이 게임하면 {RULE.rawGame}배.
      </p>
      {(live.length > 0 || v.game.left > 0) && (
        <section className="st-card">
          <h3 className="st-h">가진 이용권</h3>
          {v.game.left > 0 && <p className="st-sub">게임 {minutesText(v.game.left)} (Steam · 롤 기록으로 저절로 써요)</p>}
          {live.map((b) => (
            <div key={b.id} className="st-item">
              <div className="st-item-main">
                <div className="st-item-title">{b.name}</div>
                <div className="st-item-sub">
                  {shortDate(b.expires ?? voucherEnds(b.at))}까지{kst(b.at) === today ? ' · 오늘 산 것 (오늘 쓰면 벌금)' : ''}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => (kst(b.at) !== today || window.confirm(`오늘 산 이용권이라 쓰면 ${won(Math.round(b.price * SAME_DAY_FINE))} 벌금이에요. 쓸까요?`)) && save({ buys: m.buys.map((x) => (x.id === b.id ? { ...x, usedAt: Date.now() } : x)) })}>
                쓰기
              </button>
            </div>
          ))}
        </section>
      )}
      <h3 className="st-h">오락 이용권</h3>
      <div className="mk-shop">{fun.map(card)}</div>
      {VOUCHER_IDEAS.some((x) => x.kind !== 'meet' && !m.items.some((y) => y.name === x.name)) && (
        <div className="st-chips">
          {VOUCHER_IDEAS.filter((x) => x.kind !== 'meet' && !m.items.some((y) => y.name === x.name)).map((x) => (
            <button key={x.name} className="st-chip" onClick={() => save({ items: [...m.items, { ...x, id: newId() }] })}>
              ＋ {x.name} · {won(x.price)}
            </button>
          ))}
        </div>
      )}
      <h3 className="st-h">약속</h3>
      <p className="st-hint">친구 · 가족과의 약속은 사치세가 없어요 (시험 기간엔 값이 올라요).</p>
      {meets.length > 0 && <div className="mk-shop">{meets.map(card)}</div>}
      {VOUCHER_IDEAS.some((x) => x.kind === 'meet' && !m.items.some((y) => y.name === x.name)) && (
        <div className="st-chips">
          {VOUCHER_IDEAS.filter((x) => x.kind === 'meet' && !m.items.some((y) => y.name === x.name)).map((x) => (
            <button key={x.name} className="st-chip" onClick={() => save({ items: [...m.items, { ...x, id: newId() }] })}>
              ＋ {x.name} · {won(x.price)}
            </button>
          ))}
        </div>
      )}
      <h3 className="st-h">물건</h3>
      {things.length ? <div className="mk-shop">{things.map(card)}</div> : <p className="st-hint">사고 싶은 물건을 실제 가격(원)으로 넣으면 금화로 바꿔 보여 줘요 (1금화 = {m.wonPerGold.toLocaleString('ko-KR')}원).</p>}
      {waiting.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">산 물건 (아직 실제로 안 삼)</h3>
          {waiting.map((b) => (
            <div key={b.id} className="st-item">
              <div className="st-item-main">
                <div className="st-item-title">{b.name}</div>
                <div className="st-item-sub">
                  {shortDate(kst(b.at))} · {won(b.price)}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => realBuy(b)}>
                실제로 샀어요
              </button>
            </div>
          ))}
        </section>
      )}
      {edit && <ItemSheet m={m} item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ItemSheet({ m, item, onClose }: { m: MarketSettings; item?: MarketItem; onClose: () => void }) {
  const [kind, setKind] = useState<MarketItem['kind']>(item?.kind ?? 'thing');
  const [name, setName] = useState(item?.name ?? '');
  const [minutes, setMinutes] = useState(String(item?.minutes ?? 30));
  const [price, setPrice] = useState(String(item?.price ?? 100));
  const [wonV, setWon] = useState(String(item?.won ?? ''));
  const ok = name.trim() && (kind === 'thing' ? Number(wonV) > 0 : Number(price) > 0 && Number(minutes) > 0);
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
        ) : (
          <div className="st-inline wrap">
            <label className="st-cond-time">
              시간 (분)
              <input className="st-input xs" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
            </label>
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
              const it: MarketItem = { id: item?.id ?? newId(), name: name.trim().slice(0, 30), kind, minutes: kind === 'thing' ? undefined : Math.min(600, Number(minutes)), price: kind === 'thing' ? 0 : Math.min(1_000_000, Number(price)), won: kind === 'thing' ? Number(wonV) : undefined };
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

function Bank({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const [amt, setAmt] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [dep, setDep] = useState('');
  const [plan, setPlan] = useState(SAVING_PLANS[1]);
  const silver = (s: string) => Math.round(Number(s.replace(/[^\d.]/g, '')) * 100) || 0;
  const loans = m.loans.map((l) => ({ l, o: loanOwed(l, today) })).filter((x) => !x.o.closed);
  const open = m.savings.filter((s) => !s.closedAt);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>은행</h2>
      </div>
      <Wallet m={m} />
      <section className="st-card">
        <h3 className="st-h">신용</h3>
        <p className="st-sub">
          {v.credit.score}점 · {v.band.name}
          {v.band.mult ? ` · 대출 한도 ${won(v.limit)} (최근 주간 수입 ${won(v.weekly)} × ${v.band.mult}) · 이자 주 ${Math.round(v.band.rate * 100)}%` : ' · 680점이 넘어야 빌릴 수 있어요'}
        </p>
        <small className="st-muted">처음 700점. 기한 안에 갚으면 +15, 밀리면 −60(하루마다 −5 더), 주 목표를 채우면 +10, 벌금마다 −3. 구간은 이 앱의 규칙이고, 680점은 2021년 신용점수제 전환 때 신용카드 발급 기준으로 쓰인 NICE 점수예요.</small>
        {v.credit.log.length > 0 && <small className="st-muted">{v.credit.log.slice(-4).map((x) => `${x.why} ${x.delta > 0 ? '+' : ''}${x.delta}`).join(' · ')}</small>}
      </section>
      <section className="st-card st-form">
        <h3 className="st-h">대출</h3>
        {loans.map(({ l, o }) => (
          <div key={l.id} className="st-item">
            <div className="st-item-main">
              <div className="st-item-title">
                {won(l.amount)} 빌림 · 이자 {won(o.interest)} · 남은 빚 {won(o.owed)}
              </div>
              <div className={`st-item-sub ${o.overdueDays ? 'mk-minus' : ''}`}>{o.overdueDays ? `${o.overdueDays}일 밀림` : `${shortDate(l.due)}까지 · 이자 주 ${Math.round(l.rate * 100)}% (날마다 붙음)`}</div>
            </div>
            <button
              className="btn btn-sm"
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
        {v.band.mult > 0 && (
          <>
            <div className="st-inline wrap">
              <input className="st-input sm" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="금화" aria-label="빌릴 금화" />
              금화를
              <div className="st-seg sm">
                {[1, 2].map((w) => (
                  <button key={w} className={weeks === w ? 'on' : ''} onClick={() => setWeeks(w)}>
                    {w}주
                  </button>
                ))}
              </div>
              <button
                className="btn btn-sm btn-primary"
                disabled={!silver(amt) || silver(amt) > v.limit}
                onClick={() => {
                  const a = silver(amt);
                  if (!window.confirm(`${won(a)}을(를) ${weeks}주 빌릴까요? ${shortDate(addDays(today, weeks * 7))}까지 ${won(Math.round(a * (1 + v.band.rate * weeks)))}을(를) 갚아야 해요. 밀리면 상점 정지 · 벌칙 공부 · 신용 하락이에요.`)) return;
                  save({ loans: [...m.loans, { id: newId(), amount: a, at: Date.now(), due: addDays(today, weeks * 7), rate: v.band.rate, repays: [] }] });
                  setAmt('');
                  toast('빌렸어요');
                }}
              >
                빌리기
              </button>
            </div>
            {silver(amt) > v.limit && <small className="mk-minus">한도 {won(v.limit)}를 넘어요</small>}
          </>
        )}
      </section>
      <section className="st-card st-form">
        <h3 className="st-h">적금</h3>
        {open.map((s) => {
          const sv = savingValue(s, today);
          return (
            <div key={s.id} className="st-item">
              <div className="st-item-main">
                <div className="st-item-title">
                  {won(s.amount)} · {s.weeks}주 {Math.round(s.rate * 100)}%
                </div>
                <div className="st-item-sub">{sv.matured ? `만기 · 찾으면 ${won(Math.round(s.amount * (1 + s.rate)))}` : `${shortDate(sv.ends)} 만기 (지금 깨면 이자 없음)`}</div>
              </div>
              <button className="btn btn-sm" onClick={() => (sv.matured || window.confirm('만기 전에 깨면 이자를 못 받아요. 깰까요?')) && save({ savings: m.savings.map((x) => (x.id === s.id ? { ...x, closedAt: Date.now() } : x)) })}>
                {sv.matured ? '찾기' : '깨기'}
              </button>
            </div>
          );
        })}
        <div className="st-inline wrap">
          <input className="st-input sm" inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} placeholder="금화" aria-label="넣을 금화" />
          금화를
          <div className="st-seg sm">
            {SAVING_PLANS.map((p) => (
              <button key={p.weeks} className={plan.weeks === p.weeks ? 'on' : ''} onClick={() => setPlan(p)}>
                {p.weeks}주 {Math.round(p.rate * 100)}%
              </button>
            ))}
          </div>
          <button
            className="btn btn-sm btn-primary"
            disabled={!silver(dep) || silver(dep) > v.balance}
            onClick={() => {
              save({ savings: [...m.savings, { id: newId(), amount: silver(dep), at: Date.now(), weeks: plan.weeks, rate: plan.rate }] });
              setDep('');
              toast('적금에 넣었어요');
            }}
          >
            넣기
          </button>
        </div>
      </section>
    </div>
  );
}

function Stocks({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const v = marketView(d, m, today);
  const [qty, setQty] = useState<Record<string, string>>({});
  // 학교 시간표가 있으면 시간표 과목만 (가진 주식은 늘 보여 준다)
  const tt = new Set(Object.values(d.settings.schoolTimetable ?? {}).flat());
  const off = m.stockOff ?? [];
  const exOnly = m.examOnly ?? [];
  const all = alive(d.subjects).sort((a, b) => a.order - b.order);
  const subs = all.filter((s) => (v.hold.get(s.id)?.qty ?? 0) > 0 || (!off.includes(s.id) && (!tt.size || tt.has(s.id))));
  const hidden = all.filter((s) => !subs.includes(s));
  const toggle = (k: 'stockOff' | 'examOnly', id: string) => {
    const cur = m[k] ?? [];
    save({ [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const trade = (id: string, n: number) => {
    const p = v.prices.get(id)?.price ?? 0;
    const have = v.hold.get(id)?.qty ?? 0;
    if (n < 0 && -n > have) return toast(`${have}주만 있어요`);
    const fee = Math.round(Math.abs(n * p) * RULE.stockFee);
    if (n > 0 && v.balance < n * p + fee) return toast(`${won(n * p + fee - v.balance)} 모자라요`);
    save({ trades: [...m.trades, { id: newId(), subjectId: id, qty: n, price: p, at: Date.now() }] });
    toast(`${d.subjects[id]?.name} ${Math.abs(n)}주 ${n > 0 ? '샀어요' : '팔았어요'} (수수료 ${won(fee)})`);
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>과목 주식</h2>
      </div>
      <Wallet m={m} />
      <p className="st-hint">과목마다 100은화에서 시작해요. 그 과목을 공부하면 10분마다 +0.5%(하루 +8%까지), 오답을 해결하면 +2%, 그날 공부를 안 하면 −1.5%. 성적이 오르면 +10%, 내리면 −10%. 약한 과목 주식을 싸게 사 두고 공부해서 올려 보세요. 사고팔 때 수수료 {Math.round(RULE.stockFee * 100)}%.</p>
      {!subs.length && <p className="st-hint bad">과목을 먼저 넣어 주세요.</p>}
      {hidden.length > 0 && (
        <p className="st-hint">
          안 보이는 과목: {hidden.map((x) => x.name).join(' · ')}
          {tt.size ? ' (학교 시간표에 없거나 뺀 과목)' : ' (뺀 과목)'}{' '}
          {hidden.some((x) => off.includes(x.id)) && (
            <button className="st-link" onClick={() => save({ stockOff: [] })}>
              뺀 과목 다시 보이기
            </button>
          )}
        </p>
      )}
      {subs.map((s) => {
        const p = v.prices.get(s.id);
        const h = v.hold.get(s.id);
        const ch = p && p.prev ? (p.price - p.prev) / p.prev : 0;
        const n = Math.max(0, Math.round(Number(qty[s.id] ?? '1') || 0));
        return (
          <section key={s.id} className="st-card">
            <div className="st-inline between">
              <b>{s.name}</b>
              <span>
                {won(p?.price ?? 100)} <small className={ch < 0 ? 'mk-minus' : 'mk-plus'}>{ch ? `${ch > 0 ? '+' : ''}${(ch * 100).toFixed(1)}%` : '—'}</small>
              </span>
            </div>
            {p && p.hist.length > 1 && <Spark ys={p.hist} />}
            {h && h.qty > 0 && (
              <small className="st-muted">
                {h.qty}주 · 산 값 {won(Math.round(h.cost))} → 지금 {won(h.qty * (p?.price ?? 0))}
              </small>
            )}
            {exOnly.includes(s.id) && <small className="st-muted">시험 3주 전부터만 내려요</small>}
            <div className="st-inline wrap">
              <input className="st-input xs" inputMode="numeric" value={qty[s.id] ?? '1'} onChange={(e) => setQty({ ...qty, [s.id]: e.target.value.replace(/\D/g, '') })} aria-label={`${s.name} 주 수`} />주
              <button className="btn btn-sm" disabled={!n} onClick={() => trade(s.id, n)}>
                사기
              </button>
              <button className="btn btn-sm" disabled={!n || !h?.qty} onClick={() => trade(s.id, -n)}>
                팔기
              </button>
              <button className="st-link" onClick={() => toggle('examOnly', s.id)}>
                {exOnly.includes(s.id) ? '늘 내리게' : '시험 3주 전부터만 내리기'}
              </button>
              {!h?.qty && (
                <button className="st-link" onClick={() => toggle('stockOff', s.id)}>
                  빼기
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** 작은 꺾은선 (최근 주가) */
function Spark({ ys }: { ys: number[] }) {
  const lo = Math.min(...ys),
    hi = Math.max(...ys);
  const pts = ys.map((y, i) => `${(i / (ys.length - 1)) * 100},${30 - ((y - lo) / (hi - lo || 1)) * 28 - 1}`).join(' ');
  return (
    <svg className="mk-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} />
    </svg>
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
