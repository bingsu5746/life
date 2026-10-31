// 게임: 하는 중 · 하고 싶어요 · 끝낸 것 (기기 · 한 시간 · 별점 · 한줄평) · 한국 Steam 값 · 값 알림 · 내 Steam(가진 게임 · 찜 · 업적)
import { useEffect, useState } from 'react';
import { csMap, gamePrices, gameSearch, gameWatch, isLoggedIn, steamAch, steamMe, steamNames, steamStore, steamThumb, type SteamHit, type SteamMe, type SteamPrice } from '../auth/api';
import { shortDate } from '../study/dates';
import { alive, newId, type Game } from '../study/model';
import { getStudy, put, remove, setSettings, useStudy } from '../study/store';
import { confirmDelete, Empty, Field, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { StarInput, starText } from './MovieParts';
import { WishGoal } from './WishGoal';
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
  const prices = useSteamPrices(list.map((g) => g.steamAppId).filter((x): x is number => !!x));
  useMigrateCs(all);
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
              {g.steamAppId && g.status !== 'done' && <PriceLine appid={g.steamAppId} p={prices[g.steamAppId]} watch={g.watchWon} />}
              <div className="mv-meta">
                {g.status === 'done' ? <span className="mv-stars">{starText(g.rating) || '별점 없음'}</span> : <small className="st-muted">{g.hours ? `${g.hours}시간` : ''}</small>}
                <small className="st-muted">{g.status === 'done' && g.finished ? `${shortDate(g.finished)} 끝냄` : g.status === 'playing' && g.started ? `${shortDate(g.started)}부터` : ''}</small>
              </div>
              {g.note && <p className="mv-comment">“{g.note.split('\n')[0]}”</p>}
            </article>
          ))}
        </div>
      )}
      {isLoggedIn() && <MySteam have={all} />}
      {isLoggedIn() && <SteamFind have={all} />}
      <OtherGames have={all} />
      {edit && <GameSheet item={edit} today={today} onClose={() => setEdit(null)} />}
    </div>
  );
}

