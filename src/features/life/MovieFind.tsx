// 영화 찾기(제목·감독 + 장르·나라·연도·유형 거르기) · 추천(내 별점 / 오늘 보고 싶은 것) · 넷플릭스·Apple TV 표시
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { catalogSearch, movieProviders, recommendMovies, type CatalogFilm } from '../auth/api';
import { alive, newId, type Movie } from '../study/model';
import { put, useStudy } from '../study/store';
import { tasteMap, unexplored, type TasteRow } from './taste';
import { tap, toast } from '../study/ui';

export const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** TMDB 서비스 이름 → 보여 줄 이름 (나머지 서비스는 안 보임) */
const SERVICES: [RegExp, string][] = [
  [/^netflix$/i, '넷플릭스'],
  [/^apple tv( plus| \+)?$/i, 'Apple TV'],
  [/^disney/i, '디즈니+'],
  [/^wavve$/i, '웨이브'],
  [/^tving$/i, '티빙'],
  [/^coupang/i, '쿠팡플레이'],
  [/^watcha$/i, '왓챠'],
];
const MAIN = new Set(['넷플릭스', 'Apple TV']);
export function serviceNames(p: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const n of p ?? []) {
    const hit = SERVICES.find(([re]) => re.test(n.trim()));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
  }
  return out.sort((a, b) => Number(MAIN.has(b)) - Number(MAIN.has(a)));
}

type Key = { title: string; year?: number };
const keyOf = (k: Key) => `${norm(k.title)}:${k.year ?? ''}`;

