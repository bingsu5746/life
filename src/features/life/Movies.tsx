// 영화: 극장가 · 내 영화(본 영화 · 보고 싶어요 · 시상식) · 찾기 · 추천
import { useState } from 'react';
import { Badges, FindTab, RecTab, useOtt } from './MovieFind';
import { AwardsView } from './Awards';
import { CatalogBar, NowShowing } from './MovieNow';
import { MovieSheet, MovieView, starText } from './MovieParts';
import { BarChart } from '../study/charts';
import { dday, shortDate } from '../study/dates';
import { alive, newId, type Movie } from '../study/model';
import { putMany, useStudy } from '../study/store';
import { Empty, go, Icon, tap, toast, useToday } from '../study/ui';

export { starText };

type Tab = 'now' | 'mine' | 'find' | 'rec';
type Mine = 'watched' | 'want' | 'awards';

/** sub: 없으면 극장가, 'watched'·'want'·'awards' 내 영화, 'find' 찾기, 'rec' 추천, 'new' 넣기 창 */
export function Movies({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const mineSub: Mine | null = sub === 'watched' || sub === 'want' || sub === 'awards' ? sub : null;
  const tab: Tab = mineSub ? 'mine' : sub === 'find' ? 'find' : sub === 'rec' ? 'rec' : 'now';
  const [sort, setSort] = useState<'recent' | 'rating'>('recent');
  const [tag, setTag] = useState('');
  const [edit, setEdit] = useState<Partial<Movie> | null>(sub === 'new' ? {} : null);
  const [view, setView] = useState<string | null>(null);
  const all = alive(d.movies);
  const watched = all.filter((m) => m.status === 'watched').sort((a, b) => (sort === 'rating' ? (b.rating ?? 0) - (a.rating ?? 0) : 0) || (b.watched ?? '').localeCompare(a.watched ?? '') || b.created - a.created);
  const shown = tag ? watched.filter((m) => m.tags?.includes(tag)) : watched;
  const want = all.filter((m) => m.status === 'want').sort((a, b) => (a.release ?? '9999').localeCompare(b.release ?? '9999') || b.created - a.created);
  const rated = watched.filter((m) => m.rating);
  const avg = rated.length ? Math.round((rated.reduce((a, m) => a + m.rating!, 0) / rated.length) * 10) / 10 : null;
  const year = today.slice(0, 4);
  const dist = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((r) => ({ label: String(r), value: rated.filter((m) => m.rating === r).length }));
  const tagCount = new Map<string, number>();
  for (const m of watched) for (const t of m.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const wantOtt = useOtt(mineSub === 'want' ? want.slice(0, 24).map((m) => ({ title: m.title, year: m.year })) : []);
  const oldWishes = alive(d.wishes).filter((w) => w.kind === 'movie');
  const viewing = view ? d.movies[view] : undefined;
  const open = (m: Movie) => (m.status === 'watched' ? setView(m.id) : setEdit(m));
  const close = () => {
    setEdit(null);
    if (sub === 'new') go('/movies');
  };
  const t = (k: string, label: string, on: boolean) => (
    <button role="tab" aria-selected={on} className={on ? 'on' : ''} onClick={() => go(k ? `/movies/${k}` : '/movies')}>
      {label}
    </button>
  );
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>영화</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit({})} aria-label="영화 넣기">
          <Icon name="plus" />
        </button>
      </div>
      <div className="st-seg" role="tablist" aria-label="영화">
        {t('', '극장가', tab === 'now')}
        {t(mineSub ?? 'watched', '내 영화', tab === 'mine')}
        {t('find', '찾기', tab === 'find')}
        {t('rec', '추천', tab === 'rec')}
      </div>
      {tab === 'mine' && (
        <nav className="mv-sub" aria-label="내 영화">
          <button className={mineSub === 'watched' ? 'on' : ''} onClick={() => go('/movies/watched')}>
            본 영화{watched.length ? ` ${watched.length}` : ''}
          </button>
          <button className={mineSub === 'want' ? 'on' : ''} onClick={() => go('/movies/want')}>
            보고 싶어요{want.length ? ` ${want.length}` : ''}
          </button>
          <button className={mineSub === 'awards' ? 'on' : ''} onClick={() => go('/movies/awards')}>
            시상식
          </button>
        </nav>
      )}

      {tab === 'mine' && oldWishes.length > 0 && (
        <p className="st-hint">
          취미의 「하고 싶은 것」에 영화가 {oldWishes.length}편 있어요.{' '}
          <button
            className="st-link"
            onClick={() => {
              const now = Date.now();
              putMany([
                ...oldWishes.map((w, i) => ({ c: 'movies' as const, item: { id: newId(), title: w.title, status: w.status === 'done' ? 'watched' : 'want', rating: w.rating, comment: w.note, watched: w.doneDate, created: now + i } as never })),
                ...oldWishes.map((w) => ({ c: 'wishes' as const, item: { ...w, deleted: true } as never })),
              ]);
              toast(`영화 ${oldWishes.length}편을 옮겼어요`);
            }}
          >
            영화로 옮기기
          </button>
        </p>
      )}

      {tab === 'now' && (
        <>
          <CatalogBar />
          <NowShowing today={today} onWatched={(m) => setEdit(m)} onOpen={open} />
        </>
      )}
      {tab === 'find' && <FindTab onWatched={(m) => setEdit(m)} onOpen={open} />}
      {tab === 'rec' && <RecTab onWatched={(m) => setEdit(m)} onOpen={open} />}
      {mineSub === 'awards' && <AwardsView onOpen={open} />}

      {mineSub === 'watched' &&
        (!watched.length ? (
          <Empty title="본 영화를 기록해 보세요">
            <p>별점과 한줄 감상평, 긴 리뷰를 남길 수 있어요.</p>
            <button className="btn btn-primary" onClick={() => setEdit({ status: 'watched' })}>
              본 영화 넣기
            </button>
          </Empty>
        ) : (
          <>
            <div className="mv-summary">
              <span>
                <b>{watched.length}</b>편
              </span>
              <span>
                올해 <b>{watched.filter((m) => m.watched?.startsWith(year)).length}</b>
              </span>
              <span>
                평균 <b>{avg ? `★ ${avg}` : '—'}</b>
              </span>
              {watched.length > 3 && (
                <button className="st-link" onClick={() => setSort(sort === 'recent' ? 'rating' : 'recent')}>
                  {sort === 'recent' ? '최근 순' : '별점 순'}
                </button>
              )}
            </div>
            {tagCount.size > 0 && (
              <div className="st-chips">
                {[...tagCount]
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, n]) => (
                    <button key={name} className={`st-chip ${tag === name ? 'on' : ''}`} aria-pressed={tag === name} onClick={() => setTag(tag === name ? '' : name)}>
                      #{name} {n}
                    </button>
                  ))}
              </div>
            )}
            <div className="mv-list">
              {shown.map((m) => (
                <article key={m.id} className="mv-card st-tap" {...tap(() => setView(m.id))}>
                  <div className="mv-top">
                    <b>{m.title}</b>
                    <small className="st-muted">{[m.year, m.again?.length ? `${1 + m.again.length}회` : ''].filter(Boolean).join(' · ')}</small>
                  </div>
                  <div className="mv-meta">
                    <span className="mv-stars" aria-label={m.rating ? `별점 ${m.rating}` : '별점 없음'}>
                      {starText(m.rating) || '별점 없음'}
                    </span>
                    <small className="st-muted">{[m.watched && shortDate(m.watched), m.where].filter(Boolean).join(' · ')}</small>
                  </div>
                  {m.comment && <p className="mv-comment">“{m.comment}”</p>}
                  {m.review && <p className="mv-review">{m.review}</p>}
                  {!m.comment && !m.review && <small className="st-muted">감상평 없음 · 눌러서 쓰기</small>}
                  {m.tags && m.tags.length > 0 && <small className="mv-tags">{m.tags.map((x) => `#${x}`).join(' ')}</small>}
                </article>
              ))}
            </div>
            {rated.length > 2 && (
              <details className="mv-dist">
                <summary>별점 분포</summary>
                <BarChart label="별점 분포" height={120} bars={dist} format={(v) => `${v}편`} />
              </details>
            )}
          </>
        ))}

      {mineSub === 'want' &&
        (!want.length ? (
          <Empty title="보고 싶은 영화가 없어요">
            <p>「극장가」나 「찾기」에서 영화를 눌러 담거나 직접 넣어 보세요.</p>
            <button className="btn btn-primary" onClick={() => setEdit({ status: 'want' })}>
              보고 싶은 영화 넣기
            </button>
          </Empty>
        ) : (
          <div className="mv-list">
            {want.map((m) => (
              <article key={m.id} className="mv-card st-tap" {...tap(() => setEdit(m))}>
                <div className="mv-top">
                  <b>{m.title}</b>
                  {m.year && <small className="st-muted">{m.year}</small>}
                </div>
                <Badges p={wantOtt.of({ title: m.title, year: m.year })} />
                <div className="mv-meta">
                  <small className="st-muted">{m.release ? `${shortDate(m.release)} 개봉${m.release >= today ? ` · ${dday(today, m.release)}` : ''}` : '개봉일 모름'}</small>
                  <button
                    className="st-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdit({ ...m, status: 'watched', watched: today });
                    }}
                  >
                    봤어요
                  </button>
                </div>
              </article>
            ))}
          </div>
        ))}

      {viewing && !viewing.deleted && (
        <MovieView
          item={viewing}
          today={today}
          onClose={() => setView(null)}
          onEdit={() => {
            setEdit(viewing);
            setView(null);
          }}
        />
      )}
      {edit && <MovieSheet item={edit} today={today} onClose={close} />}
    </div>
  );
}
