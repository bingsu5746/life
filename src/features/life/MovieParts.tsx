// 영화 한 편: 별점 입력 · 넣기/고치기 창 · 보기 창 (감상평·리뷰·태그·또 본 기록)
import { useEffect, useState } from 'react';
import { catalogSearch, type CatalogFilm } from '../auth/api';
import { shortDate } from '../study/dates';
import { alive, newId, type Movie } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { confirmDelete, Field, Sheet, toast } from '../study/ui';

/** 본 곳: 영화관 종류와 집·OTT */
export const PLACES = ['일반 영화관', '아이맥스', '스크린X', '돌비', '집'];
/** 고르는 태그 */
export const MOVIE_TAGS = ['혼자', '친구와', '가족과', '울었다', '웃었다', '소름', '반전', '여운', '영상미', '음악', '연기', '명작', '또 볼래', '지루함'];

/** ★★★½☆ 처럼 */
export function starText(r?: number) {
  if (!r) return '';
  const full = Math.floor(r);
  return '★'.repeat(full) + (r % 1 ? '½' : '') + '☆'.repeat(5 - full - (r % 1 ? 1 : 0));
}

function PlaceChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const list = value && !PLACES.includes(value) ? [value, ...PLACES] : PLACES;
  return (
    <div className="st-chips">
      {list.map((w) => (
        <button key={w} type="button" className={`st-chip ${value === w ? 'on' : ''}`} aria-pressed={value === w} onClick={() => onChange(value === w ? '' : w)}>
          {w}
        </button>
      ))}
    </div>
  );
}

