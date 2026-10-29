// 극장가: 어제 박스오피스 · 앞으로 90일 개봉 예정 (KOBIS) + 영화 목록(1990년~) 받기
import { useEffect, useRef, useState } from 'react';
import { catalogSearch, catalogSync, kobisInfo, type CatalogState, type KobisInfo } from '../auth/api';
import { dday, shortDate } from '../study/dates';
import { alive, type Movie } from '../study/model';
import { useStudy } from '../study/store';
import { FilmRow, norm, useOtt } from './MovieFind';

export function NowShowing({ today, onWatched, onOpen }: { today: string; onWatched: (m: Partial<Movie>) => void; onOpen: (m: Movie) => void }) {
  const d = useStudy();
  const [info, setInfo] = useState<KobisInfo | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let on = true;
    kobisInfo()
      .then((r) => on && setInfo(r))
      .catch((e: Error) => on && setErr(e.message));
    return () => {
      on = false;
    };
  }, []);
  const mine = new Map(alive(d.movies).map((m) => [norm(m.title), m]));
  const yearOf = (open?: string) => (open ? Number(open.slice(0, 4)) || undefined : undefined);
  const ott = useOtt((info?.boxOffice ?? []).map((m) => ({ title: m.title, year: yearOf(m.open) })));
  if (err) return <p className="st-hint bad">{err}</p>;
  if (!info) return <p className="st-muted">영화 정보를 받는 중…</p>;
  return (
    <div className="mv-now">
      {info.errors.length > 0 && <p className="st-hint bad">{info.errors.join(' · ')}</p>}
      {info.boxOffice && info.boxOffice.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">어제 박스오피스</h3>
          {info.boxOffice.map((m) => (
            <FilmRow
              key={m.rank}
              lead={<b className="mv-rank">{m.rank}</b>}
              film={{ title: m.title, year: yearOf(m.open), release: m.open, sub: [m.open && `${shortDate(m.open)} 개봉`, m.audience && `누적 ${m.audience.toLocaleString('ko-KR')}명`].filter(Boolean).join(' · ') }}
              mine={mine.get(norm(m.title))}
              p={ott.of({ title: m.title, year: yearOf(m.open) })}
              onWatched={onWatched}
              onOpen={onOpen}
            />
          ))}
        </section>
      )}
      {info.upcoming && (
        <section className="st-card">
          <h3 className="st-h">개봉 예정 · {info.upcoming.length}편</h3>
          {!info.upcoming.length && <p className="st-hint">찾은 개봉 예정 영화가 없어요.</p>}
          {info.upcoming.map((m) => (
            <FilmRow
              key={m.code}
              lead={
                <small className="st-muted nowrap mv-open">
                  {shortDate(m.open)}
                  <br />
                  {dday(today, m.open)}
                </small>
              }
              film={{ title: m.title, year: yearOf(m.open), release: m.open, sub: [m.genre, m.nation, m.director].filter(Boolean).join(' · '), genre: m.genre, nation: m.nation, director: m.director }}
              mine={mine.get(norm(m.title))}
              onWatched={onWatched}
              onOpen={onOpen}
            />
          ))}
        </section>
      )}
      <p className="st-hint">자료: 영화진흥위원회 영화관입장권통합전산망(KOBIS). 6시간마다 새로 받아요. 넷플릭스·Apple TV 등 OTT 표시는 TMDB(JustWatch) 자료예요.</p>
    </div>
  );
}

/** 1990년부터 개봉한 영화 목록을 서버에 받아 두기 (한 번만, 이어서 하기 가능) */
export function CatalogBar() {
  const [state, setState] = useState<CatalogState | null>(null);
  const [run, setRun] = useState(false);
  const [err, setErr] = useState('');
  const stop = useRef(false);
  useEffect(() => {
    catalogSearch('')
      .then((r) => setState(r.state))
      .catch(() => {});
    return () => {
      stop.current = true;
    };
  }, []);
  async function start() {
    stop.current = false;
    setRun(true);
    setErr('');
    try {
      for (;;) {
        const r = await catalogSync();
        setState(r.state);
        if (r.error) {
          setErr(r.error);
          break;
        }
        if (r.state.done || stop.current) break;
        if (r.busy) await new Promise((res) => setTimeout(res, 1500));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '받지 못했어요');
    } finally {
      setRun(false);
    }
  }
  if (!state) return null;
  const pct = state.done ? 100 : Math.min(99, Math.round(((state.year - 1990) / (new Date().getFullYear() + 2 - 1990)) * 100));
  if (state.done && !run)
    return (
      <p className="st-hint">
        영화 목록 {state.count.toLocaleString('ko-KR')}편 저장됨 ·{' '}
        <button className="st-link" onClick={() => void start()}>
          새 영화 더 받기
        </button>
      </p>
    );
  return (
    <section className="st-card">
      <div className="st-inline between wrap">
        <div>
          <h3 className="st-h">영화 목록 (1990년~, 단편·성인물 포함)</h3>
          <small className="st-muted">{state.count ? `${state.count.toLocaleString('ko-KR')}편 저장됨 · 「영화 넣기」에서 제목을 치면 찾아 줘요` : '아직 안 받았어요'}</small>
        </div>
        {run ? (
          <button className="btn btn-sm" onClick={() => (stop.current = true)}>
            멈추기 · {state.year}년 {pct}%
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => void start()}>
            {state.count ? '이어서 받기' : '영화 목록 받기'}
          </button>
        )}
      </div>
      {err && <p className="st-hint bad">{err}</p>}
    </section>
  );
}
