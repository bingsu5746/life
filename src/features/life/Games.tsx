// 게임: 하는 중 · 하고 싶어요 · 끝낸 것 (기기 · 한 시간 · 별점 · 한줄평) · Steam 값(CheapShark) · 값 알림
import { useEffect, useState } from 'react';
import { gamePrices, gameSearch, gameWatch, isLoggedIn, type SteamHit, type SteamPrice } from '../auth/api';
import { shortDate } from '../study/dates';
import { alive, newId, type Game } from '../study/model';
import { getStudy, put, remove, useStudy } from '../study/store';
import { confirmDelete, Empty, Field, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { StarInput, starText } from './MovieParts';
import { NameSearch } from './NameSearch';

type Tab = Game['status'];
const TAB_NAME: Record<Tab, string> = { playing: '하는 중', want: '하고 싶어요', done: '끝낸 것' };
const PLATFORMS = ['PC', '스위치', '플레이스테이션', 'Xbox', '폰'];

export function Games(_: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [tab, setTab] = useState<Tab>('playing');
  const [edit, setEdit] = useState<Partial<Game> | null>(null);
  const all = alive(d.games);
  const by = (s: Tab) => all.filter((g) => g.status === s).sort((a, b) => (s === 'done' ? (b.finished ?? '').localeCompare(a.finished ?? '') : b.created - a.created));
  const list = by(tab);
  const year = today.slice(0, 4);
  const hours = all.reduce((a, g) => a + (g.hours ?? 0), 0);
  const prices = useSteamPrices(list.map((g) => g.csId).filter((x): x is number => !!x));
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>게임</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit({ status: tab })} aria-label="게임 넣기">
          <Icon name="plus" />
        </button>
      </div>
      {all.length > 0 && (
        <div className="mv-summary">
          <span>
            올해 끝낸 게임 <b>{by('done').filter((g) => g.finished?.startsWith(year)).length}</b>
          </span>
          {hours > 0 && (
            <span>
              전체 <b>{Math.round(hours)}</b>시간
            </span>
          )}
        </div>
      )}
      <nav className="mv-sub" aria-label="게임">
        {(Object.keys(TAB_NAME) as Tab[]).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {TAB_NAME[k]}
            {by(k).length ? ` ${by(k).length}` : ''}
          </button>
        ))}
      </nav>
      {!list.length ? (
        <Empty title={all.length ? '이 칸에는 게임이 없어요' : '하는 게임을 넣어 보세요'}>
          <p>기기와 한 시간을 적고, 끝내면 별점과 한줄평을 남길 수 있어요.</p>
          <button className="btn btn-primary" onClick={() => setEdit({ status: tab })}>
            게임 넣기
          </button>
        </Empty>
      ) : (
        <div className="mv-list">
          {list.map((g) => (
            <article key={g.id} className="mv-card st-tap" {...tap(() => setEdit(g))}>
              <div className="mv-top">
                {g.thumb && <img className="gm-thumb" src={g.thumb} alt="" loading="lazy" />}
                <b>{g.title}</b>
                {g.platform && <small className="st-muted">{g.platform}</small>}
              </div>
              {g.csId && prices[g.csId] && <PriceLine p={prices[g.csId]} watch={g.watchPrice} />}
              <div className="mv-meta">
                {g.status === 'done' ? <span className="mv-stars">{starText(g.rating) || '별점 없음'}</span> : <small className="st-muted">{g.hours ? `${g.hours}시간` : ''}</small>}
                <small className="st-muted">{g.status === 'done' && g.finished ? `${shortDate(g.finished)} 끝냄` : g.status === 'playing' && g.started ? `${shortDate(g.started)}부터` : ''}</small>
              </div>
              {g.note && <p className="mv-comment">“{g.note.split('\n')[0]}”</p>}
            </article>
          ))}
        </div>
      )}
      {isLoggedIn() && <SteamFind have={all} />}
      {edit && <GameSheet item={edit} today={today} onClose={() => setEdit(null)} />}
    </div>
  );
}

