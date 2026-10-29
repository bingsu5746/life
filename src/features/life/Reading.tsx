// 독서: 읽는 중인 책의 쪽 수, 읽고 싶은 책, 다 읽은 책의 별점·한줄평·리뷰
import { useState } from 'react';
import { addDays, shortDate } from '../study/dates';
import { alive, newId, type Reading } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { Bar, confirmDelete, Empty, Field, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { StarInput, starText } from './MovieParts';

type Tab = 'reading' | 'want' | 'done';
const TAB_NAME: Record<Tab, string> = { reading: '읽는 중', want: '읽고 싶어요', done: '다 읽었어요' };

/** 오늘 읽은 곳을 기록에 넣는다 (같은 날은 마지막 것만) */
export function withProgress(b: Reading, read: number, today: string): Reading {
  const log = [...(b.log ?? []).filter((l) => l.date !== today), { date: today, read }].sort((a, c) => a.date.localeCompare(c.date));
  return { ...b, read, log };
}

/** 기간(from~to, 포함) 동안 읽은 쪽 수: 날마다 늘어난 만큼 */
export function pagesBetween(list: Reading[], from: string, to: string): number {
  let n = 0;
  for (const b of list) {
    let prev = 0;
    for (const l of b.log ?? []) {
      if (l.date >= from && l.date <= to && l.read > prev) n += l.read - prev;
      prev = l.read;
    }
  }
  return n;
}

export function ReadingPage() {
  const d = useStudy();
  const today = useToday();
  const [tab, setTab] = useState<Tab>('reading');
  const [edit, setEdit] = useState<Partial<Reading> | null>(null);
  const all = alive(d.reads);
  const by = (s: Tab) => all.filter((b) => b.status === s).sort((a, b) => (s === 'done' ? (b.finished ?? '').localeCompare(a.finished ?? '') : b.created - a.created));
  const list = by(tab);
  const year = today.slice(0, 4);
  const doneYear = by('done').filter((b) => b.finished?.startsWith(year)).length;
  const week = pagesBetween(all, addDays(today, -6), today);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>독서</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit({ status: tab })} aria-label="책 넣기">
          <Icon name="plus" />
        </button>
      </div>
      {all.length > 0 && (
        <div className="mv-summary">
          <span>
            올해 <b>{doneYear}</b>권
          </span>
          <span>
            최근 7일 <b>{week}</b>쪽
          </span>
        </div>
      )}
      <nav className="mv-sub" aria-label="독서">
        {(Object.keys(TAB_NAME) as Tab[]).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {TAB_NAME[k]}
            {by(k).length ? ` ${by(k).length}` : ''}
          </button>
        ))}
      </nav>
      {!list.length ? (
        <Empty title={all.length ? '이 칸에는 책이 없어요' : '읽는 책을 넣어 보세요'}>
          <p>읽은 쪽 수를 적어 두면 진도가 보이고, 다 읽으면 별점과 감상을 남길 수 있어요.</p>
          <button className="btn btn-primary" onClick={() => setEdit({ status: tab })}>
            책 넣기
          </button>
        </Empty>
      ) : (
        <div className="mv-list">
          {list.map((b) => (
            <article key={b.id} className="mv-card st-tap" {...tap(() => setEdit(b))}>
              <div className="mv-top">
                <b>{b.title}</b>
                {b.author && <small className="st-muted">{b.author}</small>}
              </div>
              {b.status === 'reading' && b.pages ? <Bar value={Math.min(b.read ?? 0, b.pages)} max={b.pages} label={`${b.title} 읽은 정도`} /> : null}
              <div className="mv-meta">
                {b.status === 'done' ? <span className="mv-stars">{starText(b.rating) || '별점 없음'}</span> : <small className="st-muted">{b.pages ? `${b.read ?? 0} / ${b.pages}쪽` : b.read ? `${b.read}쪽까지` : ''}</small>}
                <small className="st-muted">{b.status === 'done' && b.finished ? `${shortDate(b.finished)} 다 읽음` : ''}</small>
              </div>
              {b.comment && <p className="mv-comment">“{b.comment}”</p>}
            </article>
          ))}
        </div>
      )}
      {edit && <ReadSheet item={edit} today={today} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ReadSheet({ item, today, onClose }: { item: Partial<Reading>; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(item.title ?? '');
  const [author, setAuthor] = useState(item.author ?? '');
  const [status, setStatus] = useState<Reading['status']>(item.status ?? 'reading');
  const [pages, setPages] = useState(item.pages?.toString() ?? '');
  const [read, setRead] = useState(item.read?.toString() ?? '');
  const [rating, setRating] = useState(item.rating ?? 0);
  const [comment, setComment] = useState(item.comment ?? '');
  const [review, setReview] = useState(item.review ?? '');
  const num = (s: string) => (s ? Number(s) : undefined);
  return (
    <Sheet title={item.id ? '책 고치기' : '책 넣기'} onClose={onClose}>
      <div className="st-form">
        <input className="st-input" autoFocus={!item.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="책 제목" aria-label="책 제목" />
        <input className="st-input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="지은이 (선택)" aria-label="지은이" />
        <div className="st-seg">
          {(Object.keys(TAB_NAME) as Tab[]).map((k) => (
            <button key={k} type="button" className={status === k ? 'on' : ''} aria-pressed={status === k} onClick={() => setStatus(k)}>
              {TAB_NAME[k]}
            </button>
          ))}
        </div>
        {status !== 'want' && (
          <div className="st-inline wrap">
            <input className="st-input xs" inputMode="numeric" value={status === 'done' && pages ? pages : read} onChange={(e) => setRead(e.target.value.replace(/\D/g, '').slice(0, 5))} disabled={status === 'done' && !!pages} aria-label="읽은 쪽" />
            <span>/</span>
            <input className="st-input xs" inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="전체" aria-label="전체 쪽수" />
            <span>쪽</span>
          </div>
        )}
        {status === 'done' && (
          <>
            <StarInput value={rating} onChange={setRating} />
            <Field label="한줄평">
              <textarea className="st-input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} aria-label="한줄평" />
            </Field>
            <Field label="리뷰">
              <textarea className="st-input mv-review-input" rows={6} value={review} onChange={(e) => setReview(e.target.value)} placeholder="인상 깊은 문장, 느낀 점…" aria-label="리뷰" />
            </Field>
          </>
        )}
        <div className="st-row end">
          {item.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('reads', item.id!), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!title.trim()}
            onClick={() => {
              const total = num(pages);
              const cur = status === 'done' ? (total ?? num(read)) : status === 'want' ? undefined : num(read);
              const base: Reading = {
                ...(item as Reading),
                id: item.id ?? newId(),
                created: item.created ?? Date.now(),
                title: title.trim().slice(0, 100),
                author: author.trim() || undefined,
                status,
                pages: status === 'want' ? total : total,
                read: cur,
                rating: status === 'done' && rating ? rating : undefined,
                comment: status === 'done' ? comment.trim() || undefined : undefined,
                review: status === 'done' ? review.trim() || undefined : undefined,
              };
              base.started = status !== 'want' ? (item.started ?? today) : undefined;
              base.finished = status === 'done' ? (item.finished ?? today) : undefined;
              put('reads', cur !== undefined && cur !== item.read ? withProgress(base, cur, today) : base);
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
