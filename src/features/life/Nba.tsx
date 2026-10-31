// 취미 · 농구 · NBA (balldontlie, 서버를 거쳐 받는다)
// - 경기: 하루 경기(미국 날짜, 시작 시각은 한국 시간). 경기 중이면 1분마다 새로. 누르면 그 경기 선수 기록
// - 순위: 동부 · 서부
// - 경기 선수 기록에서 선수를 누르면 그 선수 시즌 평균
// 응원팀(★)은 경기 화면에서 정하고, 그 팀 경기가 맨 위에 온다
import { useEffect, useState } from 'react';
import {
  ApiError,
  hlPlayer,
  type HlSeason,
  isLoggedIn,
  nba2k,
  type Nba2kPlayer,
  nbaAvg,
  nbaBox,
  nbaCareer,
  nbaGames,
  nbaPlayers,
  nbaRoster,
  nbaStandings,
  type NbaPlayerRow,
  type NbaAverage,
  type NbaCareerRow,
  type NbaRosterPlayer,
  type NbaGame,
  type NbaLine,
  type NbaStanding,
  type NbaTeam,
  nbaFavGet,
  nbaFavSet,
} from '../auth/api';
import { addDays, longDate } from '../study/dates';
import { go, Sheet, toast } from '../study/ui';
import { NBA_TEAMS, nbaFace, nbaLogo } from './nbaLogo';
import { NBA_IDS } from './nbaIds';

const FAV_KEY = 'my-study.nba.fav';
/** 미국 동부 기준 오늘 (한국보다 13~14시간 늦다: 한국 아침이면 미국은 전날 밤) */
const usToday = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

const isFinal = (g: NbaGame) => /final/i.test(g.status);
const isLive = (g: NbaGame) => !isFinal(g) && g.period > 0;
const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });

function statusText(g: NbaGame): { text: string; live?: boolean } {
  if (isFinal(g)) return { text: '경기 끝' };
  if (isLive(g)) {
    const q = g.period <= 4 ? `${g.period}쿼터` : `연장 ${g.period - 4}`;
    return { text: /half/i.test(g.status) ? '하프타임' : `${q}${g.time && !/final/i.test(g.time) ? ` ${g.time}` : ''}`, live: true };
  }
  if (g.start) return { text: `${kst(g.start)} 시작` };
  return { text: g.status || '경기 전' };
}

/** 팀 로고 (못 받으면 약자) */
function Logo({ abbr, size = 40 }: { abbr: string; size?: number }) {
  const [bad, setBad] = useState(false);
  const src = nbaLogo(abbr);
  return (
    <span className="nba-badge" style={{ width: size, height: size }}>
      {src && !bad ? <img src={src} alt={abbr} loading="lazy" onError={() => setBad(true)} /> : abbr || '?'}
    </span>
  );
}

function Team({ t, score, win, played, fav }: { t: NbaTeam; score: number; win: boolean; played: boolean; fav: boolean }) {
  return (
    <div className={`nba-team ${win ? 'win' : ''}`}>
      <Logo abbr={t.abbr} />
      <span className="nba-name">
        <small>
          {fav && <i aria-hidden>★ </i>}
          {t.city}
        </small>
        <b>{t.name}</b>
      </span>
      {played && <span className="nba-score">{score}</span>}
    </div>
  );
}

const readFav = () => {
  try {
    return localStorage.getItem(FAV_KEY) ?? '';
  } catch {
    return '';
  }
};
/** 받은 경기 (경기 화면에서 위쪽 머리에 씀) */
const seen = new Map<number, NbaGame>();
const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0);

export function NbaPage({ sub }: { sub?: string }) {
  // 경기 · 순위 · 로스터 · 선수 는 왼쪽(폰은 아래) 메뉴에서 고른다 (tabs.ts NBA_ITEMS)
  const tab = sub === 'standings' ? 'standings' : sub?.startsWith('game-') ? 'game' : sub === 'roster' || sub?.startsWith('roster-') ? 'roster' : sub === 'players' ? 'players' : 'games';
  const title = { games: 'NBA 경기', standings: 'NBA 순위', roster: 'NBA 로스터', players: 'NBA 선수', game: '' }[tab];
  return (
    <div className={`st-page ${tab === 'players' ? '' : 'narrow'}`}>
      {title && (
        <div className="st-page-head">
          <h2>{title}</h2>
        </div>
      )}
      {!isLoggedIn() ? (
        <p className="st-muted">NBA 는 로그인한 뒤에 볼 수 있어요.</p>
      ) : tab === 'standings' ? (
        <Standings />
      ) : tab === 'game' ? (
        <GamePage id={Number(sub!.slice(5))} />
      ) : tab === 'roster' ? (
        <Roster team={sub?.startsWith('roster-') ? sub.slice(7) : undefined} />
      ) : tab === 'players' ? (
        <Players />
      ) : (
        <Games />
      )}
    </div>
  );
}