const usd = (x: number) => `$${x.toFixed(2)}`;
function useSteamPrices(ids: number[]): Record<number, SteamPrice> {
  const [p, setP] = useState<Record<number, SteamPrice>>({});
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!key || !isLoggedIn()) return;
    let live = true;
    gamePrices(key.split(',').map(Number))
      .then((r) => live && setP(r.prices))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  return p;
}
function PriceLine({ p, watch }: { p: SteamPrice; watch?: number }) {
  const sale = p.retail > p.price;
  return (
    <div className="gm-price">
      <b className={sale ? 'sale' : ''}>Steam {usd(p.price)}</b>
      {sale && (
        <small className="st-muted">
          <s>{usd(p.retail)}</s> {Math.round((1 - p.price / p.retail) * 100)}% 할인
        </small>
      )}
      {p.lowest > 0 && <small className="st-muted">역대 최저 {usd(p.lowest)}</small>}
      {watch && <small className={p.price <= watch ? 'ok' : 'st-muted'}>🔔 {usd(watch)} 아래면 알림</small>}
    </div>
  );
}

/** 값 알림을 건 게임 목록을 서버에 알린다 (서버가 6시간마다 보고 내려가면 알림) */
export function syncGameWatch(games: Game[]) {
  void gameWatch(games.filter((g) => !g.deleted && g.csId && g.watchPrice).map((g) => ({ id: g.csId!, title: g.title, target: g.watchPrice! }))).catch(() => {});
}

