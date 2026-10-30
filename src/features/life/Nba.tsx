// 취미 · 농구 · NBA (balldontlie, 서버를 거쳐 받는다)
// - 경기: 하루 경기(미국 날짜, 시작 시각은 한국 시간). 경기 중이면 1분마다 새로. 누르면 그 경기 선수 기록
// - 순위: 동부 · 서부
// - 경기 선수 기록에서 선수를 누르면 그 선수 시즌 평균
// 응원팀(★)은 경기 화면에서 정하고, 그 팀 경기가 맨 위에 온다
import { useEffect, useState } from 'react';
import { ApiError, isLoggedIn, nbaAvg, nbaBox, nbaCareer, nbaGames, nbaRoster, nbaStandings, type NbaAverage, type NbaCareerRow, type NbaRosterPlayer, type NbaGame, type NbaLine, type NbaStanding, type NbaTeam } from '../auth/api';
import { addDays, longDate } from '../study/dates';
import { go, Sheet, toast } from '../study/ui';
import { NBA_TEAMS, nbaLogo } from './nbaLogo';

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
  const tab = sub === 'standings' ? 'standings' : sub?.startsWith('game-') ? 'game' : sub === 'roster' || sub?.startsWith('roster-') ? 'roster' : 'games';
  return (
    <div className="st-page narrow">
      {tab !== 'game' && (
        <div className="st-page-head">
          <h2>NBA</h2>
          <div className="st-seg sm">
            <button className={tab === 'games' ? 'on' : ''} onClick={() => go('/basketball/nba')}>
              경기
            </button>
            <button className={tab === 'standings' ? 'on' : ''} onClick={() => go('/basketball/nba/standings')}>
              순위
            </button>
            <button className={tab === 'roster' ? 'on' : ''} onClick={() => go('/basketball/nba/roster')}>
              로스터
            </button>
          </div>
        </div>
      )}
      {!isLoggedIn() ? <p className="st-muted">NBA 는 로그인한 뒤에 볼 수 있어요.</p> : tab === 'standings' ? <Standings /> : tab === 'game' ? <GamePage id={Number(sub!.slice(5))} /> : tab === 'roster' ? <Roster team={sub?.startsWith('roster-') ? sub.slice(7) : undefined} /> : <Games />}
    </div>
  );
}

function Games() {
  const [date, setDate] = useState(usToday);
  const [games, setGames] = useState<NbaGame[] | null>(null);
  const [err, setErr] = useState('');
  const fav = readFav();
  const today = usToday();
  const anyLive = !!games?.some(isLive);

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
        {longDate(date)} · 미국 날짜 (한국은 다음 날 오전){anyLive && <span className="nba-livechip"> · ● 경기 중</span>}
      </p>
      {err && <p className="st-muted">{err}</p>}
      {!err && games === null && <p className="st-muted">경기를 받는 중…</p>}
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
  if (!data) return <p className="st-muted">순위를 받는 중…</p>;
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
        {data.from === 'games' ? ' · 끝난 경기 결과로 센 순위예요' : data.from === 'nba' ? ' · NBA 공식 순위' : ''}
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
  const [src, setSrc] = useState<'nba' | 'bdl'>('bdl');
  useEffect(() => {
    let live = true;
    nbaBox({ id, date: g?.date ?? '', home: g?.home.abbr ?? '', away: g?.away.abbr ?? '', final: !!g && isFinal(g) })
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
      {!err && lines === null && <p className="st-muted">선수 기록을 받는 중…</p>}
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
      {player && <PlayerSheet who={{ id: player.playerId, name: player.name, team: player.team, pos: player.pos, src }} season={season} onClose={() => setPlayer(null)} />}
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
  const [data, setData] = useState<{ season: number; players: NbaRosterPlayer[] } | null>(null);
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
      {!err && !data && <p className="st-muted">로스터를 받는 중…</p>}
      {data && (
        <section className="st-card">
          <div className="nba-scroll">
            <table className="nba-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="l">선수</th>
                  <th className="l">포지션</th>
                  <th>키</th>
                  <th>몸무게</th>
                  <th>나이</th>
                  <th>경력</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.id}>
                    <td>{p.num}</td>
                    <td className="l">
                      <button className="st-link" onClick={() => setWho({ id: p.id, name: p.name, team, pos: p.pos, src: 'nba' })}>
                        {p.name}
                      </button>
                    </td>
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