/** 선수 얼굴 (NBA 공식 이미지, 우리 서버를 거쳐). 번호가 없거나 사진이 없으면 사람 모양 */
/** 선수 얼굴: NBA 번호가 있으면 그걸로, 없으면(2K · balldontlie · Highlightly 에서 온 선수) 이름으로 NBA 번호를 찾아서 */
function Face({ id, name, size = 36 }: { id?: number; name?: string; size?: number }) {
  const [bad, setBad] = useState(false);
  const pid = id || (name ? NBA_IDS[normName(name)] : undefined);
  return (
    <span className="nba-face" style={{ width: size, height: size }}>
      {pid && !bad ? (
        <img src={nbaFace(pid)} alt="" loading="lazy" onError={() => setBad(true)} />
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="9" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      )}
    </span>
  );
}

// ===== NBA 2K 능력치 (한 번 받아 두고 이름으로 맞춘다) =====
const normName = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z]/g, '');
let twoKPromise: Promise<Map<string, Nba2kPlayer>> | null = null;
function load2k() {
  twoKPromise ??= nba2k()
    .then((r) => new Map(r.players.map((p) => [normName(p.name), p])))
    .catch((e) => {
      twoKPromise = null;
      throw e;
    });
  return twoKPromise;
}
function use2k(): Map<string, Nba2kPlayer> | null {
  const [m, setM] = useState<Map<string, Nba2kPlayer> | null>(null);
  useEffect(() => {
    let live = true;
    load2k()
      .then((x) => live && setM(x))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return m;
}
/** 2K 능력치 이름 → 한국어 (모르는 이름은 그대로) */
const ATTR_KO: Record<string, string> = {
  closeShot: '근거리 슛',
  midRangeShot: '미드레인지',
  threePointShot: '3점 슛',
  freeThrow: '자유투',
  shotIQ: '슛 IQ',
  offensiveConsistency: '공격 일관성',
  drivingLayup: '드라이빙 레이업',
  standingDunk: '스탠딩 덩크',
  drivingDunk: '드라이빙 덩크',
  postHook: '포스트 훅',
  postFade: '포스트 페이드',
  postControl: '포스트 컨트롤',
  drawFoul: '파울 유도',
  hands: '핸즈',
  passAccuracy: '패스 정확도',
  ballHandle: '볼 핸들링',
  speedWithBall: '볼 가진 스피드',
  passIQ: '패스 IQ',
  passVision: '패스 시야',
  interiorDefense: '내곽 수비',
  perimeterDefense: '외곽 수비',
  steal: '스틸',
  block: '블록',
  helpDefenseIQ: '도움 수비 IQ',
  passPerception: '패스 예측',
  defensiveConsistency: '수비 일관성',
  offensiveRebound: '공격 리바운드',
  defensiveRebound: '수비 리바운드',
  speed: '스피드',
  agility: '민첩성',
  strength: '힘',
  vertical: '점프력',
  stamina: '체력',
  hustle: '허슬',
  durability: '내구성',
};
const attrName = (k: string) => ATTR_KO[k] ?? k;
const ORDER = Object.keys(ATTR_KO);

function Games() {
  const [date, setDate] = useState(usToday);
  const [games, setGames] = useState<NbaGame[] | null>(null);
  const [err, setErr] = useState('');
  const fav = readFav();
  const today = usToday();
  const anyLive = !!games?.some(isLive);
  const [alert, setAlert] = useState<{ team: string; subs: number } | null>(null);
  useEffect(() => {
    if (!fav) return;
    nbaFavGet()
      .then(setAlert)
      .catch(() => {});
  }, [fav]);
  const toggleAlert = async () => {
    try {
      const r = await nbaFavSet(alert?.team ? '' : fav);
      setAlert(r);
      toast(r.team ? `${fav} 경기가 시작하고 끝나면 알려 드려요${r.subs ? '' : ' (설정 › 알림을 먼저 켜야 받을 수 있어요)'}` : '응원팀 경기 알림을 껐어요');
    } catch (e) {
      toast(e instanceof Error ? e.message : '바꾸지 못했어요');
    }
  };

  const [tick, setTick] = useState(0);
  // 날짜가 바뀌면 처음부터, tick 이 바뀌면(경기 중 1분마다) 그대로 둔 채 새로
  useEffect(() => {
    let live = true;
    nbaGames(date)
      .then((r) => {
        if (!live) return;
        for (const g of r.games) seen.set(g.id, g);
        setGames(r.games);
        setErr('');
      })
      .catch((e) => live && setErr(e instanceof ApiError || e instanceof Error ? e.message : '경기를 받지 못했어요'));
    return () => {
      live = false;
    };
  }, [date, tick]);
  useEffect(() => setGames(null), [date]);
  // 경기 중이면 1분마다 (화면이 보일 때만)
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => document.visibilityState === 'visible' && setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, [anyLive]);

  const sorted = (games ?? []).slice().sort((a, b) => Number(b.home.abbr === fav || b.away.abbr === fav) - Number(a.home.abbr === fav || a.away.abbr === fav) || Number(isLive(b)) - Number(isLive(a)) || (a.start ?? '').localeCompare(b.start ?? ''));

  return (
    <>
      {fav && alert && (
        <label className="st-toggle nba-alert">
          <input type="checkbox" checked={!!alert.team} onChange={() => void toggleAlert()} />
          <span>
            <b>★ {fav} 경기 알림</b>
            <small className="st-muted"> 경기가 시작할 때와 끝날 때(점수) 알려 줘요{alert.team && !alert.subs ? ' · 설정 › 알림을 켜야 받을 수 있어요' : ''}</small>
          </span>
        </label>
      )}
      <div className="nba-days">
        <button className="btn btn-sm" aria-label="전날" onClick={() => setDate(addDays(date, -1))}>
          ‹
        </button>
        {[-1, 0, 1].map((k) => {
          const d = addDays(today, k);
          return (
            <button key={k} className={`nba-day ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>
              {k === -1 ? '어제' : k === 0 ? '오늘' : '내일'}
            </button>
          );
        })}
        <button className="btn btn-sm" aria-label="다음 날" onClick={() => setDate(addDays(date, 1))}>
          ›
        </button>
      </div>
      <p className="st-muted sm nba-date">
        {longDate(date)} · 미국 날짜 (한국은 다음 날 오전)
        {anyLive && <span className="nba-livechip"> · ● 경기 중</span>}
      </p>
      {err && <p className="st-muted">{err}</p>}
      {!err && games === null && <Loading what="경기" />}
      {!err && games?.length === 0 && <p className="st-muted">이날은 경기가 없어요.</p>}
      <div className="nba-list">
        {sorted.map((g) => {
          const st = statusText(g);
          const played = isFinal(g) || isLive(g);
          const favGame = !!fav && (g.home.abbr === fav || g.away.abbr === fav);
          return (
            <button key={g.id} className={`nba-card ${favGame ? 'fav' : ''} ${st.live ? 'live' : ''}`} onClick={() => go(`/basketball/nba/game-${g.id}`)}>
              <div className={`nba-status ${st.live ? 'live' : ''}`}>
                {st.live && <i aria-hidden />}
                {st.text}
              </div>
              <Team t={g.away} score={g.awayScore} played={played} win={isFinal(g) && g.awayScore > g.homeScore} fav={fav === g.away.abbr} />
              <Team t={g.home} score={g.homeScore} played={played} win={isFinal(g) && g.homeScore > g.awayScore} fav={fav === g.home.abbr} />
            </button>
          );
        })}
      </div>
      {!!games?.length && <p className="st-muted sm">위가 원정, 아래가 홈팀이에요. 경기를 누르면 선수 기록이 나와요.</p>}
    </>
  );
}

/** 「받는 중」: 오래 걸리면 몇 초째인지와 다시 받기(새로고침)를 보여 준다. 앱 버전도 같이 (옛 버전이 남아 있는지 알 수 있게) */
function Loading({ what }: { what: string }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSec((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const ver = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src.match(/index-([\w-]+)\.js/)?.[1] ?? '개발';
  return (
    <p className="st-muted">
      {what} 받는 중… {sec >= 5 && `${sec}초`}
      {sec >= 15 && (
        <>
          {' '}
          · 오래 걸려요{' '}
          <button className="st-link" onClick={() => location.reload()}>
            다시 받기
          </button>{' '}
          <small>(앱 {ver})</small>
        </>
      )}
    </p>
  );
}

/** 동부 · 서부 순위 */
function Standings() {
  const [data, setData] = useState<Awaited<ReturnType<typeof nbaStandings>> | null>(null);
  const [err, setErr] = useState('');
  const fav = readFav();
  useEffect(() => {
    let live = true;
    nbaStandings()
      .then((r) => live && setData(r))
      .catch((e) => live && setErr(e instanceof Error ? e.message : '순위를 받지 못했어요'));
    return () => {
      live = false;
    };
  }, []);
  if (err) return <p className="st-muted">{err}</p>;
  if (!data) return <Loading what="순위" />;
  if (!data.rows.length) return <p className="st-muted">{data.building ? '이번 시즌 경기 결과를 모으는 중이에요. 몇 분 뒤 다시 열어 주세요.' : '아직 순위가 없어요.'}</p>;
  const confs = [
    { key: 'East', label: '동부' },
    { key: 'West', label: '서부' },
  ];
  const table = (list: NbaStanding[]) => {
    const sorted = list.slice().sort((a, b) => pct(b.w, b.l) - pct(a.w, a.l) || b.w - a.w);
    const top = sorted[0];
    return (
      <table className="nba-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="l">팀</th>
            <th>승</th>
            <th>패</th>
            <th>승률</th>
            <th>승차</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const gb = top ? (top.w - t.w + (t.l - top.l)) / 2 : 0;
            return (
              <tr key={t.abbr} className={`${t.abbr === fav ? 'fav' : ''} ${i === 5 || i === 9 ? 'cut' : ''}`}>
                <td>{i + 1}</td>
                <td className="l">
                  <button className="nba-trow nba-tlink" onClick={() => go(`/basketball/nba/roster-${t.abbr}`)}>
                    <Logo abbr={t.abbr} size={24} />
                    {t.name}
                  </button>
                </td>
                <td>{t.w}</td>
                <td>{t.l}</td>
                <td>{pct(t.w, t.l).toFixed(3).replace(/^0/, '')}</td>
                <td>{gb ? gb.toFixed(1) : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };
  const known = data.rows.some((r) => r.conf);
  return (
    <>
      {known ? (
        confs.map((c) => (
          <section key={c.key} className="st-card">
            <h3 className="st-h">{c.label}</h3>
            {table(data.rows.filter((r) => r.conf.toLowerCase().startsWith(c.key.toLowerCase())))}
          </section>
        ))
      ) : (
        <section className="st-card">{table(data.rows)}</section>
      )}
      <p className="st-muted sm">
        {data.season}-{String(data.season + 1).slice(2)} 시즌 · 6위까지 플레이오프, 7~10위 플레이인 (굵은 줄)
        {data.from === 'games' ? ' · 끝난 경기 결과로 센 순위예요' : data.from === 'nba' ? ' · NBA 공식 순위' : data.from === 'hl' ? ' · Highlightly 순위' : ''}
        {data.building ? ' · 지금 경기 결과를 더 모으는 중' : ''}
      </p>
    </>
  );
}

/** 한 경기: 점수 · 응원팀 · 두 팀 선수 기록. 선수를 누르면 시즌 평균 */
function GamePage({ id }: { id: number }) {
  const g = seen.get(id);
  const [lines, setLines] = useState<NbaLine[] | null>(null);
  const [err, setErr] = useState('');
  const [fav, setFav] = useState(readFav);
  const [player, setPlayer] = useState<NbaLine | null>(null);
  const [src, setSrc] = useState<'nba' | 'bdl' | 'hl'>('bdl');
  useEffect(() => {
    let live = true;
    nbaBox({ id, date: g?.date ?? '', home: g?.home.abbr ?? '', away: g?.away.abbr ?? '', homeName: g?.home.name ?? '', awayName: g?.away.name ?? '', final: !!g && isFinal(g) })
      .then((r) => {
        if (!live) return;
        setLines(r.lines);
        setSrc(r.src);
      })
      .catch((e) => live && setErr(e instanceof ApiError || e instanceof Error ? e.message : '선수 기록을 받지 못했어요'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const toggleFav = (abbr: string) => {
    const next = fav === abbr ? '' : abbr;
    setFav(next);
    try {
      localStorage.setItem(FAV_KEY, next);
    } catch {
      /* 무시 */
    }
    toast(next ? `${abbr} 을 응원팀으로 정했어요` : '응원팀을 지웠어요');
    // 경기 알림을 켜 뒀으면 새 응원팀으로 바꾼다
    void nbaFavGet()
      .then((r) => (r.team ? nbaFavSet(next) : r))
      .catch(() => {});
  };
  const season = g?.season ?? (g ? (Number(g.date.slice(5, 7)) >= 9 ? Number(g.date.slice(0, 4)) : Number(g.date.slice(0, 4)) - 1) : 0);
  const st = g ? statusText(g) : null;
  const teams = g ? [g.away, g.home] : [...new Set((lines ?? []).map((l) => l.team))].map((abbr) => ({ abbr, name: abbr, city: '' }));
  return (
    <>
      <button className="btn btn-sm nba-back" onClick={() => history.back()} aria-label="경기 목록">
        ‹ 경기
      </button>
      {g && (
        <section className="nba-head">
          {[g.away, g.home].map((t, i) => {
            const sc = i ? g.homeScore : g.awayScore;
            const other = i ? g.awayScore : g.homeScore;
            return (
              <div key={t.abbr} className={`nba-hteam ${i ? 'home' : 'away'} ${isFinal(g) && sc > other ? 'win' : ''}`}>
                <Logo abbr={t.abbr} size={64} />
                <b>{t.name}</b>
                <small>{i ? '홈' : '원정'}</small>
                <button className={`nba-fav ${fav === t.abbr ? 'on' : ''}`} onClick={() => toggleFav(t.abbr)}>
                  {fav === t.abbr ? '★ 응원팀' : '☆ 응원팀'}
                </button>
              </div>
            );
          })}
          <div className="nba-hscore">
            {(isFinal(g) || isLive(g)) && (
              <b>
                {g.awayScore} : {g.homeScore}
              </b>
            )}
            <small className={st?.live ? 'live' : ''}>{st?.text}</small>
          </div>
        </section>
      )}
      {err && <p className="st-muted">{err}</p>}
      {!err && lines === null && <Loading what="선수 기록" />}
      {!err && lines?.length === 0 && <p className="st-muted">아직 선수 기록이 없어요. 경기가 시작되면 나와요.</p>}
      {!!lines?.length &&
        teams.map((t) => {
          const list = lines.filter((l) => l.team === t.abbr).sort((a, b) => minutes(b.min) - minutes(a.min) || b.pts - a.pts);
          if (!list.length) return null;
          return (
            <section key={t.abbr} className="st-card nba-box">
              <h3 className="st-h nba-trow">
                <Logo abbr={t.abbr} size={24} /> {t.name}
              </h3>
              <div className="nba-scroll">
                <table className="nba-table">
                  <thead>
                    <tr>
                      <th className="l">선수</th>
                      <th>분</th>
                      <th>득점</th>
                      <th>리바</th>
                      <th>어시</th>
                      <th>스틸</th>
                      <th>블록</th>
                      <th>야투</th>
                      <th>3점</th>
                      <th>자유투</th>
                      <th>턴오버</th>
                      <th>파울</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((l) => (
                      <tr key={l.playerId} className={minutes(l.min) ? '' : 'dnp'}>
                        <td className="l">
                          <Face id={src === 'nba' ? l.playerId : undefined} name={l.name} size={26} />{' '}
                          <button className="st-link" onClick={() => setPlayer(l)}>
                            {l.name}
                          </button>
                          {l.pos && <small> {l.pos}</small>}
                        </td>
                        <td>{l.min || '-'}</td>
                        <td>
                          <b>{l.pts}</b>
                        </td>
                        <td>{l.reb}</td>
                        <td>{l.ast}</td>
                        <td>{l.stl}</td>
                        <td>{l.blk}</td>
                        <td>
                          {l.fgm}-{l.fga}
                        </td>
                        <td>
                          {l.fg3m}-{l.fg3a}
                        </td>
                        <td>
                          {l.ftm}-{l.fta}
                        </td>
                        <td>{l.tov}</td>
                        <td>{l.pf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      {!!lines?.length && <p className="st-muted sm">선수 이름을 누르면 이번 시즌 평균이 나와요.</p>}
      {player && <PlayerSheet who={{ id: player.playerId, name: player.name, team: player.team, pos: player.pos, src: src === 'nba' ? 'nba' : 'bdl' }} season={season} onClose={() => setPlayer(null)} />}
    </>
  );
}

const minutes = (m: string) => Number(m.split(':')[0]) || 0;

/** 선수 창: 이번 시즌 평균 + 커리어(시즌별). src 'nba' 면 id 가 NBA 공식 번호 */
interface PlayerRef {
  id: number;
  name: string;
  team: string;
  pos: string;
  src: 'nba' | 'bdl';
}
const pctText = (x: number) => (x ? `${(x <= 1 ? x * 100 : x).toFixed(1)}%` : '-');

function PlayerSheet({ who, season, onClose }: { who: PlayerRef; season: number; onClose: () => void }) {
  const [avg, setAvg] = useState<NbaAverage | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [career, setCareer] = useState<NbaCareerRow[] | null>(null);
  const [cErr, setCErr] = useState('');
  useEffect(() => {
    if (!season) return setErr('시즌을 알 수 없어요.');
    let live = true;
    nbaAvg({ id: who.id, name: who.name, season, src: who.src })
      .then((r) => live && setAvg(r.avg))
      .catch((e) => live && setErr(e instanceof Error ? e.message : '시즌 평균을 받지 못했어요'));
    return () => {
      live = false;
    };
  }, [who.id, who.name, who.src, season]);
  const twoK = use2k();
  const k2 = twoK?.get(normName(who.name));
  // 커리어는 NBA 공식 번호가 있어야 한다 (공식 기록에서 온 선수 · 아니면 시즌 평균에서 찾은 번호)
  const nbaId = who.src === 'nba' ? who.id : avg?.id;
  useEffect(() => {
    if (!nbaId) return;
    let live = true;
    nbaCareer(nbaId)
      .then((r) => live && setCareer(r.rows))
      .catch((e) => live && setCErr(e instanceof Error ? e.message : '커리어 기록을 받지 못했어요'));
    return () => {
      live = false;
    };
  }, [nbaId]);
  return (
    <Sheet title={who.name} onClose={onClose}>
      <Face id={who.src === 'nba' ? who.id : avg?.id} name={who.name} size={96} />
      <p className="st-muted sm nba-trow">
        <Logo abbr={who.team} size={22} />
        {who.team}
        {who.pos ? ` · ${who.pos}` : ''} · {season}-{String(season + 1).slice(2)} 시즌 평균
      </p>
      {err && <p className="st-muted">{err}</p>}
      {!err && avg === undefined && <p className="st-muted">받는 중…</p>}
      {!err && avg === null && <p className="st-muted">이번 시즌 기록이 아직 없어요.</p>}
      {avg && (
        <div className="nba-avg">
          {[
            ['경기', String(avg.gp)],
            ['분', avg.min || '-'],
            ['득점', avg.pts.toFixed(1)],
            ['리바운드', avg.reb.toFixed(1)],
            ['어시스트', avg.ast.toFixed(1)],
            ['스틸', avg.stl.toFixed(1)],
            ['블록', avg.blk.toFixed(1)],
            ['턴오버', avg.tov.toFixed(1)],
            ['야투율', pctText(avg.fgPct)],
            ['3점 성공률', pctText(avg.fg3Pct)],
            ['자유투율', pctText(avg.ftPct)],
          ].map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
      {k2 && (
        <>
          <h3 className="st-h nba-career-h">
            NBA 2K 능력치 <span className="nba-ovr">{k2.ovr || '-'}</span>
          </h3>
          <div className="nba-attrs">
            {Object.entries(k2.attrs)
              .sort(([a], [b]) => (ORDER.indexOf(a) + 1 || 999) - (ORDER.indexOf(b) + 1 || 999))
              .map(([k, v]) => (
                <div key={k}>
                  <small>{attrName(k)}</small>
                  <b className={v >= 90 ? 'hi' : v >= 80 ? 'mid' : ''}>{v}</b>
                </div>
              ))}
          </div>
        </>
      )}
      {(err || cErr || (!nbaId && avg !== undefined)) && <HlStats name={who.name} />}
      <h3 className="st-h nba-career-h">커리어 (정규시즌 경기당 평균)</h3>
      {!nbaId && avg !== undefined && <p className="st-muted sm">NBA 공식 기록에서 이 선수를 찾지 못해서 커리어를 볼 수 없어요.</p>}
      {cErr && <p className="st-muted sm">{cErr}</p>}
      {nbaId && !cErr && career === null && <p className="st-muted sm">받는 중…</p>}
      {!!career?.length && (
        <div className="nba-scroll">
          <table className="nba-table">
            <thead>
              <tr>
                <th className="l">시즌</th>
                <th className="l">팀</th>
                <th>경기</th>
                <th>분</th>
                <th>득점</th>
                <th>리바</th>
                <th>어시</th>
                <th>스틸</th>
                <th>블록</th>
                <th>야투</th>
                <th>3점</th>
                <th>자유투</th>
              </tr>
            </thead>
            <tbody>
              {career
                .slice()
                .reverse()
                .map((r, i) => (
                  <tr key={i}>
                    <td className="l">{r.season}</td>
                    <td className="l">{r.team}</td>
                    <td>{r.gp}</td>
                    <td>{r.min.toFixed(1)}</td>
                    <td>
                      <b>{r.pts.toFixed(1)}</b>
                    </td>
                    <td>{r.reb.toFixed(1)}</td>
                    <td>{r.ast.toFixed(1)}</td>
                    <td>{r.stl.toFixed(1)}</td>
                    <td>{r.blk.toFixed(1)}</td>
                    <td>{pctText(r.fgPct)}</td>
                    <td>{pctText(r.fg3Pct)}</td>
                    <td>{pctText(r.ftPct)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}

/** 로스터: 팀 고르기 → 선수 목록 → 선수를 누르면 시즌 평균 · 커리어 */
function Roster({ team }: { team?: string }) {
  const twoK = use2k();
  const [data, setData] = useState<{ season: number; players: NbaRosterPlayer[]; src?: 'nba' | 'bdl' | '2k' } | null>(null);
  const [err, setErr] = useState('');
  const [who, setWho] = useState<PlayerRef | null>(null);
  const fav = readFav();
  useEffect(() => {
    if (!team) return;
    let live = true;
    setData(null);
    setErr('');
    nbaRoster(team)
      .then((r) => live && setData(r))
      .catch((e) => live && setErr(e instanceof Error ? e.message : '로스터를 받지 못했어요'));
    return () => {
      live = false;
    };
  }, [team]);
  if (!team || !NBA_TEAMS[team]) {
    const list = Object.entries(NBA_TEAMS).sort(([a], [b]) => Number(b === fav) - Number(a === fav) || NBA_TEAMS[a].name.localeCompare(NBA_TEAMS[b].name));
    return (
      <div className="nba-teams">
        {list.map(([abbr, t]) => (
          <button key={abbr} className={`nba-tpick ${abbr === fav ? 'fav' : ''}`} onClick={() => go(`/basketball/nba/roster-${abbr}`)}>
            <Logo abbr={abbr} size={44} />
            <small>{t.city}</small>
            <b>{t.name}</b>
          </button>
        ))}
      </div>
    );
  }
  const t = NBA_TEAMS[team];
  return (
    <>
      <div className="nba-rhead">
        <button className="btn btn-sm" onClick={() => go('/basketball/nba/roster')}>
          ‹ 팀
        </button>
        <span className="nba-trow">
          <Logo abbr={team} size={36} />
          <span>
            <small className="st-muted">{t.city}</small> <b>{t.name}</b>
          </span>
        </span>
      </div>
      {err && <p className="st-muted">{err}</p>}
      {!err && !data && <Loading what="로스터" />}
      {data && (
        <section className="st-card">
          <div className="nba-scroll">
            <table className="nba-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="l">선수</th>
                  <th>OVR</th>
                  <th className="l">포지션</th>
                  <th>키</th>
                  <th>몸무게</th>
                  <th>나이</th>
                  <th>경력</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.id || p.name}>
                    <td>{p.num}</td>
                    <td className="l">
                      <span className="nba-trow">
                        <Face id={p.id || undefined} name={p.name} size={30} />
                        <button className="st-link" onClick={() => setWho({ id: p.id, name: p.name, team, pos: p.pos, src: p.id ? 'nba' : 'bdl' })}>
                          {p.name}
                        </button>
                      </span>
                    </td>
                    <td className="nba-ovrc">{twoK?.get(normName(p.name))?.ovr || '-'}</td>
                    <td className="l">{p.pos}</td>
                    <td>{p.height}</td>
                    <td>{p.weight ? `${p.weight}lb` : ''}</td>
                    <td>{p.age || ''}</td>
                    <td>{p.exp === 'R' ? '신인' : p.exp ? `${p.exp}년` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="st-muted sm">
            {data.season}-{String(data.season + 1).slice(2)} 시즌 · 선수를 누르면 시즌 평균과 커리어가 나와요.
          </p>
        </section>
      )}
      {who && data && <PlayerSheet who={who} season={data.season} onClose={() => setWho(null)} />}
    </>
  );
}

/** 선수 찾기: 이름 · 팀 · 최소 경기 수로 거르고, 현실 기록(경기당 평균)으로 정렬. 누르면 시즌 평균 · 커리어 */
const SORTS: { key: keyof NbaPlayerRow; label: string; pct?: boolean }[] = [
  { key: 'pts', label: '득점' },
  { key: 'reb', label: '리바운드' },
  { key: 'ast', label: '어시스트' },
  { key: 'stl', label: '스틸' },
  { key: 'blk', label: '블록' },
  { key: 'fg3m', label: '3점 성공' },
  { key: 'fgPct', label: '야투율', pct: true },
  { key: 'fg3Pct', label: '3점 성공률', pct: true },
  { key: 'ftPct', label: '자유투율', pct: true },
  { key: 'tov', label: '턴오버' },
  { key: 'min', label: '출전 시간' },
  { key: 'age', label: '나이' },
];
function Players() {
  const twoK = use2k();
  const [minOvr, setMinOvr] = useState(0);
  const [data, setData] = useState<{ season: number; players: NbaPlayerRow[]; src?: '2k' } | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [sort, setSort] = useState<string>('pts');
  const [asc, setAsc] = useState(false);
  const [minGp, setMinGp] = useState(0);
  const [who, setWho] = useState<PlayerRef | null>(null);
  const [limit, setLimit] = useState(50);
  useEffect(() => {
    let live = true;
    nbaPlayers()
      .then((r) => {
        if (!live) return;
        setData(r);
        if (r.src === '2k') setSort('2k:ovr');
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : '선수 목록을 받지 못했어요'));
    return () => {
      live = false;
    };
  }, []);
  if (err) return <p className="st-muted">{err}</p>;
  if (!data) return <Loading what="선수 목록" />;
  const only2k = data.src === '2k';
  const realSorts = only2k ? [] : SORTS;
  const maxGp = Math.max(0, ...data.players.map((p) => p.gp));
  const needle = q.trim().toLowerCase();
  const k2 = (p: NbaPlayerRow) => twoK?.get(normName(p.name));
  // 정렬: 현실 기록(키) 또는 2K 능력치('2k:ovr' · '2k:<능력치>'). 2K 에서 못 찾은 선수는 맨 뒤
  const num = (p: NbaPlayerRow, k: string) => {
    if (k.startsWith('2k:')) {
      const x = k2(p);
      const a = k.slice(3);
      return (a === 'ovr' ? x?.ovr : x?.attrs[a]) ?? -1;
    }
    return Number(p[k as keyof NbaPlayerRow]) || 0;
  };
  const list = data.players.filter((p) => (!needle || p.name.toLowerCase().includes(needle)) && (!team || p.team === team) && p.gp >= minGp && (!minOvr || (k2(p)?.ovr ?? 0) >= minOvr)).sort((a, b) => (asc ? num(a, sort) - num(b, sort) : num(b, sort) - num(a, sort)) || a.name.localeCompare(b.name));
  const attrKeys = twoK ? [...new Set([...twoK.values()].flatMap((x) => Object.keys(x.attrs)))].sort((a, b) => (ORDER.indexOf(a) + 1 || 999) - (ORDER.indexOf(b) + 1 || 999)) : [];
  const sort2k = sort.startsWith('2k:') && sort !== '2k:ovr' ? sort.slice(3) : '';
  const shown2k = ['threePointShot', 'midRangeShot', 'passAccuracy'].filter((k) => attrKeys.includes(k) && k !== sort2k);
  return (
    <>
      <div className="nba-filters">
        <input className="st-input" placeholder="선수 이름 (영어)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="st-input" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="팀">
          <option value="">모든 팀</option>
          {Object.entries(NBA_TEAMS)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .map(([abbr, t]) => (
              <option key={abbr} value={abbr}>
                {t.name}
              </option>
            ))}
        </select>
        <select className="st-input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="정렬">
          <optgroup label="현실 기록 (경기당 평균)">
            {realSorts.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label} 순
              </option>
            ))}
          </optgroup>
          {twoK && (
            <optgroup label="NBA 2K 능력치">
              <option value="2k:ovr">OVR 순</option>
              {attrKeys.map((k) => (
                <option key={k} value={`2k:${k}`}>
                  {attrName(k)} 순
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button className="btn btn-sm" onClick={() => setAsc(!asc)} aria-label="정렬 방향">
          {asc ? '낮은 순 ↑' : '높은 순 ↓'}
        </button>
        {twoK && (
          <label className="nba-mingp">
            <small>
              2K OVR {minOvr || '모두'}
              {minOvr ? ' 이상' : ''}
            </small>
            <input type="range" min={0} max={99} value={minOvr} onChange={(e) => setMinOvr(Number(e.target.value))} />
          </label>
        )}
        {!only2k && (
          <label className="nba-mingp">
            <small>최소 {minGp}경기</small>
            <input type="range" min={0} max={maxGp} value={minGp} onChange={(e) => setMinGp(Number(e.target.value))} />
          </label>
        )}
      </div>
      <p className="st-muted sm">{only2k ? `NBA 공식 기록 서버가 지금 답하지 않아 NBA 2K 선수 목록으로 보여 줘요 · ${list.length}명` : `${data.season}-${String(data.season + 1).slice(2)} 시즌 경기당 평균 · ${list.length}명`}</p>
      <section className="st-card">
        <div className="nba-scroll">
          <table className="nba-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="l">선수</th>
                {!only2k && <th>경기</th>}
                {twoK && <th className={sort === '2k:ovr' ? 'on' : ''}>OVR</th>}
                {sort2k && <th className="on">{attrName(sort2k)}</th>}
                {shown2k.map((k) => (
                  <th key={k}>{attrName(k)}</th>
                ))}
                {realSorts.slice(0, 11).map((x) => (
                  <th key={x.key} className={x.key === sort ? 'on' : ''}>
                    {x.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((p, i) => (
                <tr key={p.id || p.name}>
                  <td>{i + 1}</td>
                  <td className="l">
                    <button className="nba-trow nba-tlink" onClick={() => setWho({ id: p.id, name: p.name, team: p.team, pos: '', src: p.id ? 'nba' : 'bdl' })}>
                      <Face id={p.id || undefined} name={p.name} size={30} />
                      <span>
                        <b>{p.name}</b> <small>{p.team}</small>
                      </span>
                    </button>
                  </td>
                  {!only2k && <td>{p.gp}</td>}
                  {twoK && <td className={`nba-ovrc ${sort === '2k:ovr' ? 'on' : ''}`}>{k2(p)?.ovr || '-'}</td>}
                  {sort2k && <td className="on">{k2(p)?.attrs[sort2k] ?? '-'}</td>}
                  {shown2k.map((k) => (
                    <td key={k}>{k2(p)?.attrs[k] ?? '-'}</td>
                  ))}
                  {realSorts.slice(0, 11).map((x) => (
                    <td key={x.key} className={x.key === sort ? 'on' : ''}>
                      {x.pct ? pctText(num(p, x.key)) : x.key === 'min' ? String(p.min) : num(p, x.key).toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length > limit && (
          <button className="btn btn-sm nba-more" onClick={() => setLimit(limit + 50)}>
            더 보기 ({list.length - limit}명 남음)
          </button>
        )}
      </section>
      <p className="st-muted sm">
        선수를 누르면 시즌 평균 · 2K 능력치 · 커리어가 나와요.
        {twoK ? ' 2K 능력치는 nba2kapi.com 것이고, 이름으로 맞추지 못한 선수는 - 로 보여요.' : ''}
      </p>
      {who && <PlayerSheet who={who} season={data.season} onClose={() => setWho(null)} />}
    </>
  );
}

/** NBA 공식 기록이 안 될 때: Highlightly 의 선수 시즌별 기록 (통계 이름은 Highlightly 가 주는 영어 그대로) */
function HlStats({ name }: { name: string }) {
  const [data, setData] = useState<{ id: number; seasons: HlSeason[] } | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(0);
  useEffect(() => {
    let live = true;
    hlPlayer(name)
      .then((r) => live && setData(r.player))
      .catch((e) => live && setErr(e instanceof Error ? e.message : '기록을 받지 못했어요'));
    return () => {
      live = false;
    };
  }, [name]);
  if (err) return <p className="st-muted sm">{err}</p>;
  if (data === undefined) return <p className="st-muted sm">Highlightly 에서 기록을 받는 중…</p>;
  if (!data?.seasons.length) return <p className="st-muted sm">Highlightly 에도 이 선수 기록이 없어요.</p>;
  const cur = data.seasons[open] ?? data.seasons[0];
  const cats = [...new Set(cur.stats.map((x) => x.category || '기타'))];
  return (
    <>
      <h3 className="st-h nba-career-h">시즌 기록 (Highlightly)</h3>
      <div className="nba-days nba-seasons">
        {data.seasons.slice(0, 8).map((x, i) => (
          <button key={`${x.season}-${i}`} className={`nba-day ${i === open ? 'on' : ''}`} onClick={() => setOpen(i)}>
            {x.season - 1}-{String(x.season).slice(2)}
            {x.team ? ` ${x.team}` : ''}
          </button>
        ))}
      </div>
      {cats.map((c) => (
        <div key={c}>
          <p className="st-muted sm">{c}</p>
          <div className="nba-attrs">
            {cur.stats
              .filter((x) => (x.category || '기타') === c)
              .map((x) => (
                <div key={x.name}>
                  <small>{x.name}</small>
                  <b>{Number.isInteger(x.value) ? x.value : x.value.toFixed(1)}</b>
                </div>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
