// 게임: 하는 중 · 하고 싶어요 · 끝낸 것 (기기 · 한 시간 · 별점 · 한줄평) · 한국 Steam 값 · 값 알림 · 내 Steam(가진 게임 · 찜 · 업적)
import { useEffect, useState } from 'react';
import { gamePrices, gameSearch, gameWatch, isLoggedIn, steamAch, steamMe, steamNames, steamStore, steamThumb, steamWatchGet, steamWatchSet, type SteamHit, type SteamMe, type SteamPrice } from '../auth/api';
import { LolPage } from './Lol';
import { SteamImg } from './SteamImg';
import { GameTimeCard } from './GameTime';
import { LolChampsPage } from './LolChamps';
import { LolChampPage } from './LolChamp';
import { LolLivePage } from './LolLive';
import { dailyPlay, pickUnplayed } from './steamPlay';
import { addDays, diffDays, weekStart } from '../study/dates';
import { upcomingExams } from '../study/exams';
import { minutesText } from '../study/timer';
import { shortDate } from '../study/dates';
import { alive, newId, type Game } from '../study/model';
import { put, setSettings, useStudy } from '../study/store';
import { Empty, Sheet, tap, toast, useToday } from '../study/ui';
import { WishGoal } from './WishGoal';

export function Games({ sub, sub2, sub3 }: { sub?: string; sub2?: string; sub3?: string }) {
  if (sub === 'lol') return <LolPage />;
  if (sub === 'champs') return <LolChampsPage />;
  if (sub === 'live') return <LolLivePage />;
  if (sub === 'champ' && sub2) return <LolChampPage id={sub2} sub={sub3} />;
  if (sub === 'steam') return <SteamPage />;
  // 예전 주소 /games/wish 는 취미 › 위시리스트로
  if (sub === 'wish') return <WishPage />;
  return <MyGames />;
}

function MyGames() {
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>게임 시간</h2>
      </div>
      {isLoggedIn() ? <GameTimeCard /> : <p className="st-muted">로그인하면 볼 수 있어요.</p>}
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
      <p className="st-muted sm">한국 Steam 상점 가격</p>
    </section>
  );
}

function addSteam(have: Game[], appid: number, name: string, status: Game['status']) {
  if (have.some((g) => g.steamAppId === appid || g.title.toLowerCase() === name.toLowerCase())) return toast('이미 있어요');
  put('games', { id: newId(), created: Date.now(), title: name, platform: 'PC', status, steamAppId: appid, thumb: steamThumb(appid) } as Game);
  toast(status === 'want' ? '하고 싶어요에 넣었어요' : '넣었어요');
}