/** 본 영화 하나: 별점 · 한줄 감상평 · 리뷰 전체 · 또 본 기록 */
export function MovieView({ item, today, onClose, onEdit }: { item: Movie; today: string; onClose: () => void; onEdit: () => void }) {
  const [asking, setAsking] = useState(false);
  const times = 1 + (item.again?.length ?? 0);
  return (
    <Sheet title={item.title} onClose={onClose}>
      <div className="mv-view">
        <div className="mv-meta">
          <span className="mv-stars big" aria-label={item.rating ? `별점 ${item.rating}` : '별점 없음'}>
            {starText(item.rating) || '별점 없음'} {item.rating ? <b>{item.rating.toFixed(1)}</b> : null}
          </span>
          <small className="st-muted">{[item.year && `${item.year}년 작`, item.watched && `${shortDate(item.watched)}에 봄`, item.where].filter(Boolean).join(' · ')}</small>
        </div>
        {(item.tags?.length ?? 0) > 0 && (
          <div className="mv-tags">
            {item.tags!.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
        {(item.quote || item.comment) && <blockquote className="mv-quote">{item.quote || item.comment}</blockquote>}
        {item.why && <small className="st-muted">보기 전: {item.why}</small>}
        {item.review ? (
          <div className="mv-review-full">
            <small className="st-muted">리뷰</small>
            <p>{item.review}</p>
          </div>
        ) : (
          !item.quote && !item.comment && <p className="st-muted">아직 리뷰가 없어요.</p>
        )}
        {times > 1 && (
          <small className="st-muted">
            {times}번 봤어요 ·{' '}
            {[item.watched, ...(item.again ?? []).map((a) => a.date)]
              .filter(Boolean)
              .map((x) => shortDate(x!))
              .join(', ')}
          </small>
        )}
        {asking && (
          <Field group label="어디서 또 봤나요?">
            <PlaceChips
              value=""
              onChange={(w) => {
                put('movies', { ...item, again: [...(item.again ?? []), { date: today, where: w || undefined }] } as Movie);
                toast('또 본 것으로 적었어요');
                setAsking(false);
              }}
            />
          </Field>
        )}
        <div className="st-row end">
          <button className="st-link" onClick={() => put('movies', { ...item, rewish: item.rewish ? undefined : true } as Movie)}>
            {item.rewish ? '다시 보고 싶은 영화에서 빼기' : '다시 보고 싶어요'}
          </button>
          {!asking && (
            <button className="st-link" onClick={() => setAsking(true)}>
              또 봤어요
            </button>
          )}
          <button className="btn btn-primary" onClick={onEdit}>
            {item.quote || item.review ? '고치기' : '리뷰 쓰기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 별 다섯 개: 누르면 그 별까지, 같은 별을 다시 누르면 반 개 */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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

export function MovieSheet({ item, today, onClose }: { item: Partial<Movie>; today: string; onClose: () => void }) {
  const d = useStudy();
  const [title, setTitle] = useState(item.title ?? '');
  const [year, setYear] = useState(item.year?.toString() ?? '');
  const [status, setStatus] = useState<Movie['status']>(item.status ?? 'watched');
  const [rating, setRating] = useState(item.rating ?? 0);
  const [quote, setQuote] = useState(item.quote ?? '');
  const [review, setReview] = useState(item.review ?? '');
  const [watched, setWatched] = useState(item.watched ?? today);
  // 개봉일은 목록에서 고르면 따라온다 (관심 영화 개봉 알림용)
  const [release, setRelease] = useState(item.release ?? '');
  const [where, setWhere] = useState(item.where ?? '');
  const [tags, setTags] = useState<string[]>(item.tags ?? []);
  const [why, setWhy] = useState(item.why ?? '');
  const [tagText, setTagText] = useState('');
  const [meta, setMeta] = useState({ genre: item.genre, nation: item.nation, director: item.director });
  const isNew = !item.id;
  // 자주 쓴 태그
  const used = new Map<string, number>();
  for (const m of alive(d.movies)) for (const t of m.tags ?? []) used.set(t, (used.get(t) ?? 0) + 1);
  const choices = [...new Set([...MOVIE_TAGS, ...[...used].sort((a, b) => b[1] - a[1]).map(([t]) => t), ...tags])];
  const addTag = (t: string) => {
    const v = t.trim().replace(/^#/, '').slice(0, 12);
    if (v && !tags.includes(v) && tags.length < 10) setTags([...tags, v]);
    setTagText('');
  };
  // 제목을 치면 서버에 쌓아 둔 영화 목록(1990년~)에서 찾아 준다
  const [found, setFound] = useState<CatalogFilm[]>([]);
  // 목록에서 하나 고르면 제목을 다시 칠 때까지 더 찾지 않는다
  const [picked, setPicked] = useState(!!item.title);
  useEffect(() => {
    const q = title.trim();
    if (!isNew || picked || q.length < 1) return setFound([]);
    let on = true;
    const t = setTimeout(() => {
      catalogSearch(q)
        .then((r) => on && setFound(r.items.filter((f) => f.title !== q || f.open.slice(0, 4) !== year)))
        .catch(() => on && setFound([]));
    }, 250);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [title, isNew, year, picked]);
  return (
    <Sheet title={isNew ? (item.title ? `「${item.title}」` : '영화 넣기') : '영화 고치기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-inline">
          <input className="st-input" autoFocus={!item.title} value={title} onChange={(e) => (setTitle(e.target.value), setPicked(false))} placeholder="영화 제목" aria-label="영화 제목" />
          <input className="st-input xs" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="연도" aria-label="개봉 연도 (선택)" />
        </div>
        {found.length > 0 && (
          <div className="mv-found" role="listbox" aria-label="영화 찾기">
            {found.slice(0, 8).map((f) => (
              <button
                key={f.code}
                type="button"
                role="option"
                aria-selected={false}
                className="mv-found-item"
                onClick={() => {
                  setTitle(f.title);
                  setYear(f.open.slice(0, 4));
                  setRelease(f.open);
                  setPicked(true);
                  setMeta({ genre: f.genre ?? undefined, nation: f.nation ?? undefined, director: f.director ?? undefined });
                  setFound([]);
                }}
              >
                <b>{f.title}</b>
                <small className="st-muted">{[f.open.slice(0, 4), f.genre, f.nation, f.director].filter(Boolean).join(' · ')}</small>
              </button>
            ))}
          </div>
        )}
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
            <Field label="명대사">
              <textarea className="st-input" rows={2} value={quote} onChange={(e) => setQuote(e.target.value)} aria-label="명대사" />
            </Field>
            <Field label={`리뷰${review.trim() ? ` · ${review.trim().length.toLocaleString('ko-KR')}자` : ''}`}>
              <textarea className="st-input mv-review-input" rows={8} value={review} onChange={(e) => setReview(e.target.value)} placeholder="줄거리, 좋았던 장면, 아쉬운 점… 길게 써도 돼요" aria-label="리뷰" />
            </Field>
            <Field group label="태그">
              <div className="st-chips">
                {choices.map((t) => (
                  <button key={t} type="button" className={`st-chip ${tags.includes(t) ? 'on' : ''}`} aria-pressed={tags.includes(t)} onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : tags.length < 10 ? [...tags, t] : tags)}>
                    {t}
                  </button>
                ))}
                <input
                  className="mv-taginput"
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addTag(tagText);
                    }
                  }}
                  onBlur={() => tagText && addTag(tagText)}
                  placeholder="+ 직접"
                  aria-label="태그 직접 넣기"
                />
              </div>
            </Field>
            <label className="st-cond-time">
              본 날
              <input className="st-input sm" type="date" value={watched} max={today} onChange={(e) => setWatched(e.target.value)} />
            </label>
            <Field group label="본 곳">
              <PlaceChips value={where} onChange={setWhere} />
            </Field>
          </>
        ) : (
          <>
            <Field label="왜 보고 싶어요? (선택)">
              <textarea className="st-input" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="예고편이 좋아서, 감독 전작이 좋았어서…" aria-label="보고 싶은 이유" />
            </Field>
          </>
        )}
        <div className="st-row end">
          {item.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('movies', item.id!), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!title.trim()}
            onClick={() => {
              const y = Number(year);
              put('movies', {
                ...item,
                ...meta,
                created: item.created ?? Date.now(),
                id: item.id ?? newId(),
                title: title.trim().slice(0, 80),
                year: y >= 1880 && y <= 2200 ? y : undefined,
                status,
                rating: status === 'watched' && rating ? rating : undefined,
                quote: status === 'watched' ? quote.trim() || undefined : item.quote,
                review: status === 'watched' ? review.trim() || undefined : item.review,
                tags: status === 'watched' && tags.length ? tags : undefined,
                watched: status === 'watched' ? watched || undefined : undefined,
                release: release || undefined,
                where: status === 'watched' ? where || undefined : undefined,
                why: why.trim() || undefined,
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
