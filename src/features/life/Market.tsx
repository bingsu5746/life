// 시장: 상점(보상 사기 · 산 것 쓰기) · 지갑(번 포인트 내역) · 규칙(포인트 주는 기준)
import { useState } from 'react';
import { shortDate } from '../study/dates';
import { newId, type MarketSettings } from '../study/model';
import { getStudy, setSettings, useStudy } from '../study/store';
import { confirmDelete, Empty, Field, Sheet, toast, useToday } from '../study/ui';
import { DEFAULT_RATE, ITEM_IDEAS, newMarket, wallet } from './market';

export function Market({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const m = d.settings.market;
  if (!m)
    return (
      <div className="st-page narrow">
        <div className="st-page-head">
          <h2>시장</h2>
        </div>
        <Empty icon="🏪" title="공부해서 포인트를 모아 보상과 바꿔요">
          <p>공부 10분마다 1점, 습관 하나 2점, 할 일 하나 1점, 오답 해결 3점 (규칙에서 바꿀 수 있어요). 오늘부터 세기 시작해요.</p>
          <button className="btn btn-primary" onClick={() => setSettings({ market: newMarket(today) })}>
            시장 열기
          </button>
        </Empty>
      </div>
    );
  if (sub === 'wallet') return <Wallet m={m} />;
  if (sub === 'rules') return <Rules m={m} />;
  return <Shop m={m} />;
}

const save = (p: Partial<MarketSettings>) => {
  const cur = getStudy().settings.market;
  if (cur) setSettings({ market: { ...cur, ...p } });
};

function Balance({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const w = wallet(d, m, today);
  return (
    <section className="st-card mk-wallet">
      <small>남은 포인트</small>
      <b>{w.balance.toLocaleString('ko-KR')}</b>
      <span className="st-muted">
        오늘 +{w.today} · 최근 7일 +{w.week}
      </span>
    </section>
  );
}

function Shop({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState<MarketSettings['items'][number] | 'new' | null>(null);
  const bal = wallet(d, m, today).balance;
  const unused = m.buys.filter((b) => !b.used);
  const buy = (it: MarketSettings['items'][number]) => {
    if (bal < it.price) return toast(`${it.price - bal}점 더 모아야 해요`);
    if (!window.confirm(`「${it.name}」 을(를) ${it.price}점에 살까요?`)) return;
    save({ buys: [...m.buys, { id: newId(), itemId: it.id, name: it.name, price: it.price, at: Date.now() }] });
    toast(`${it.icon} ${it.name} 샀어요 · 쓸 때 「썼어요」를 눌러요`);
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>상점</h2>
        <button className="btn btn-sm" onClick={() => setEdit('new')}>
          ＋ 보상
        </button>
      </div>
      <Balance m={m} />
      {!m.items.length ? (
        <section className="st-card">
          <p className="st-hint">살 보상을 정해요. 눌러서 바로 넣을 수 있어요.</p>
          <div className="st-chips">
            {ITEM_IDEAS.map((x) => (
              <button key={x.name} className="st-chip" onClick={() => save({ items: [...m.items, { ...x, id: newId() }] })}>
                {x.icon} {x.name} · {x.price}점
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="mk-shop">
          {m.items.map((it) => (
            <div key={it.id} className={`mk-shop-item ${bal < it.price ? 'short' : ''}`}>
              <button className="mk-shop-buy" onClick={() => buy(it)}>
                <span className="mk-icon">{it.icon}</span>
                <b>{it.name}</b>
                <small>{it.price}점</small>
              </button>
              <button className="st-link" onClick={() => setEdit(it)}>
                고치기
              </button>
            </div>
          ))}
        </div>
      )}
      {unused.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">산 것 (아직 안 씀)</h3>
          {unused.map((b) => (
            <div key={b.id} className="st-item">
              <div className="st-item-main">
                <div className="st-item-title">{b.name}</div>
                <div className="st-item-sub">{shortDate(new Date(b.at + 9 * 3_600_000).toISOString().slice(0, 10))} · {b.price}점</div>
              </div>
              <button className="btn btn-sm" onClick={() => save({ buys: m.buys.map((x) => (x.id === b.id ? { ...x, used: true } : x)) })}>
                썼어요
              </button>
            </div>
          ))}
        </section>
      )}
      {edit && <ItemSheet m={m} item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ItemSheet({ m, item, onClose }: { m: MarketSettings; item?: MarketSettings['items'][number]; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [icon, setIcon] = useState(item?.icon ?? '🎁');
  const [price, setPrice] = useState(String(item?.price ?? 30));
  const p = Math.round(Number(price));
  const ok = name.trim() && p >= 1 && p <= 100000;
  return (
    <Sheet title={item ? '보상 고치기' : '보상 넣기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-inline">
          <input className="st-input xs" value={icon} onChange={(e) => setIcon([...e.target.value].slice(-1).join('') || '🎁')} aria-label="그림 (이모지)" />
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 게임 30분" autoFocus={!item} />
        </div>
        <Field label="가격 (점)">
          <input className="st-input xs" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        </Field>
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
              const it = { id: item?.id ?? newId(), name: name.trim().slice(0, 30), icon, price: p };
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

function Wallet({ m }: { m: MarketSettings }) {
  const d = useStudy();
  const today = useToday();
  const w = wallet(d, m, today);
  const rows = [...w.days.map((x) => ({ k: `e${x.date}`, at: x.date, text: [x.study && `공부 ${x.study}`, x.habit && `습관 ${x.habit}`, x.todo && `할 일 ${x.todo}`, x.note && `오답 ${x.note}`].filter(Boolean).join(' · '), pts: x.total })), ...m.buys.map((b) => ({ k: b.id, at: new Date(b.at + 9 * 3_600_000).toISOString().slice(0, 10), text: `${b.name} 삼${b.used ? ' (씀)' : ''}`, pts: -b.price }))].sort((a, b) => b.at.localeCompare(a.at) || a.pts - b.pts);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>지갑</h2>
      </div>
      <Balance m={m} />
      <section className="st-card">
        <div className="st-stat-row">
          <div>
            <small>모은 포인트</small>
            <b>{w.earned.toLocaleString('ko-KR')}</b>
          </div>
          <div>
            <small>쓴 포인트</small>
            <b>{w.spent.toLocaleString('ko-KR')}</b>
          </div>
        </div>
        {!rows.length && <p className="st-hint">{shortDate(m.since)}부터 공부 · 습관 · 할 일 · 오답 해결을 세요.</p>}
        {rows.slice(0, 60).map((r) => (
          <div key={r.k} className="st-item">
            <div className="st-item-main">
              <div className="st-item-title">{r.text}</div>
              <div className="st-item-sub">{shortDate(r.at)}</div>
            </div>
            <b className={r.pts < 0 ? 'mk-minus' : 'mk-plus'}>
              {r.pts > 0 ? '+' : ''}
              {r.pts}
            </b>
          </div>
        ))}
      </section>
    </div>
  );
}

function Rules({ m }: { m: MarketSettings }) {
  const [r, setR] = useState(m.rate);
  const rows: [keyof MarketSettings['rate'], string][] = [
    ['study10', '공부 10분마다'],
    ['habit', '습관 하나 체크'],
    ['todo', '할 일 하나 끝'],
    ['note', '오답 하나 해결'],
  ];
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>규칙</h2>
      </div>
      <section className="st-card st-form">
        {rows.map(([k, label]) => (
          <label key={k} className="st-inline between">
            <span>{label}</span>
            <span className="st-inline">
              <input className="st-input xs" inputMode="numeric" value={r[k]} onChange={(e) => setR({ ...r, [k]: Math.min(1000, Number(e.target.value.replace(/\D/g, '')) || 0) })} />점
            </span>
          </label>
        ))}
        <p className="st-hint">규칙을 바꾸면 지난 기록도 새 규칙으로 다시 세요 ({shortDate(m.since)}부터).</p>
        <div className="st-row end">
          <button className="btn btn-sm" onClick={() => setR(DEFAULT_RATE)}>
            처음 규칙
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => (save({ rate: r }), toast('규칙을 바꿨어요'))}>
            저장
          </button>
        </div>
      </section>
    </div>
  );
}