const won = (x: number) => `${x.toLocaleString('ko-KR')}원`;
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
/** 한국 Steam 값 (원) · 할인 · 여기서 본 최저 · Steam 에서 보기 (한국 상점으로 바로) */
function PriceLine({ appid, p, watch }: { appid: number; p?: SteamPrice; watch?: number }) {
  const sale = !!p && p.discount > 0;
  return (
    <div className="gm-price">
      {p ? <b className={sale ? 'sale' : ''}>{p.final ? won(p.final) : '무료'}</b> : <small className="st-muted">값 받는 중…</small>}
      {sale && (
        <small className="st-muted">
          <s>{won(p.initial)}</s> {p.discount}% 할인
        </small>
      )}
      {p && p.low > 0 && p.low < p.final && <small className="st-muted">여기서 본 최저 {won(p.low)}</small>}
      {watch && p && <small className={p.final && p.final <= watch ? 'ok' : 'st-muted'}>🔔 {won(watch)} 아래면 알림</small>}
      <a className="st-link" href={steamStore(appid)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        Steam 에서 보기 ↗
      </a>
    </div>
  );
}

/** 값 알림을 건 게임 목록을 서버에 알린다 (서버가 6시간마다 한국 Steam 값을 보고 내려가면 알림) */
export function syncGameWatch(games: Game[]) {
  void gameWatch(games.filter((g) => !g.deleted && g.steamAppId && g.watchWon).map((g) => ({ id: g.steamAppId!, title: g.title, target: g.watchWon! }))).catch(() => {});
}

/** 예전에 CheapShark 번호로 넣은 게임을 Steam 번호로 옮긴다 (달러 값 알림은 원으로 다시 정해야 해서 뺀다) */
function useMigrateCs(games: Game[]) {
  const old = games.filter((g) => g.csId && !g.steamAppId);
  const key = old.map((g) => g.csId).join(',');
  useEffect(() => {
    if (!key || !isLoggedIn()) return;
    csMap(key.split(',').map(Number))
      .then((r) => {
        for (const g of old) {
          const appid = r.map[String(g.csId)];
          if (appid) put('games', { ...g, steamAppId: appid, thumb: steamThumb(appid), csId: undefined, watchPrice: undefined });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Steam 게임 찾기 (한국 상점 값) → 하고 싶어요에 넣기 */
function SteamFind({ have }: { have: Game[] }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<SteamHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const prices = useSteamPrices((list ?? []).slice(0, 20).map((x) => x.appid));
  const find = async () => {
    if (!q.trim() || busy) return;
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
        <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="게임 이름 (한글 · 영어)" aria-label="찾을 게임" />
        <button className="btn btn-sm btn-primary" disabled={busy || !q.trim()}>
          {busy ? '찾는 중…' : '찾기'}
        </button>
      </form>
      {err && <p className="st-muted sm">{err}</p>}
      {list && !list.length && <p className="st-muted sm">한국 Steam 상점에서 찾지 못했어요.</p>}
      {list && list.length > 0 && (
        <div className="dg-list">
          {list.slice(0, 20).map((h) => (
            <div key={h.appid} className="dg-item gm-item">
              <img src={h.thumb} alt="" loading="lazy" />
              <div className="dg-info">
                <b>{h.name}</b>
                <PriceLine appid={h.appid} p={prices[h.appid]} />
              </div>
              <div className="dg-btns">
                <button className="btn btn-sm" onClick={() => addSteam(have, h.appid, h.name, 'want')}>
                  하고 싶어요
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="st-muted sm">값은 한국 Steam 상점(원) 기준이에요. 「여기서 본 최저」는 이 앱이 값을 본 뒤로 가장 쌌던 값이에요 (Steam 이 역대 최저를 알려 주지 않아요).</p>
    </section>
  );
}

function addSteam(have: Game[], appid: number, name: string, status: Game['status']) {
  if (have.some((g) => g.steamAppId === appid || g.title.toLowerCase() === name.toLowerCase())) return toast('이미 있어요');
  put('games', { id: newId(), created: Date.now(), title: name, platform: 'PC', status, steamAppId: appid, thumb: steamThumb(appid) } as Game);
  toast(status === 'want' ? '하고 싶어요에 넣었어요' : '넣었어요');
}

/** 스팀이 아닌 자체 런처 게임 (바로 넣기) */
const OTHER_GAMES: { title: string; client: string }[] = [
  { title: '리그 오브 레전드', client: 'Riot Client' },
  { title: '발로란트', client: 'Riot Client' },
  { title: '오버워치 2', client: 'Battle.net' },
  { title: 'FC 온라인', client: '넥슨' },
  { title: '메이플스토리', client: '넥슨' },
  { title: '로스트아크', client: 'STOVE' },
];
function OtherGames({ have }: { have: Game[] }) {
  return (
    <section className="st-card">
      <h3 className="st-h">스팀이 아닌 게임 바로 넣기</h3>
      <div className="st-chips">
        {OTHER_GAMES.map((g) => {
          const on = have.some((x) => x.title === g.title);
          return (
            <button
              key={g.title}
              className={`st-chip ${on ? 'on' : ''}`}
              disabled={on}
              onClick={() => {
                put('games', { id: newId(), created: Date.now(), title: g.title, platform: `PC (${g.client})`, status: 'playing', started: undefined } as Game);
                toast(`${g.title} 을 하는 중에 넣었어요`);
              }}
            >
              {g.title} <small className="st-muted">{g.client}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 내 Steam: 프로필 · 가진 게임(한 시간) · 최근 2주 · 찜 목록(한국 값) · 게임을 누르면 업적 · 기록 */
function MySteam({ have }: { have: Game[] }) {
  const d = useStudy();
  const sid = d.settings.steamId ?? '';
  const [input, setInput] = useState('');
  const [data, setData] = useState<{ me: SteamMe | null; wish: { appid: number; added: number }[]; needKey?: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<{ appid: number; name: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!sid) return;
    let live = true;
    setErr('');
    steamMe(sid)
      .then((r) => live && setData(r))
      .catch((e) => live && setErr(e instanceof Error ? e.message : 'Steam 정보를 받지 못했어요'));
    return () => {
      live = false;
    };
  }, [sid]);
  const wishIds = (data?.wish ?? []).map((w) => w.appid);
  const prices = useSteamPrices(wishIds.slice(0, 100));
  const names = useSteamNames(wishIds.slice(0, 100));
  if (!sid)
    return (
      <section className="st-card">
        <h3 className="st-h">내 Steam</h3>
        <p className="st-muted sm">Steam ID(17자리 숫자)를 넣으면 가진 게임 · 한 시간 · 찜 목록(한국 값)을 보여 줘요. Steam 프로필이 「공개」여야 해요.</p>
        <form
          className="st-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{17}$/.test(input.trim())) return toast('Steam ID 는 17자리 숫자예요');
            setSettings({ steamId: input.trim() });
          }}
        >
          <input className="st-input" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="예: 7656119…" aria-label="Steam ID" />
          <button className="btn btn-sm btn-primary">저장</button>
        </form>
      </section>
    );
  const me = data?.me;
  const totalH = me ? Math.round(me.owned.reduce((a, g) => a + g.minutes, 0) / 60) : 0;
  const recent = me ? me.owned.filter((g) => g.recent > 0).sort((a, b) => b.recent - a.recent) : [];
  const owned = me ? (showAll ? me.owned : me.owned.slice(0, 12)) : [];
  const h = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}시간` : `${m}분`);
  return (
    <section className="st-card">
      <div className="sh-head">
        <h3 className="st-h">내 Steam</h3>
        <button className="st-link" onClick={() => confirm('Steam ID 를 지울까요?') && setSettings({ steamId: undefined })}>
          ID 바꾸기
        </button>
      </div>
      {err && <p className="st-muted sm">{err}</p>}
      {!data && !err && <p className="st-muted sm">Steam 정보를 받는 중…</p>}
      {data?.needKey && <p className="st-muted sm">가진 게임을 보려면 서버에 Steam 키가 필요해요. 찜 목록만 보여 드려요.</p>}
      {me && (
        <>
          <div className="gm-me">
            {me.avatar && <img src={me.avatar} alt="" />}
            <div>
              <b>{me.name}</b>
              <small className="st-muted">
                게임 {me.count}개 · 모두 {totalH.toLocaleString('ko-KR')}시간
              </small>
            </div>
          </div>
          {recent.length > 0 && (
            <>
              <h4 className="ta-h">최근 2주</h4>
              {recent.map((g) => (
                <div key={g.appid} className="gm-row st-tap" {...tap(() => setPick(g))}>
                  <img src={steamThumb(g.appid)} alt="" loading="lazy" />
                  <span>{g.name}</span>
                  <small className="st-muted">{h(g.recent)}</small>
                </div>
              ))}
            </>
          )}
          <h4 className="ta-h">가진 게임 (많이 한 순)</h4>
          {owned.map((g) => (
            <div key={g.appid} className="gm-row st-tap" {...tap(() => setPick(g))}>
              <img src={steamThumb(g.appid)} alt="" loading="lazy" />
              <span>{g.name}</span>
              <small className="st-muted">{g.minutes ? h(g.minutes) : '안 해 봄'}</small>
            </div>
          ))}
          {me.owned.length > 12 && (
            <button className="st-link" onClick={() => setShowAll(!showAll)}>
              {showAll ? '접기' : `모두 보기 (${me.owned.length}개)`}
            </button>
          )}
        </>
      )}
      {data && data.wish.length > 0 && (
        <>
          <h4 className="ta-h">찜 목록 (한국 값{Object.values(prices).some((p) => p.discount) ? ' · 할인 중인 것 먼저' : ''})</h4>
          {[...data.wish]
            .sort((a, b) => (prices[b.appid]?.discount ?? 0) - (prices[a.appid]?.discount ?? 0) || b.added - a.added)
            .slice(0, 60)
            .map((w) => (
              <div key={w.appid} className="gm-row">
                <img src={steamThumb(w.appid)} alt="" loading="lazy" />
                <span>
                  {names[w.appid] ?? `#${w.appid}`}
                  <PriceLine appid={w.appid} p={prices[w.appid]} />
                </span>
                <button className="btn btn-sm" onClick={() => addSteam(have, w.appid, names[w.appid] ?? `Steam ${w.appid}`, 'want')}>
                  하고 싶어요
                </button>
              </div>
            ))}
        </>
      )}
      {pick && <AchSheet steamid={sid} game={pick} onClose={() => setPick(null)} />}
    </section>
  );
}

/** 찜 목록은 번호만 와서 이름은 Steam 찾기로 (한 번 받은 이름은 이 기기에 기억) */
function useSteamNames(ids: number[]): Record<number, string> {
  const [names, setNames] = useState<Record<number, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('my-study.steam.names') ?? '{}') as Record<number, string>;
    } catch {
      return {};
    }
  });
  const missing = ids.filter((id) => !names[id]);
  const key = missing.join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    steamNames(key.split(',').map(Number))
      .then((r) => {
        if (!live) return;
        setNames((n) => {
          const next = { ...n, ...r };
          try {
            localStorage.setItem('my-study.steam.names', JSON.stringify(next));
          } catch {
            /* 무시 */
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  return names;
}

/** 업적 · 게임 기록 (카운터-스트라이크 2 처럼 킬 · 데스를 주는 게임은 K/D) */
function AchSheet({ steamid, game, onClose }: { steamid: string; game: { appid: number; name: string }; onClose: () => void }) {
  const [a, setA] = useState<Awaited<ReturnType<typeof steamAch>> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    steamAch(steamid, game.appid)
      .then(setA)
      .catch((e) => setErr(e instanceof Error ? e.message : '받지 못했어요'));
  }, [steamid, game.appid]);
  const stat = (n: string) => a?.stats.find((s) => s.name === n)?.value;
  const kills = stat('total_kills'),
    deaths = stat('total_deaths');
  return (
    <Sheet title={game.name} onClose={onClose}>
      <img className="gm-hero" src={steamThumb(game.appid)} alt="" />
      {err && <p className="st-muted">{err}</p>}
      {!a && !err && <p className="st-muted">받는 중…</p>}
      {a && (
        <>
          {kills !== undefined && deaths !== undefined && (
            <div className="nba-avg">
              <div>
                <small>킬</small>
                <b>{kills.toLocaleString('ko-KR')}</b>
              </div>
              <div>
                <small>데스</small>
                <b>{deaths.toLocaleString('ko-KR')}</b>
              </div>
              <div>
                <small>K/D</small>
                <b>{deaths ? (kills / deaths).toFixed(2) : '-'}</b>
              </div>
            </div>
          )}
          {a.total > 0 ? (
            <>
              <p className="sm">
                업적 {a.done}/{a.total} ({Math.round((a.done / a.total) * 100)}%)
              </p>
              <div className="sh-bar">
                <i style={{ width: `${(a.done / a.total) * 100}%` }} />
              </div>
              {a.list.slice(0, 10).map((x) => (
                <div key={x.name + x.at} className="gm-ach">
                  <b>{x.name}</b>
                  <small className="st-muted">
                    {x.desc} {x.at ? `· ${new Date(x.at * 1000).toLocaleDateString('ko-KR')}` : ''}
                  </small>
                </div>
              ))}
            </>
          ) : (
            <p className="st-muted sm">이 게임은 업적이 없거나, 받을 수 없어요.</p>
          )}
          {a.stats.length > 0 && kills === undefined && (
            <details>
              <summary>게임 기록 ({a.stats.length}개, 게임이 주는 이름 그대로)</summary>
              {a.stats.slice(0, 40).map((x) => (
                <div key={x.name} className="gm-ach">
                  <small>{x.name}</small> <b>{x.value.toLocaleString('ko-KR')}</b>
                </div>
              ))}
            </details>
          )}
        </>
      )}
      <a className="btn" href={steamStore(game.appid)} target="_blank" rel="noreferrer">
        Steam 상점에서 보기 ↗
      </a>
    </Sheet>
  );
}

function GameSheet({ item, today, onClose }: { item: Partial<Game>; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(item.title ?? '');
  const [platform, setPlatform] = useState(item.platform ?? '');
  const [status, setStatus] = useState<Game['status']>(item.status ?? 'playing');
  const [hours, setHours] = useState(item.hours?.toString() ?? '');
  const [rating, setRating] = useState(item.rating ?? 0);
  const [note, setNote] = useState(item.note ?? '');
  const [watch, setWatch] = useState(item.watchWon?.toString() ?? '');
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
      watchWon: item.steamAppId && watch && w > 0 && status === 'want' ? Math.round(w) : undefined,
    } as Game);
    // 값 알림이 바뀌었으면 서버에 알린다
    if ((item.watchWon ?? 0) !== (item.steamAppId && watch && w > 0 && status === 'want' ? Math.round(w) : 0)) setTimeout(() => syncGameWatch(alive(getStudy().games)), 0);
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
        {item.steamAppId && status === 'want' && (
          <label className="st-cond-time">
            값 알림 (한국 Steam, 원)
            <input className="st-input xs" inputMode="numeric" value={watch} onChange={(e) => setWatch(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="예: 15000" aria-label="이 값 아래로 내려가면 알림 (원)" />
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
        {item.id && status === 'want' && title.trim() && (
          <Field group label="사고 싶은 것 → 모으기">
            <WishGoal name={title.trim()} />
          </Field>
        )}
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