/** 목록에 있는 영화들이 어느 OTT 에 있는지 (한 번 받은 건 다시 안 받음) */
export function useOtt(items: Key[]) {
  const [got, setGot] = useState<Map<string, string[] | null>>(new Map());
  const [off, setOff] = useState('');
  const asked = useRef(new Set<string>());
  const sig = items.map(keyOf).join('|');
  useEffect(() => {
    if (off) return;
    const need = items.filter((k) => !asked.current.has(keyOf(k))).slice(0, 36);
    if (!need.length) return;
    need.forEach((k) => asked.current.add(keyOf(k)));
    let on = true;
    (async () => {
      for (let i = 0; i < need.length && on; i += 12) {
        const part = need.slice(i, i + 12);
        try {
          const r = await movieProviders(part);
          if (!on) return;
          setGot((m) => {
            const n = new Map(m);
            part.forEach((k, j) => n.set(keyOf(k), r.providers[j] ?? null));
            return n;
          });
        } catch (e) {
          if (on) setOff(e instanceof Error ? e.message : 'OTT 정보를 받지 못했어요');
          return;
        }
      }
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, off]);
  return { of: (k: Key) => got.get(keyOf(k)), off };
}

export function Badges({ p }: { p: string[] | null | undefined }) {
  const names = serviceNames(p);
  if (!names.length) return null;
  return (
    <span className="mv-ott">
      {names.map((n) => (
        <b key={n} className={MAIN.has(n) ? 'main' : ''}>
          {n}
        </b>
      ))}
    </span>
  );
}

const sub = (f: CatalogFilm) => [f.open.slice(0, 4), f.type && f.type !== '장편' ? f.type : '', f.genre, f.nation, f.director].filter(Boolean).join(' · ');

export interface FilmInfo {
  title: string;
  year?: number;
  release?: string;
  sub?: string;
  genre?: string | null;
  nation?: string | null;
  director?: string | null;
}

/** 영화 한 줄: 누르면 「보고 싶어요 · 봤어요」가 펼쳐진다 (평소엔 단추가 안 보인다). 내 목록에 있으면 상태만 */
export function FilmRow({ film, lead, reason, mine, p, onWatched, onOpen }: { film: FilmInfo; lead?: ReactNode; reason?: string; mine?: Movie; p?: string[] | null; onWatched: (m: Partial<Movie>) => void; onOpen: (m: Movie) => void }) {
  const [open, setOpen] = useState(false);
  const extra = { genre: film.genre ?? undefined, nation: film.nation ?? undefined, director: film.director ?? undefined };
  return (
    <div className={`st-item mv-row ${open ? 'open' : ''}`}>
      {lead}
      <div className="st-item-main st-tap" {...(mine ? {} : tap(() => setOpen(!open)))}>
        <div className="st-item-title">
          {film.title} <Badges p={p} />
        </div>
        {film.sub && <div className="st-item-sub">{film.sub}</div>}
        {reason && <div className="mv-reason">{reason}</div>}
      </div>
      {mine && (
        <button className={`mv-mine ${mine.status}`} onClick={() => onOpen(mine)}>
          {mine.status === 'watched' ? (mine.rating ? `★ ${mine.rating.toFixed(1)}` : '봤어요') : '보고 싶어요 ✓'}
        </button>
      )}
      {open && !mine && (
        <div className="mv-acts">
          <button
            className="st-link"
            onClick={() => {
              put('movies', { id: newId(), title: film.title, year: film.year, status: 'want', release: film.release, ...extra, created: Date.now() } as Movie);
              toast(`「${film.title}」 보고 싶어요에 넣었어요`);
            }}
          >
            보고 싶어요
          </button>
          <button className="st-link" onClick={() => onWatched({ title: film.title, year: film.year, release: film.release, status: 'watched', ...extra })}>
            봤어요 · 별점 남기기
          </button>
        </div>
      )}
    </div>
  );
}

const filmOf = (f: CatalogFilm): FilmInfo => ({ title: f.title, year: Number(f.open.slice(0, 4)) || undefined, release: f.open, sub: sub(f), genre: f.genre, nation: f.nation, director: f.director });

interface Common {
  onWatched: (m: Partial<Movie>) => void;
  onOpen: (m: Movie) => void;
}

export function FindTab({ onWatched, onOpen }: Common) {
  const d = useStudy();
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [nation, setNation] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<'' | '장편' | '단편'>('');
  const [adult, setAdult] = useState(false);
  const [facets, setFacets] = useState<{ genres: string[]; nations: string[] } | null>(null);
  const [items, setItems] = useState<CatalogFilm[]>([]);
  const [more, setMore] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const f = useMemo(() => ({ q: q.trim(), genre, nation, from: Number(from) || 0, to: Number(to) || 0, type, adult }), [q, genre, nation, from, to, type, adult]);
  const active = !!(f.q || f.genre || f.nation || f.from || f.to);
  useEffect(() => {
    let on = true;
    setBusy(true);
    const t = setTimeout(() => {
      catalogSearch({ ...f, facets: !facets })
        .then((r) => {
          if (!on) return;
          setItems(r.items);
          setMore(!!r.more);
          setCount(r.state.count);
          if (r.facets) setFacets(r.facets);
          setErr('');
        })
        .catch((e: Error) => on && setErr(e.message))
        .finally(() => on && setBusy(false));
    }, 250);
    return () => {
      on = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);
  const mine = new Map(alive(d.movies).map((m) => [norm(m.title), m]));
  const ott = useOtt(items.slice(0, 24).map((x) => ({ title: x.title, year: Number(x.open.slice(0, 4)) || undefined })));
  async function loadMore() {
    try {
      const r = await catalogSearch({ ...f, offset: items.length });
      setItems((x) => [...x, ...r.items]);
      setMore(!!r.more);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '');
    }
  }
  const chip = (on: boolean, label: string, click: () => void) => (
    <button key={label} type="button" className={`st-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={click}>
      {label}
    </button>
  );
  return (
    <section className="st-card mv-find">
      <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목 · 감독으로 찾기 (예: 존 윅)" aria-label="영화 찾기" />
      <div className="mv-filters">
        <div className="st-chips" aria-label="유형">
          {chip(type === '', '전체', () => setType(''))}
          {chip(type === '장편', '장편', () => setType('장편'))}
          {chip(type === '단편', '단편', () => setType('단편'))}
          {chip(adult, '성인물 포함', () => setAdult(!adult))}
        </div>
        <div className="st-inline wrap">
          <select className="st-input sm" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="장르">
            <option value="">장르 전체</option>
            {facets?.genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select className="st-input sm" value={nation} onChange={(e) => setNation(e.target.value)} aria-label="나라">
            <option value="">나라 전체</option>
            {facets?.nations.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <input className="st-input xs" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1990" aria-label="몇 년부터" />~
          <input className="st-input xs" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="지금" aria-label="몇 년까지" />
        </div>
      </div>
      {err && <p className="st-hint bad">{err}</p>}
      {count === 0 && <p className="st-hint">영화 목록이 아직 비어 있어요. 「극장가」 탭에서 「영화 목록 받기」를 먼저 해 주세요.</p>}
      {!active && !err && count !== 0 && <p className="st-hint">제목이나 감독을 쓰거나, 장르·나라·연도를 골라 보세요.</p>}
      {active && !busy && !items.length && !err && <p className="st-muted">찾은 영화가 없어요.</p>}
      <div>
        {items.map((x) => (
          <FilmRow key={x.code} film={filmOf(x)} mine={mine.get(norm(x.title))} p={ott.of({ title: x.title, year: Number(x.open.slice(0, 4)) || undefined })} onWatched={onWatched} onOpen={onOpen} />
        ))}
      </div>
      {more && (
        <button className="btn btn-sm" onClick={() => void loadMore()}>
          더 보기
        </button>
      )}
      {ott.off && <p className="st-hint">{ott.off}</p>}
    </section>
  );
}

export function RecTab({ onWatched, onOpen }: Common) {
  const d = useStudy();
  const [wish, setWish] = useState('');
  const [items, setItems] = useState<(CatalogFilm & { reason: string })[] | null>(null);
  const [mode, setMode] = useState<'taste' | 'wish'>('taste');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const all = alive(d.movies);
  const rated = all.filter((m) => m.status === 'watched' && m.rating);
  const mine = new Map(all.map((m) => [norm(m.title), m]));
  const ott = useOtt((items ?? []).slice(0, 24).map((x) => ({ title: x.title, year: Number(x.open.slice(0, 4)) || undefined })));
  async function run(w: string) {
    setBusy(true);
    setErr('');
    const note = (m: Movie) => (m.comment || m.review || '').slice(0, 120) || undefined;
    try {
      const r = await recommendMovies({
        wish: w || undefined,
        liked: rated
          .filter((m) => m.rating! >= 4)
          .sort((a, b) => b.rating! - a.rating!)
          .slice(0, 40)
          .map((m) => ({ title: m.title, rating: m.rating!, note: note(m) })),
        disliked: rated
          .filter((m) => m.rating! <= 2.5)
          .slice(0, 20)
          .map((m) => ({ title: m.title, rating: m.rating!, note: note(m) })),
        seen: all
          .filter((m) => m.status === 'watched')
          .map((m) => m.title)
          .slice(0, 400),
      });
      setItems(r.items);
      if (!r.items.length) setErr('영화 목록에서 확인된 추천이 없었어요. 다시 해 보세요.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '추천을 받지 못했어요');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="st-card mv-find">
      <div className="st-seg">
        <button className={mode === 'taste' ? 'on' : ''} aria-pressed={mode === 'taste'} onClick={() => setMode('taste')}>
          내 별점으로
        </button>
        <button className={mode === 'wish' ? 'on' : ''} aria-pressed={mode === 'wish'} onClick={() => setMode('wish')}>
          지금 보고 싶은 것
        </button>
      </div>
      {mode === 'taste' && (
        <TasteCard
          onExplore={(g) => {
            setMode('wish');
            const w = `평소 잘 안 보던 ${g} 장르 중에서 평이 좋은 입문작`;
            setWish(w);
            void run(w);
          }}
        />
      )}
      {mode === 'taste' ? (
        <div className="st-inline between wrap">
          <small className="st-muted">{rated.length ? `별점을 준 ${rated.length}편의 별점·감상평을 보고 골라요 (4점 이상은 좋아함, 2.5점 이하는 별로)` : '별점을 준 영화가 없어요. 본 영화에 별점을 남겨 보세요.'}</small>
          <button className="btn btn-primary btn-sm" disabled={busy || !rated.length} onClick={() => void run('')}>
            {busy ? '고르는 중…' : '추천받기'}
          </button>
        </div>
      ) : (
        <form
          className="st-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (wish.trim() && !busy) void run(wish.trim());
          }}
        >
          <textarea
            className="st-input"
            rows={3}
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (wish.trim() && !busy) void run(wish.trim());
              }
            }}
            placeholder="오늘 기분이나 보고 싶은 것을 자유롭게 써 보세요. 예: 비 오는 날 혼자 보기 좋은 잔잔한 영화 / 머리 비우고 볼 액션"
            aria-label="보고 싶은 것"
          />
          <div className="st-row end">
            <small className="st-muted">Enter 로 보내기 · 줄바꿈은 Shift+Enter</small>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !wish.trim()}>
              {busy ? '고르는 중…' : '추천받기'}
            </button>
          </div>
        </form>
      )}
      {err && <p className="st-hint bad">{err}</p>}
      {items && items.length > 0 && (
        <div>
          {items.map((x) => (
            <FilmRow key={x.code} film={filmOf(x)} reason={x.reason} mine={mine.get(norm(x.title))} p={ott.of({ title: x.title, year: Number(x.open.slice(0, 4)) || undefined })} onWatched={onWatched} onOpen={onOpen} />
          ))}
        </div>
      )}
      <p className="st-hint">AI 가 고른 제목 중 KOBIS 영화 목록에서 확인된 영화만 보여 줘요. 취향은 추측이라 틀릴 수 있어요.</p>
      {ott.off && <p className="st-hint">{ott.off}</p>}
    </section>
  );
}

/** 내 취향: 별점 준 영화의 장르·나라·감독 · 아직 안 본 장르 */
function TasteCard({ onExplore }: { onExplore: (genre: string) => void }) {
  const d = useStudy();
  const t = tasteMap(d);
  const [all, setAll] = useState<string[]>([]);
  useEffect(() => {
    let on = true;
    catalogSearch({ facets: true })
      .then((r) => on && setAll(r.facets?.genres ?? []))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  if (!t.rated) return null;
  const rows = (title: string, list: TasteRow[]) =>
    list.length > 0 && (
      <div className="tm-group">
        <small className="aw-label">{title}</small>
        {list.slice(0, 5).map((r) => (
          <div key={r.name} className="tm-row">
            <span>{r.name}</span>
            <i style={{ width: `${Math.min(100, (r.count / list[0].count) * 100)}%` }} />
            <small>
              {r.count}편 · ★ {r.avg}
            </small>
          </div>
        ))}
      </div>
    );
  const fresh = unexplored(all, t.genres).slice(0, 8);
  return (
    <details className="tm" open>
      <summary>내 취향 지도</summary>
      {t.withInfo === 0 ? (
        <p className="st-hint">장르·감독 정보는 「찾기」나 「극장가」에서 골라 담은 영화에만 있어요.</p>
      ) : (
        <>
          {rows('장르', t.genres)}
          {rows('나라', t.nations)}
          {rows('감독', t.directors.filter((x) => x.count > 1 || t.directors.length < 6))}
        </>
      )}
      {fresh.length > 0 && (
        <div className="tm-group">
          <small className="aw-label">아직 안 본 장르 · 누르면 추천</small>
          <div className="st-chips">
            {fresh.map((g) => (
              <button key={g} className="st-chip" onClick={() => onExplore(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
      )}
    </details>
  );
}
