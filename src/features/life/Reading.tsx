// 독서: 읽는 중인 책의 쪽 수, 읽고 싶은 책, 다 읽은 책의 별점·한줄평·리뷰
import { useState } from 'react';
import { addDays, shortDate } from '../study/dates';
import { alive, newId, type Reading } from '../study/model';
import { put, remove, setSettings, useStudy } from '../study/store';
import { Bar, confirmDelete, Empty, Field, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { askAiLater } from '../study/solveJob';
import { StarInput, starText } from './MovieParts';
import { BookSearch } from '../study/BookSearch';
import { bookSearch, isLoggedIn, type BookHit } from '../auth/api';
import { BarChart } from '../study/charts';
import { goalPace, pagesBetween, withProgress } from './readingCalc';

export { goalPace, pagesBetween, withProgress };

type Tab = 'reading' | 'want' | 'done';
const TAB_NAME: Record<Tab, string> = { reading: '읽는 중', want: '읽고 싶어요', done: '다 읽었어요' };
type View = Tab | 'quotes';

export function ReadingPage() {
  const d = useStudy();
  const today = useToday();
  const [view, setTab] = useState<View>('reading');
  const tab: Tab = view === 'quotes' ? 'done' : view;
  const [edit, setEdit] = useState<Partial<Reading> | null>(null);
  const all = alive(d.reads);
  const quotes = all.flatMap((b) => (b.quotes ?? []).map((q, i) => ({ ...q, book: b, key: `${b.id}-${i}` })));
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
      <ReadGoal done={doneYear} today={today} />
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
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setTab(k)}>
            {TAB_NAME[k]}
            {by(k).length ? ` ${by(k).length}` : ''}
          </button>
        ))}
        {quotes.length > 0 && (
          <button className={view === 'quotes' ? 'on' : ''} onClick={() => setTab('quotes')}>
            밑줄 {quotes.length}
          </button>
        )}
      </nav>
      {view === 'quotes' ? (
        <div className="mq-list">
          {quotes.map((q) => (
            <button key={q.key} className="mq-item" onClick={() => setEdit(q.book)}>
              <p>“{q.text}”</p>
              <small>
                <b>{q.book.title}</b>
                {q.page ? ` · ${q.page}쪽` : ''}
              </small>
            </button>
          ))}
        </div>
      ) : !list.length ? (
        <Empty title={all.length ? '이 칸에는 책이 없어요' : '읽는 책을 넣어 보세요'}>
          <button className="btn btn-primary" onClick={() => setEdit({ status: tab })}>
            책 넣기
          </button>
        </Empty>
      ) : (
        <div className="mv-list">
          {list.map((b) => (
            <article key={b.id} className="mv-card st-tap" {...tap(() => setEdit(b))}>
              <div className="mv-top">
                {b.cover && <img className="rd-cover" src={b.cover} alt="" loading="lazy" />}
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
      <ReadStats all={all} today={today} />
      {isLoggedIn() && <BookFind have={all} />}
      {edit && <ReadSheet item={edit} today={today} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** 독서 통계: 최근 30일 날마다 읽은 쪽 · 올해 달마다 다 읽은 책 · 평균 별점 · 올해 읽은 쪽 */
function ReadStats({ all, today }: { all: Reading[]; today: string }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const per = days.map((dd) => pagesBetween(all, dd, dd));
  const year = today.slice(0, 4);
  const done = all.filter((b) => b.status === 'done' && b.finished?.startsWith(year));
  if (!per.some(Boolean) && !done.length) return null;
  const rated = all.filter((b) => b.rating);
  const avg = rated.length ? rated.reduce((a, b) => a + b.rating!, 0) / rated.length : 0;
  const months = Array.from({ length: 12 }, (_, i) => done.filter((b) => Number(b.finished!.slice(5, 7)) === i + 1).length);
  return (
    <section className="st-card">
      <h3 className="st-h">독서 기록</h3>
      <div className="nba-avg">
        <div>
          <small>최근 30일</small>
          <b>{per.reduce((a, b) => a + b, 0).toLocaleString('ko-KR')}쪽</b>
        </div>
        <div>
          <small>하루 평균</small>
          <b>{Math.round(per.reduce((a, b) => a + b, 0) / 30)}쪽</b>
        </div>
        <div>
          <small>올해 다 읽음</small>
          <b>{done.length}권</b>
        </div>
        <div>
          <small>올해 읽은 쪽</small>
          <b>{pagesBetween(all, `${year}-01-01`, today).toLocaleString('ko-KR')}쪽</b>
        </div>
        {avg > 0 && (
          <div>
            <small>평균 별점</small>
            <b>★ {avg.toFixed(1)}</b>
          </div>
        )}
      </div>
      {per.some(Boolean) && <BarChart label="최근 30일 날마다 읽은 쪽" height={130} bars={days.map((dd, i) => ({ label: dd.slice(8), title: shortDate(dd), value: per[i], strong: dd === today }))} format={(v) => `${v}쪽`} />}
      {done.length > 0 && <BarChart label={`${year}년 달마다 다 읽은 책`} height={110} bars={months.map((n, i) => ({ label: `${i + 1}`, title: `${i + 1}월`, value: n }))} format={(v) => `${v}권`} />}
    </section>
  );
}

/** 책 찾기 (국립중앙도서관): 표지 · 지은이 · 출판사 · 정가 → 읽고 싶어요 · 읽는 중에 바로 */
function BookFind({ have }: { have: Reading[] }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<BookHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const find = async () => {
    if (q.trim().length < 2 || busy) return;
    setBusy(true);
    setNote('');
    try {
      const r = await bookSearch(q.trim());
      setList(r.list);
      if (r.needKey) setNote('책 찾기는 예스24 · 국립중앙도서관 키가 있어야 돼요.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : '찾지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  const add = (b: BookHit, status: Reading['status']) => {
    if (have.some((x) => (b.isbn && x.isbn === b.isbn) || x.title === b.title)) return toast('이미 있어요');
    const p = Number(b.pages.replace(/[^\d]/g, ''));
    put('reads', {
      id: newId(),
      created: Date.now(),
      title: b.title.slice(0, 100),
      author: b.author || undefined,
      status,
      pages: p > 0 && p < 20000 ? p : undefined,
      cover: b.cover || undefined,
      isbn: b.isbn || undefined,
      publisher: b.publisher || undefined,
      price: b.price || undefined,
      started: status === 'reading' ? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) : undefined,
    } as Reading);
    toast(status === 'want' ? '읽고 싶어요에 넣었어요' : '읽는 중에 넣었어요');
  };
  return (
    <section className="st-card">
      <h3 className="st-h">책 찾기</h3>
      <form
        className="st-inline"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="책 제목 · 지은이 · ISBN" aria-label="찾을 책" />
        <button className="btn btn-sm btn-primary" disabled={busy || q.trim().length < 2}>
          {busy ? '찾는 중…' : '찾기'}
        </button>
      </form>
      {note && <p className="st-muted sm">{note}</p>}
      {list && !list.length && !note && <p className="st-muted sm">찾지 못했어요.</p>}
      {list && list.length > 0 && (
        <div className="dg-list">
          {list.map((b, i) => (
            <div key={`${b.isbn}-${i}`} className="dg-item rd-item">
              {b.cover ? <img src={b.cover} alt="" loading="lazy" /> : <span className="dg-noimg" aria-hidden />}
              <div className="dg-info">
                <b>{b.title}</b>
                <span>{[b.author, b.publisher].filter(Boolean).join(' · ')}</span>
                <small className="st-muted">{[b.date.slice(0, 4), b.pages, b.sale ? `${b.sale.toLocaleString('ko-KR')}원${b.price > b.sale ? ` (정가 ${b.price.toLocaleString('ko-KR')}원)` : ''}` : b.price ? `정가 ${b.price.toLocaleString('ko-KR')}원` : ''].filter(Boolean).join(' · ')}</small>
                {b.link && (
                  <a className="st-link sm" href={b.link} target="_blank" rel="noreferrer">
                    예스24 에서 보기 ↗
                  </a>
                )}
              </div>
              <div className="dg-btns">
                <button className="btn btn-sm" onClick={() => add(b, 'reading')}>
                  읽는 중
                </button>
                <button className="btn btn-sm" onClick={() => add(b, 'want')}>
                  읽고 싶어요
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
  const [quotes, setQuotes] = useState(item.quotes ?? []);
  const [found, setFound] = useState<BookHit | null>(null);
  const num = (s: string) => (s ? Number(s) : undefined);
  return (
    <Sheet title={item.id ? '책 고치기' : '책 넣기'} onClose={onClose}>
      <div className="st-form">
        <BookSearch
          value={title}
          onChange={setTitle}
          picked={!!item.title}
          onPick={(b) => {
            setTitle(b.title);
            if (b.author) setAuthor(b.author);
            const p = Number(b.pages.replace(/[^\d]/g, ''));
            if (p > 0 && p < 20000 && !pages) setPages(String(p));
            setFound(b);
          }}
          placeholder="책 제목 (치면 찾아 줘요)"
          label="책 제목"
        />
        {(found?.cover || item.cover) && <img className="rd-cover big" src={found?.cover || item.cover} alt="" />}
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
        {status !== 'want' && <QuoteInput quotes={quotes} onChange={setQuotes} />}
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
          {item.id && item.status !== 'want' && (
            <button
              className="btn btn-sm"
              onClick={() => {
                // 책 제목 · 지은이 · 내가 남긴 밑줄 · 한줄평으로 내용 확인 퀴즈 (AI 화면에 미리 넣어 둠)
                const q = (item.quotes ?? []).slice(0, 10);
                askAiLater({
                  title: `독서 퀴즈: ${item.title}`,
                  text: [
                    `내가 ${item.status === 'done' ? '다 읽은' : `${item.read ?? 0}쪽까지 읽은`} 책 「${item.title}」${item.author ? ` (${item.author})` : ''} 으로 내용을 잘 기억하는지 확인하는 퀴즈 5개를 내 줘.`,
                    '- 객관식 3개 + 생각을 묻는 주관식 2개, 문제만 먼저 쓰고 정답과 해설은 맨 아래 「정답」 제목 아래에.',
                    '- 이 책을 정확히 모르면 지어내지 말고, 아래 내 밑줄 · 한줄평만으로 문제를 만들어 줘.',
                    ...(q.length ? ['', '[내가 밑줄 친 문장]', ...q.map((x) => `- ${x.text}${x.page ? ` (${x.page}쪽)` : ''}`)] : []),
                    ...(item.comment ? ['', `[내 한줄평] ${item.comment}`] : []),
                  ].join('\n'),
                });
                onClose();
                go('/ai');
              }}
            >
              AI 독서 퀴즈
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
                quotes: quotes.length ? quotes : undefined,
                ...(found ? { cover: found.cover || undefined, isbn: found.isbn || undefined, publisher: found.publisher || undefined, price: found.price || undefined } : {}),
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

/** 밑줄 친 문장: 문장 · 쪽 넣고, 누르면 지우기 */
function QuoteInput({ quotes, onChange }: { quotes: { text: string; page?: number }[]; onChange: (q: { text: string; page?: number }[]) => void }) {
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const add = () => {
    if (!text.trim()) return;
    onChange([...quotes, { text: text.trim().slice(0, 1000), page: Number(page) || undefined }]);
    setText('');
    setPage('');
  };
  return (
    <Field group label="밑줄">
      {quotes.map((q, i) => (
        <div key={i} className="st-item">
          <div className="st-item-main">
            <div className="st-item-title">“{q.text}”</div>
            {q.page && <div className="st-item-sub">{q.page}쪽</div>}
          </div>
          <button type="button" className="st-link" aria-label="이 문장 지우기" onClick={() => onChange(quotes.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <textarea className="st-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="마음에 든 문장" aria-label="밑줄 문장" />
      <div className="st-inline">
        <input className="st-input xs" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="쪽" aria-label="쪽" />
        <button type="button" className="btn btn-sm" disabled={!text.trim()} onClick={add}>
          문장 넣기
        </button>
      </div>
    </Field>
  );
}

function ReadGoal({ done, today }: { done: number; today: string }) {
  const d = useStudy();
  const goal = d.settings.readingGoal;
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(goal?.toString() ?? '');
  if (edit)
    return (
      <div className="st-inline">
        올해
        <input className="st-input xs" inputMode="numeric" autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="올해 읽을 책 수" />권 읽기
        <button
          className="btn btn-sm btn-primary"
          onClick={() => {
            setSettings({ readingGoal: Number(v) > 0 ? Number(v) : undefined });
            setEdit(false);
          }}
        >
          저장
        </button>
      </div>
    );
  if (!goal)
    return (
      <button className="st-link" onClick={() => setEdit(true)}>
        올해 독서 목표 정하기
      </button>
    );
  const p = goalPace(goal, done, today);
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">
          올해 {done}/{goal}권
        </h3>
        <button className="st-link" onClick={() => setEdit(true)}>
          고치기
        </button>
      </div>
      <Bar value={Math.min(done, goal)} max={goal} label="올해 독서 목표" />
      <p className="st-hint">{p.left ? `남은 ${p.left}권 · 한 달에 ${p.perMonth}권씩 읽으면 돼요${p.onTrack ? '' : ' (조금 늦어요)'}` : '올해 목표를 이뤘어요!'}</p>
    </section>
  );
}
