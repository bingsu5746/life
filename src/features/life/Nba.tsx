// 취미 · 농구 · NBA: 하루 경기 (balldontlie, 서버를 거쳐 받는다). 날짜는 미국 날짜, 시작 시각은 한국 시간으로.
// 경기 중인 게 있으면 1분마다 새로 받는다. 팀을 누르면 응원팀(★)이 되어 그 팀 경기가 맨 위에
import { useEffect, useState } from 'react';
import { ApiError, isLoggedIn, nbaGames, type NbaGame, type NbaTeam } from '../auth/api';
import { addDays, longDate } from '../study/dates';
import { toast } from '../study/ui';

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

function Team({ t, score, win, played, fav, onFav }: { t: NbaTeam; score: number; win: boolean; played: boolean; fav: boolean; onFav: () => void }) {
  return (
    <button className={`nba-team ${win ? 'win' : ''}`} onClick={onFav} aria-label={`${t.city} ${t.name}${fav ? ' (응원팀)' : ''} · 눌러서 응원팀`}>
      <span className="nba-badge">{t.abbr || '?'}</span>
      <span className="nba-name">
        {fav && <i aria-hidden>★</i>}
        <small>{t.city}</small>
        <b>{t.name}</b>
      </span>
      {played && <span className="nba-score">{score}</span>}
    </button>
  );
}

export function NbaPage({ sub }: { sub?: string }) {
  void sub;
  const [date, setDate] = useState(usToday);
  const [games, setGames] = useState<NbaGame[] | null>(null);
  const [err, setErr] = useState('');
  const [fav, setFav] = useState<string>(() => {
    try {
      return localStorage.getItem(FAV_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const today = usToday();
  const anyLive = !!games?.some(isLive);

  const [tick, setTick] = useState(0);
  // 날짜가 바뀌면 처음부터, tick 이 바뀌면(경기 중 1분마다) 그대로 둔 채 새로
  useEffect(() => {
    if (!isLoggedIn()) {
      setErr('NBA 경기는 로그인한 뒤에 볼 수 있어요.');
      return;
    }
    let live = true;
    nbaGames(date)
      .then((r) => {
        if (!live) return;
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
  const sorted = (games ?? []).slice().sort((a, b) => Number(b.home.abbr === fav || b.away.abbr === fav) - Number(a.home.abbr === fav || a.away.abbr === fav) || Number(isLive(b)) - Number(isLive(a)) || (a.start ?? '').localeCompare(b.start ?? ''));

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>NBA</h2>
        {anyLive && <span className="nba-livechip">● 경기 중</span>}
      </div>
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
      <p className="st-muted sm nba-date">{longDate(date)} · 미국 날짜 (한국은 다음 날 오전)</p>
      {err && <p className="st-muted">{err}</p>}
      {!err && games === null && <p className="st-muted">경기를 받는 중…</p>}
      {!err && games?.length === 0 && <p className="st-muted">이날은 경기가 없어요.</p>}
      <div className="nba-list">
        {sorted.map((g) => {
          const st = statusText(g);
          const played = isFinal(g) || isLive(g);
          const favGame = !!fav && (g.home.abbr === fav || g.away.abbr === fav);
          return (
            <section key={g.id} className={`nba-card ${favGame ? 'fav' : ''} ${st.live ? 'live' : ''}`}>
              <div className={`nba-status ${st.live ? 'live' : ''}`}>
                {st.live && <i aria-hidden />}
                {st.text}
              </div>
              <Team t={g.away} score={g.awayScore} played={played} win={isFinal(g) && g.awayScore > g.homeScore} fav={fav === g.away.abbr} onFav={() => toggleFav(g.away.abbr)} />
              <Team t={g.home} score={g.homeScore} played={played} win={isFinal(g) && g.homeScore > g.awayScore} fav={fav === g.home.abbr} onFav={() => toggleFav(g.home.abbr)} />
            </section>
          );
        })}
      </div>
      {!!games?.length && <p className="st-muted sm">위가 원정, 아래가 홈팀이에요. 팀을 누르면 응원팀(★)이 되어 그 팀 경기가 맨 위에 와요.</p>}
    </div>
  );
}