/** 스팀이 아닌 자체 런처 게임 (바로 넣기) */
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
        <p className="st-muted sm">Steam ID(17자리)를 넣어 주세요. 프로필이 공개여야 해요.</p>
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
      {data?.needKey && <p className="st-muted sm">Steam 키가 없어 찜 목록만 보여요.</p>}
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
                  <SteamImg appid={g.appid} icon={g.icon} />
                  <span>{g.name}</span>
                  <small className="st-muted">{h(g.recent)}</small>
                </div>
              ))}
            </>
          )}
          <h4 className="ta-h">가진 게임 (많이 한 순)</h4>
          {owned.map((g) => (
            <div key={g.appid} className="gm-row st-tap" {...tap(() => setPick(g))}>
              <SteamImg appid={g.appid} icon={g.icon} />
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
                <SteamImg appid={w.appid} />
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
      <SteamImg className="gm-hero" appid={game.appid} />
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

function SteamPage() {
  const d = useStudy();
  const all = alive(d.games);
  if (!isLoggedIn())
    return (
      <div className="st-page narrow">
        <h2>Steam</h2>
        <p className="st-muted">로그인하면 Steam 을 볼 수 있어요.</p>
      </div>
    );
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>Steam</h2>
      </div>
      <SteamInsights />
      <MySteam have={all} />
      <SteamFind have={all} />
    </div>
  );
}

/** Steam 한 시간으로: 이번 주 게임 vs 공부 · 시험 기간 하루 목표 · 이번 주 해 볼 안 해 본 게임 · 찜 할인 알림 */
function SteamInsights() {
  const d = useStudy();
  const today = useToday();
  const sid = d.settings.steamId ?? '';
  const [data, setData] = useState<Awaited<ReturnType<typeof steamMe>> | null>(null);
  const [alertOn, setAlertOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!sid) return;
    steamMe(sid)
      .then(setData)
      .catch(() => {});
    steamWatchGet()
      .then((r) => setAlertOn(r.on))
      .catch(() => {});
  }, [sid]);
  if (!sid) return null;
  const hist = data?.hist ?? {};
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const play = dailyPlay(hist);
  const playOf = (dd: string) => play.find((x) => x.date === dd)?.min ?? 0;
  const studyOf = (dd: string) =>
    alive(d.sessions)
      .filter((x) => x.date === dd)
      .reduce((a, x) => a + x.minutes, 0);
  const weekPlay = days.reduce((a, dd) => a + playOf(dd), 0);
  const weekStudy = days.reduce((a, dd) => a + studyOf(dd), 0);
  const recordedDays = Object.keys(hist).length;
  const limit = d.settings.gameLimit;
  const exam = upcomingExams(d, today).find((e) => diffDays(today, e.date) <= (limit?.examDays ?? 14) && diffDays(today, e.date) >= 0);
  const pick = data?.me ? pickUnplayed(data.me.owned, weekStart(today)) : null;
  const max = Math.max(1, ...days.map((dd) => Math.max(playOf(dd), studyOf(dd))));
  return (
    <>
      <section className="st-card">
        <div className="sh-head">
          <h3 className="st-h">이번 주 게임 vs 공부</h3>
          <small className="st-muted">
            게임 {minutesText(weekPlay)} · 공부 {minutesText(weekStudy)}
          </small>
        </div>
        {recordedDays < 2 ? (
          <p className="st-muted sm">내일부터 보여요.</p>
        ) : (
          <div className="gs-week">
            {days.map((dd) => (
              <div key={dd} title={`${shortDate(dd)} 게임 ${minutesText(playOf(dd))} · 공부 ${minutesText(studyOf(dd))}`}>
                <span className="gs-bars">
                  <i className="g" style={{ height: `${(playOf(dd) / max) * 100}%` }} />
                  <i className="s" style={{ height: `${(studyOf(dd) / max) * 100}%` }} />
                </span>
                <small>{shortDate(dd).replace(/\(.\)/, '').split('/').pop()}</small>
              </div>
            ))}
          </div>
        )}
        <p className="st-muted sm">
          <i className="gs-dot g" /> 게임(Steam) <i className="gs-dot s" /> 공부
        </p>
      </section>

      <section className="st-card">
        <h3 className="st-h">시험 기간 게임 목표</h3>
        <GameLimitEdit />
        {limit && exam && (
          <p className={playOf(today) > limit.min ? 'bad' : ''}>
            {exam.name} D-{diffDays(today, exam.date)} · 오늘 Steam {minutesText(playOf(today))} / 목표 {minutesText(limit.min)} {playOf(today) > limit.min ? '— 넘었어요!' : '✓'}
          </p>
        )}
        {limit && !exam && (
          <p className="st-muted sm">
            시험 {limit.examDays}일 전부터 하루 {minutesText(limit.min)}까지로 봐요. 지금은 시험 기간이 아니에요.
          </p>
        )}
      </section>

      {pick && (
        <section className="st-card gm-pick">
          <SteamImg appid={pick.appid} icon={pick.icon} />
          <div>
            <small className="st-muted">이번 주 해 볼 게임 (가졌는데 한 번도 안 한 것)</small>
            <b>{pick.name}</b>
            <a className="st-link" href={`steam://run/${pick.appid}`}>
              Steam 에서 열기
            </a>
          </div>
        </section>
      )}

      {alertOn !== null && (
        <label className="st-toggle">
          <input
            type="checkbox"
            checked={alertOn}
            onChange={async (e) => {
              const r = await steamWatchSet(sid, e.target.checked).catch(() => null);
              if (r) setAlertOn(r.on);
              toast(r?.on ? '찜한 게임이 할인하면 알려 드려요 (6시간마다 확인, 설정 › 알림이 켜져 있어야 해요)' : '찜 할인 알림을 껐어요');
            }}
          />{' '}
          찜한 게임이 할인을 시작하면 알림
        </label>
      )}
    </>
  );
}

