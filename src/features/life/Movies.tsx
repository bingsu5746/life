// 영화: 본 영화에 별점(0.5 단위)과 한줄평, 보고 싶은 영화(개봉일 D-day). 내 기록만 (외부 영화 정보는 쓰지 않음)
import { useState } from 'react';
import { BarChart } from '../study/charts';
import { dday, shortDate } from '../study/dates';
import { alive, newId, type Movie } from '../study/model';
import { put, putMany, remove, useStudy } from '../study/store';
import { confirmDelete, Empty, Field, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';

const WHERE = ['극장', '넷플릭스', '티빙', '디즈니+', '쿠팡플레이', '웨이브', '왓챠', '그 밖'];

/** ★★★½☆ 처럼 */
export function starText(r?: number) {
  if (!r) return '';
  const full = Math.floor(r);
  return '★'.repeat(full) + (r % 1 ? '½' : '') + '☆'.repeat(5 - full - (r % 1 ? 1 : 0));
}

export function HobbyTabs({ on }: { on: 'hobby' | 'movies' }) {
  return (
    <div className="st-seg" role="tablist" aria-label="취미">
      <button role="tab" aria-selected={on === 'hobby'} className={on === 'hobby' ? 'on' : ''} onClick={() => go('/hobby')}>
        취미
      </button>
      <button role="tab" aria-selected={on === 'movies'} className={on === 'movies' ? 'on' : ''} onClick={() => go('/hobby/movies')}>
        영화
      </button>
    </div>
  );
}

/** sub: 'new' 이면 넣기 창 */
export function Movies({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [tab, setTab] = useState<'watched' | 'want'>('watched');
  const [sort, setSort] = useState<'recent' | 'rating'>('recent');
  const [edit, setEdit] = useState<Movie | 'new' | null>(sub === 'new' ? 'new' : null);
  const all = alive(d.movies);
  const watched = all.filter((m) => m.status === 'watched').sort((a, b) => (sort === 'rating' ? (b.rating ?? 0) - (a.rating ?? 0) : 0) || (b.watched ?? '').localeCompare(a.watched ?? '') || b.created - a.created);
  const want = all.filter((m) => m.status === 'want').sort((a, b) => (a.release ?? '9999').localeCompare(b.release ?? '9999') || b.created - a.created);
  const rated = watched.filter((m) => m.rating);
  const avg = rated.length ? Math.round((rated.reduce((a, m) => a + m.rating!, 0) / rated.length) * 10) / 10 : null;
  const year = today.slice(0, 4);
  const dist = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((r) => ({ label: String(r), value: rated.filter((m) => m.rating === r).length }));
  const oldWishes = alive(d.wishes).filter((w) => w.kind === 'movie');
  const close = () => {
    setEdit(null);
    if (sub) go('/hobby/movies');
  };
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>영화</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
          <Icon name="plus" /> 영화 넣기
        </button>
      </div>
      <HobbyTabs on="movies" />

      {oldWishes.length > 0 && (
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

      {!all.length ? (
        <Empty title="본 영화를 기록해 보세요">
          <p>본 영화에 별점과 한줄평을 남기고, 보고 싶은 영화는 개봉일과 함께 모아 두세요.</p>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            영화 넣기
          </button>
        </Empty>
      ) : (
        <>
          <section className="st-card">
            <div className="st-stat-row">
              <div>
                <small>본 영화</small>
                <b>{watched.length}편</b>
              </div>
              <div>
                <small>올해</small>
                <b>{watched.filter((m) => m.watched?.startsWith(year)).length}편</b>
              </div>
              <div>
                <small>평균 별점</small>
                <b>{avg ?? '—'}</b>
              </div>
            </div>
            {rated.length > 2 && <BarChart label="별점 분포" height={120} bars={dist} format={(v) => `${v}편`} />}
          </section>

          <div className="st-inline between wrap">
            <div className="st-seg">
              <button className={tab === 'watched' ? 'on' : ''} aria-pressed={tab === 'watched'} onClick={() => setTab('watched')}>
                본 영화 {watched.length || ''}
              </button>
              <button className={tab === 'want' ? 'on' : ''} aria-pressed={tab === 'want'} onClick={() => setTab('want')}>
                보고 싶어요 {want.length || ''}
              </button>
            </div>
            {tab === 'watched' && (
              <select className="st-input sm" value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'rating')} aria-label="정렬">
                <option value="recent">최근 본 순</option>
                <option value="rating">별점 높은 순</option>
              </select>
            )}
          </div>

          <div className="mv-list">
            {(tab === 'watched' ? watched : want).map((m) => (
              <article key={m.id} className="mv-card st-tap" {...tap(() => setEdit(m))}>
                <div className="mv-top">
                  <b>{m.title}</b>
                  {m.year && <small className="st-muted">{m.year}</small>}
                </div>
                {m.status === 'watched' ? (
                  <>
                    <div className="mv-meta">
                      <span className="mv-stars" aria-label={m.rating ? `별점 ${m.rating}` : '별점 없음'}>
                        {starText(m.rating) || '별점 없음'}
                      </span>
                      <small className="st-muted">{[m.watched && shortDate(m.watched), m.where].filter(Boolean).join(' · ')}</small>
                    </div>
                    {m.comment && <p className="mv-comment">{m.comment}</p>}
                  </>
                ) : (
                  <div className="mv-meta">
                    <small className="st-muted">{m.release ? `${shortDate(m.release)} 개봉${m.release >= today ? ` · ${dday(today, m.release)}` : ''}` : '개봉일 모름'}</small>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEdit({ ...m, status: 'watched', watched: today });
                      }}
                    >
                      봤어요
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <p className="st-hint">곧 개봉하는 영화 목록은 영화 정보 사이트와 연결해야 해서 지금은 직접 넣어요. 왓챠피디아와는 연결하지 않았어요.</p>
      {edit && <MovieSheet item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
    </div>
  );
}

/** 별 다섯 개: 누르면 그 별까지, 같은 별을 다시 누르면 반 개 */
function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="mv-starinput" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i ? 'full' : value >= i - 0.5 ? 'half' : '';
        return (
          <button key={i} type="button" className={`mv-star ${fill}`} aria-label={`${i}점`} aria-checked={value === i || value === i - 0.5} role="radio" onClick={() => onChange(value === i ? i - 0.5 : i)}>
            ★
          </button>
        );
      })}
      <span className="mv-score">{value ? value.toFixed(1) : '—'}</span>
      {value > 0 && (
        <button type="button" className="st-link" onClick={() => onChange(0)}>
          지우기
        </button>
      )}
    </div>
  );
}

function MovieSheet({ item, today, onClose }: { item?: Movie; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [year, setYear] = useState(item?.year?.toString() ?? '');
  const [status, setStatus] = useState<Movie['status']>(item?.status ?? 'watched');
  const [rating, setRating] = useState(item?.rating ?? 0);
  const [comment, setComment] = useState(item?.comment ?? '');
  const [watched, setWatched] = useState(item?.watched ?? today);
  const [release, setRelease] = useState(item?.release ?? '');
  const [where, setWhere] = useState(item?.where ?? '');
  const isNew = !item;
  return (
    <Sheet title={isNew ? '영화 넣기' : '영화 고치기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-inline">
          <input className="st-input" autoFocus={!item} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="영화 제목" aria-label="영화 제목" />
          <input className="st-input xs" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="연도" aria-label="개봉 연도 (선택)" />
        </div>
        <div className="st-seg">
          <button type="button" className={status === 'watched' ? 'on' : ''} aria-pressed={status === 'watched'} onClick={() => setStatus('watched')}>
            봤어요
          </button>
          <button type="button" className={status === 'want' ? 'on' : ''} aria-pressed={status === 'want'} onClick={() => setStatus('want')}>
            보고 싶어요
          </button>
        </div>
        {status === 'watched' ? (
          <>
            <StarInput value={rating} onChange={setRating} />
            <textarea className="st-input" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="한줄평 · 느낀 점" aria-label="코멘트" />
            <div className="st-inline wrap">
              <label className="st-cond-time">
                본 날
                <input className="st-input sm" type="date" value={watched} max={today} onChange={(e) => setWatched(e.target.value)} />
              </label>
            </div>
            <Field group label="어디서 (선택)">
              <div className="st-chips">
                {WHERE.map((w) => (
                  <button key={w} type="button" className={`st-chip ${where === w ? 'on' : ''}`} aria-pressed={where === w} onClick={() => setWhere(where === w ? '' : w)}>
                    {w}
                  </button>
                ))}
              </div>
            </Field>
          </>
        ) : (
          <label className="st-cond-time">
            개봉일 (알면)
            <input className="st-input sm" type="date" value={release} onChange={(e) => setRelease(e.target.value)} />
          </label>
        )}
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('movies', item.id), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!title.trim()}
            onClick={() => {
              const y = Number(year);
              put('movies', {
                ...(item ?? { created: Date.now() }),
                id: item?.id ?? newId(),
                title: title.trim().slice(0, 80),
                year: y >= 1880 && y <= 2200 ? y : undefined,
                status,
                rating: status === 'watched' && rating ? rating : undefined,
                comment: status === 'watched' ? comment.trim() || undefined : item?.comment,
                watched: status === 'watched' ? watched || undefined : undefined,
                release: release || undefined,
                where: status === 'watched' ? where || undefined : undefined,
              } as Movie);
              toast('저장했어요');
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}