/** Steam 게임 찾기 → 하고 싶어요에 넣기 (값은 미국 달러, CheapShark) */
function SteamFind({ have }: { have: Game[] }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<SteamHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const prices = useSteamPrices((list ?? []).slice(0, 25).map((x) => x.id));
  const find = async () => {
    if (q.trim().length < 2 || busy) return;
    setBusy(true);
    setErr('');
    try {
      setList((await gameSearch(q.trim())).list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '찾지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  const add = (h: SteamHit) => {
    if (have.some((g) => g.csId === h.id || g.title.toLowerCase() === h.title.toLowerCase())) return toast('이미 있어요');
    put('games', { id: newId(), created: Date.now(), title: h.title, platform: 'PC', status: 'want', csId: h.id, thumb: h.thumb || undefined } as Game);
    toast('하고 싶어요에 넣었어요');
  };
  return (
    <section className="st-card">
      <h3 className="st-h">Steam 게임 찾기</h3>
      <form
        className="st-inline"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="게임 이름 (영어)" aria-label="찾을 게임" />
        <button className="btn btn-sm btn-primary" disabled={busy || q.trim().length < 2}>
          {busy ? '찾는 중…' : '찾기'}
        </button>
      </form>
      {err && <p className="st-muted sm">{err}</p>}
      {list && !list.length && <p className="st-muted sm">Steam 에서 찾지 못했어요.</p>}
      {list && list.length > 0 && (
        <div className="dg-list">
          {list.slice(0, 25).map((h) => (
            <div key={h.id} className="dg-item gm-item">
              {h.thumb ? <img src={h.thumb} alt="" loading="lazy" /> : <span className="dg-noimg" aria-hidden />}
              <div className="dg-info">
                <b>{h.title}</b>
                {prices[h.id] ? <PriceLine p={prices[h.id]} /> : <small className="st-muted">값 받는 중…</small>}
              </div>
              <div className="dg-btns">
                <button className="btn btn-sm" onClick={() => add(h)}>
                  하고 싶어요
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="st-muted sm">값은 Steam 미국 달러 기준이에요 (CheapShark). 한국 Steam 값과 다를 수 있어요.</p>
    </section>
  );
}

function GameSheet({ item, today, onClose }: { item: Partial<Game>; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(item.title ?? '');
  const [platform, setPlatform] = useState(item.platform ?? '');
  const [status, setStatus] = useState<Game['status']>(item.status ?? 'playing');
  const [hours, setHours] = useState(item.hours?.toString() ?? '');
  const [rating, setRating] = useState(item.rating ?? 0);
  const [note, setNote] = useState(item.note ?? '');
  const [watch, setWatch] = useState(item.watchPrice?.toString() ?? '');
  function save() {
    const h = Number(hours);
    const w = Number(watch);
    put('games', {
      ...item,
      id: item.id ?? newId(),
      created: item.created ?? Date.now(),
      title: title.trim(),
      platform: platform.trim() || undefined,
      status,
      hours: hours && h >= 0 ? Math.round(h * 10) / 10 : undefined,
      rating: status === 'done' && rating ? rating : item.rating,
      note: note.trim() || undefined,
      started: item.started ?? (status === 'playing' ? today : undefined),
      finished: status === 'done' ? (item.finished ?? today) : undefined,
      watchPrice: item.csId && watch && w > 0 && status === 'want' ? Math.round(w * 100) / 100 : undefined,
    } as Game);
    // 값 알림이 바뀌었으면 서버에 알린다
    if ((item.watchPrice ?? 0) !== (item.csId && watch && w > 0 && status === 'want' ? Math.round(w * 100) / 100 : 0)) setTimeout(() => syncGameWatch(alive(getStudy().games)), 0);
    toast('저장했어요');
    onClose();
  }
  return (
    <Sheet title={item.id ? '게임 고치기' : '게임 넣기'} onClose={onClose}>
      <div className="st-form">
        <NameSearch
          type="game"
          value={title}
          onChange={setTitle}
          picked={!!item.id}
          onPick={(f) => {
            setTitle(f.title);
            const p = f.by?.split(', ').find((x) => /PC|Switch|PlayStation|Xbox|iOS|Android/.test(x));
            if (p && !platform) setPlatform(/Switch/.test(p) ? '스위치' : /PlayStation/.test(p) ? '플레이스테이션' : /Xbox/.test(p) ? 'Xbox' : /iOS|Android/.test(p) ? '폰' : 'PC');
          }}
          placeholder="게임 이름"
          label="게임 이름"
        />
        <div className="st-seg">
          {(Object.keys(TAB_NAME) as Game['status'][]).map((k) => (
            <button key={k} type="button" className={status === k ? 'on' : ''} aria-pressed={status === k} onClick={() => setStatus(k)}>
              {TAB_NAME[k]}
            </button>
          ))}
        </div>
        <Field group label="기기">
          <div className="st-chips">
            {PLATFORMS.map((p) => (
              <button key={p} type="button" className={`st-chip ${platform === p ? 'on' : ''}`} aria-pressed={platform === p} onClick={() => setPlatform(platform === p ? '' : p)}>
                {p}
              </button>
            ))}
          </div>
        </Field>
        {item.csId && status === 'want' && (
          <label className="st-cond-time">
            값 알림 (Steam 달러)
            <input className="st-input xs" inputMode="decimal" value={watch} onChange={(e) => setWatch(e.target.value.replace(/[^\d.]/g, '').slice(0, 7))} placeholder="예: 9.99" aria-label="이 값 아래로 내려가면 알림 (달러)" />
            <small className="st-muted">이 값 아래가 되면 알림 (6시간마다 확인, 설정 › 알림이 켜져 있어야 해요)</small>
          </label>
        )}
        {status !== 'want' && (
          <label className="st-cond-time">
            한 시간
            <input className="st-input xs" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} aria-label="한 시간" />
          </label>
        )}
        {status === 'done' && (
          <Field group label="별점">
            <StarInput value={rating} onChange={setRating} />
          </Field>
        )}
        <textarea className="st-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'want' ? '하고 싶은 이유 · 누가 추천했는지' : '한줄평 · 메모'} aria-label="메모" />
        <div className="st-row end">
          {item.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('games', item.id!), onClose())}>
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!title.trim()} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}