function GameLimitEdit() {
  const d = useStudy();
  const l = d.settings.gameLimit;
  const [min, setMin] = useState(String(l?.min ?? 60));
  const [days, setDays] = useState(String(l?.examDays ?? 14));
  return (
    <div className="st-inline wrap">
      시험
      <input className="st-input xs" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="시험 며칠 전부터" />
      일 전부터 하루
      <input className="st-input xs" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="하루 게임 분" />
      분까지
      <button className="btn btn-sm" onClick={() => (setSettings({ gameLimit: Number(min) > 0 && Number(days) > 0 ? { min: Number(min), examDays: Number(days) } : undefined }), toast('정했어요'))}>
        {l ? '바꾸기' : '정하기'}
      </button>
      {l && (
        <button className="st-link" onClick={() => setSettings({ gameLimit: undefined })}>
          끄기
        </button>
      )}
    </div>
  );
}

/** 게임 › 위시리스트: 사고 싶은 게임 · 음반 · Steam 찜을 한곳에 (한국 값 · 모으기) */
export function WishPage() {
  const d = useStudy();
  const sid = d.settings.steamId ?? '';
  const games = alive(d.games).filter((g) => g.status === 'want');
  const records = alive(d.records).filter((r) => r.status === 'want');
  const [wish, setWish] = useState<{ appid: number; added: number }[]>([]);
  useEffect(() => {
    if (!sid || !isLoggedIn()) return;
    steamMe(sid)
      .then((r) => setWish(r.wish))
      .catch(() => {});
  }, [sid]);
  const steamIds = [...new Set([...games.map((g) => g.steamAppId).filter((x): x is number => !!x), ...wish.map((w) => w.appid)])];
  const prices = useSteamPrices(steamIds.slice(0, 100));
  const names = useSteamNames(
    wish
      .map((w) => w.appid)
      .filter((id) => !games.some((g) => g.steamAppId === id))
      .slice(0, 100),
  );
  const steamOnly = wish.filter((w) => !games.some((g) => g.steamAppId === w.appid));
  const total = [...games.map((g) => (g.steamAppId ? (prices[g.steamAppId]?.final ?? 0) : 0)), ...steamOnly.map((w) => prices[w.appid]?.final ?? 0), ...records.map((r) => r.price ?? 0)].reduce((a, b) => a + b, 0);
  const onSale = steamIds.filter((id) => (prices[id]?.discount ?? 0) > 0).length;
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>위시리스트</h2>
      </div>
      <div className="mv-summary">
        <span>
          게임 <b>{games.length + steamOnly.length}</b>
        </span>
        <span>
          음반 <b>{records.length}</b>
        </span>
        {total > 0 && (
          <span>
            모두 <b>{won(total)}</b>
          </span>
        )}
        {onSale > 0 && (
          <span>
            할인 중 <b>{onSale}</b>
          </span>
        )}
      </div>
      {!games.length && !records.length && !steamOnly.length && (
        <Empty title="사고 싶은 것이 아직 없어요">
          <p>게임 › Steam 에서 찾아 「하고 싶어요」를 누르거나, 음악에서 「사고 싶어요」를 넣으면 여기에 모여요. Steam 찜 목록도 같이 보여요.</p>
        </Empty>
      )}
      {(games.length > 0 || steamOnly.length > 0) && (
        <section className="st-card">
          <h3 className="st-h">게임</h3>
          {[...games.map((g) => ({ key: g.id, appid: g.steamAppId, name: g.title, g })), ...steamOnly.map((w) => ({ key: `w${w.appid}`, appid: w.appid as number | undefined, name: names[w.appid] ?? `Steam ${w.appid}`, g: undefined as Game | undefined }))]
            .sort((a, b) => (b.appid ? (prices[b.appid]?.discount ?? 0) : 0) - (a.appid ? (prices[a.appid]?.discount ?? 0) : 0))
            .map((x) => (
              <div key={x.key} className="gm-row">
                {x.appid ? <SteamImg appid={x.appid} /> : <span className="dg-noimg" />}
                <span>
                  {x.name} {!x.g && <small className="st-muted">· Steam 찜</small>}
                  {x.appid && <PriceLine appid={x.appid} p={prices[x.appid]} watch={x.g?.watchWon} />}
                  {x.g && <WishGoal name={x.g.title} />}
                </span>
              </div>
            ))}
        </section>
      )}
      {records.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">음반</h3>
          {records.map((r) => (
            <div key={r.id} className="gm-row">
              {r.cover ? <img className="lp-cover" src={r.cover} alt="" loading="lazy" /> : <span className="dg-noimg" />}
              <span>
                {r.title} <small className="st-muted">{r.artist}</small>
                <WishGoal name={r.title} />
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
