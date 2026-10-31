// 문제집: 목록 · 넣기(목차 붙여넣기·사진) · 문제집 하나(계획·달력·진도) (설계 §4~5)
import { useMemo, useRef, useState } from 'react';
import { addDays, daysBetween, longDate, shortDate, weekStart, WEEKDAYS, weekday } from './dates';
import { weekLoad } from './weekLoad';
import { alive, newId, type Book, type Unit } from './model';
import { compress, expand, parseRanges, rangeText } from './pages';
import { paceOf } from './plan';
import { forecastFor, forecastText } from './forecast';
import { BookTabs, Papers } from './Papers';
import { bookDone, planCtx, planViews, reservedPages } from './select';
import { getStudy, put, remove, useStudy, useWords } from './store';
import { parseToc, tocText, type TocRow } from './toc';
import { markBook } from './actions';
import { BookSearch } from './BookSearch';
import { bookToc, tocScan } from '../auth/api';
import { compressProblemImage } from '../../lib/imageCompress';
import { PlanForm } from './PlanForm';
import { PlanWarning } from './Today';
import { Bar, confirmDelete, Empty, Field, go, Icon, Menu, SubjectDot, SubjectPicker, SubjectTag, toast, useToday } from './ui';

export function Books({ id, sub }: { id?: string; sub?: string }) {
  if (id === 'papers') return <Papers sub={sub} />;
  if (id === 'new') return <BookEditor onDone={(b, plan) => go(b ? `/books/${b}${plan ? '/plan' : ''}` : '/books')} />;
  if (id) return <BookDetail id={id} plan={sub === 'plan'} />;
  return <BookList />;
}

/** 이번 주 할 양: 앞으로 7일 문제집 쪽수, 몰린 날 표시 */
function WeekLoad({ views, today }: { views: ReturnType<typeof planViews>; today: string }) {
  const [pick, setPick] = useState<string | null>(null);
  const days = weekLoad(
    views.map((v) => ({ name: v.name, today: v.sched.today, days: v.sched.days })),
    today,
  );
  const max = Math.max(1, ...days.map((x) => x.total));
  if (!days.some((x) => x.total)) return null;
  const sel = days.find((x) => x.date === pick);
  const heavy = days.filter((x) => x.heavy);
  return (
    <section className="st-card wl">
      <div className="st-inline between">
        <h3 className="st-h">앞으로 7일</h3>
        {heavy.length > 0 && <small className="wl-warn">{heavy.map((x) => (x.date === today ? '오늘' : `${WEEKDAYS[weekday(x.date)]}`)).join('·')}에 몰려 있어요</small>}
      </div>
      <div className="wl-bars">
        {days.map((x) => (
          <button key={x.date} className={`wl-day ${x.heavy ? 'heavy' : ''} ${pick === x.date ? 'on' : ''}`} onClick={() => setPick(pick === x.date ? null : x.date)} aria-label={`${shortDate(x.date)} ${x.total}쪽`}>
            <small>{x.total || ''}</small>
            <span style={{ height: `${(x.total / max) * 100}%` }} />
            <b>{x.date === today ? '오늘' : WEEKDAYS[weekday(x.date)]}</b>
          </button>
        ))}
      </div>
      {sel && (
        <p className="st-muted wl-detail">
          {shortDate(sel.date)}: {sel.parts.length ? sel.parts.map((p) => `${p.name} ${p.n}쪽`).join(' · ') : '쉬는 날'}
        </p>
      )}
    </section>
  );
}

function BookList() {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const views = planViews(d, words, today);
  const books = alive(d.books).sort((a, b) => (d.subjects[a.subjectId]?.order ?? 99) - (d.subjects[b.subjectId]?.order ?? 99) || a.name.localeCompare(b.name));
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>문제집</h2>
        {books.length > 0 && (
          <button className="btn btn-sm" onClick={() => go('/books/new')}>
            <Icon name="plus" /> 문제집 넣기
          </button>
        )}
      </div>
      <BookTabs on="books" />
      <WeekLoad views={views.filter((v) => v.plan.target === 'book')} today={today} />
      {!books.length && (
        <Empty icon="📖" title="아직 넣은 문제집이 없어요">
          <p>목차를 붙여 넣거나 목차 사진을 찍으면, 시험까지 하루에 풀 페이지를 정해 드려요.</p>
          <button className="btn btn-primary" onClick={() => go('/books/new')}>
            문제집 넣기
          </button>
        </Empty>
      )}
      <div className="st-grid">
        {books.map((b) => {
          const done = bookDone(b);
          const all = expand(b.units.filter((u) => !u.skip).map((u) => [u.from, u.to]));
          const n = all.filter((p) => done.has(p)).length;
          const v = views.find((x) => x.plan.target === 'book' && x.plan.targetId === b.id);
          const color = d.subjects[b.subjectId]?.color;
          return (
            <button key={b.id} className="st-book" style={{ ['--c' as string]: color }} onClick={() => go(`/books/${b.id}`)}>
              <div className="st-book-spine" aria-hidden />
              <div className="st-book-body">
                <SubjectTag id={b.subjectId} d={d} />
                <strong>{b.name}</strong>
                <Bar value={n} max={all.length} label="푼 쪽" />
                <small>
                  {n}/{all.length}쪽 ({all.length ? Math.round((n / all.length) * 100) : 0}%)
                </small>
                {v ? (
                  <small className={v.sched.warning ? 'bad' : ''}>
                    {v.sched.today.length ? `오늘 p.${rangeText(v.sched.today)}` : !v.sched.remaining.length ? '계획 끝' : v.sched.warning?.kind === 'ended' ? '시험 끝' : v.plan.start > today ? `${shortDate(v.plan.start)}부터 시작` : '오늘은 쉬는 날'}
                    {v.sched.end && ` · ${shortDate(v.sched.end)}까지`}
                  </small>
                ) : (
                  <small className="st-muted">계획 없음</small>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 단원마다 「이름#그 이름의 몇 번째」 */
function unitKeys(units: { name: string }[]): string[] {
  const seen = new Map<string, number>();
  return units.map((u) => {
    const n = (seen.get(u.name) ?? 0) + 1;
    seen.set(u.name, n);
    return `${u.name}#${n}`;
  });
}

/** 문제집 넣기·고치기: 이름 · 과목 · 목차 */
function BookEditor({ book, onDone }: { book?: Book; onDone: (id?: string, plan?: boolean) => void }) {
  const [name, setName] = useState(book?.name ?? '');
  const [subjectId, setSubjectId] = useState(book?.subjectId ?? '');
  const [text, setText] = useState(book ? tocText(book.units) : '');
  const [last, setLast] = useState('');
  // 계획에서 뺄 단원: 「이름#몇 번째」로 기억한다 (이름이 같은 단원이 여럿이어도 하나만 빠지게)
  const [skips, setSkips] = useState<Set<string>>(() => new Set(unitKeys(book?.units ?? []).filter((_, i) => book!.units[i].skip)));
  const [ocr, setOcr] = useState<string | null>(null);
  const [solved, setSolved] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const rows: TocRow[] = useMemo(() => parseToc(text, Number(last) || undefined), [text, last]);
  const good = rows.filter((r) => !r.problem);
  const keys = unitKeys(rows);
  const needsLast = rows.some((r) => r.problem === '끝 페이지를 알려 주세요');

  /** 목차 사진 → AI(Gemini)가 단원 · 쪽을 읽는다. 안 되면 기기 안 글자 인식(tesseract)으로 */
  async function readPhotos(files: FileList) {
    const list = [...files].slice(0, 4);
    setOcr(`AI 가 목차 ${list.length}장을 읽는 중… (10~40초)`);
    try {
      const images = await Promise.all(
        list.map(async (f) => {
          const small = await compressProblemImage(f, 1600, 0.85);
          const data = await new Promise<string>((ok, no) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result).split(',')[1] ?? '');
            r.onerror = () => no(new Error('사진을 읽지 못했어요'));
            r.readAsDataURL(small);
          });
          return { mime: small.type || 'image/jpeg', data };
        }),
      );
      const got = await tocScan(images);
      if (!got.units.length) throw new Error('AI 가 단원을 찾지 못했어요');
      const lines = got.units.map((u) => `${u.name} ${u.from}${u.to ? `-${u.to}` : ''}`).join('\n');
      setText((t) => (t.trim() ? t.trim() + '\n' : '') + lines);
      toast(`AI 가 단원 ${got.units.length}개를 읽었어요. 틀린 곳이 있으면 고쳐 주세요`);
      setOcr(null);
      return;
    } catch (e) {
      toast(`${e instanceof Error ? e.message : 'AI 가 읽지 못했어요'} · 기기 안 글자 인식으로 해 볼게요`);
    }
    const { readImageText } = await import('../../lib/ocr');
    let all = '';
    for (const [i, f] of list.entries()) {
      try {
        all += (await readImageText(f, (stage, r) => setOcr(`사진 ${i + 1}/${list.length} · ${stage === 'recognizing text' ? '글자 읽는 중' : '준비 중'} ${Math.round(r * 100)}%`))) + '\n';
      } catch {
        setOcr(null);
        toast('사진을 읽지 못했어요. 직접 입력해 주세요');
        return;
      }
    }
    setOcr(null);
    setText((t) => (t.trim() ? t.trim() + '\n' : '') + all.trim());
    toast('읽은 글을 넣었어요. 틀린 곳을 고쳐 주세요');
  }

  function save(plan = false) {
    if (!name.trim() || !subjectId || !good.length) return;
    const units: Unit[] = rows.flatMap((r, i) => (r.problem ? [] : [{ name: r.name, from: r.from, to: r.to, skip: skips.has(keys[i]) || undefined }]));
    const id = book?.id ?? newId();
    put('books', { ...(book ?? { done: [], undone: [] }), id, name: name.trim(), subjectId, units });
    // 이미 푼 쪽: 「48」이면 첫 쪽부터 48쪽까지, 「1-48, 60-62」처럼 범위도 된다. 계획은 남은 쪽만 나눈다
    const sv = solved.trim();
    if (sv) {
      const first = Math.min(...units.map((u) => u.from));
      const pages = /^\d+$/.test(sv) ? expand([[first, Number(sv)]]) : expand(parseRanges(sv));
      if (pages.length) markBook(id, pages, true);
    }
    // 목차를 고치면, 문제집 전체(빼지 않은 단원)를 범위로 한 계획은 새 목차를 따라간다
    if (book) {
      const full = (us: Unit[]) => JSON.stringify(compress(expand(us.filter((u) => !u.skip).map((u) => [u.from, u.to]))));
      const before = full(book.units);
      const after = compress(expand(units.filter((u) => !u.skip).map((u) => [u.from, u.to])));
      for (const p of alive(getStudy().plans)) if (p.target === 'book' && p.targetId === id && !p.finished && JSON.stringify(compress(expand(p.range))) === before && before !== JSON.stringify(after)) put('plans', { ...p, range: after, todayLock: undefined });
    }
    onDone(id, plan);
  }

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{book ? '문제집 고치기' : '문제집 넣기'}</h2>
        <button className="btn btn-sm" onClick={() => onDone(book?.id)}>
          취소
        </button>
      </div>
      <div className="st-card st-form">
        <Field label="이름" hint="치면 국립중앙도서관 목록에서 찾아요. 고르면 목차도 있으면 불러와요">
          <BookSearch
            value={name}
            onChange={setName}
            picked={!!book}
            placeholder="예: 쎈 수학 상"
            label="문제집 이름"
            onPick={(h) => {
              setName(h.title);
              if (!h.toc || text.trim()) return;
              setOcr('목차를 불러오는 중…');
              bookToc(h.toc)
                .then((r) => {
                  if (r.text.trim()) {
                    setText(r.text.trim());
                    toast('목차를 불러왔어요. 쪽이 없는 줄은 고쳐 주세요');
                  }
                })
                .catch(() => toast('목차를 불러오지 못했어요'))
                .finally(() => setOcr(null));
            }}
          />
        </Field>
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field
          label="목차"
          hint={
            <>
              한 줄에 단원 하나: <code>1. 집합 12-30</code> · 시작 쪽만 있어도 돼요 <code>2. 명제 31</code> · 단원 없이 <code>1-240</code>
            </>
          }
        >
          <textarea className="st-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1. 집합 12-30\n2. 명제 31-52\n3. 함수 53'} />
        </Field>
        <div className="st-row">
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={!!ocr}>
            목차 사진으로 채우기 (여러 장 가능)
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && void readPhotos(e.target.files)} />
          {ocr && <span className="st-muted">{ocr}</span>}
        </div>
        <Field label="이미 푼 곳 (있으면)" hint="예: 48 (첫 쪽부터 48쪽까지) · 1-48, 60-62. 계획은 남은 쪽만 나눠요">
          <input className="st-input" value={solved} onChange={(e) => setSolved(e.target.value.replace(/[^\d,\- ]/g, ''))} placeholder="어디까지 풀었는지 (쪽)" aria-label="이미 푼 쪽" />
        </Field>
        {needsLast && (
          <Field label="마지막 단원의 끝 쪽">
            <input className="st-input xs" inputMode="numeric" value={last} onChange={(e) => setLast(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        {rows.length > 0 && (
          <table className="st-table">
            <thead>
              <tr>
                <th>단원</th>
                <th>쪽</th>
                <th>계획에서 빼기</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.problem ? 'bad' : ''}>
                  <td>{r.name}</td>
                  <td>{r.problem ? <span className="bad">{r.problem}</span> : `${r.from}~${r.to}${r.guessedEnd ? '*' : ''}`}</td>
                  <td>
                    {!r.problem && (
                      <input
                        type="checkbox"
                        aria-label={`${r.name} 빼기`}
                        checked={skips.has(keys[i])}
                        onChange={() => {
                          const n = new Set(skips);
                          n.has(keys[i]) ? n.delete(keys[i]) : n.add(keys[i]);
                          setSkips(n);
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.some((r) => r.guessedEnd) && <p className="st-hint">* 끝 쪽은 다음 단원 시작에서 짐작했어요</p>}
        <div className="st-row end">
          {book ? (
            <button className="btn btn-primary" disabled={!name.trim() || !subjectId || !good.length} onClick={() => save()}>
              저장
            </button>
          ) : (
            <>
              <button className="btn" disabled={!name.trim() || !subjectId || !good.length} onClick={() => save()}>
                등록만
              </button>
              <button className="btn btn-primary" disabled={!name.trim() || !subjectId || !good.length} onClick={() => save(true)}>
                계획까지 세우기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BookDetail({ id, plan }: { id: string; plan?: boolean }) {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(!!plan);
  const [pages, setPages] = useState('');
  const b = d.books[id];
  if (!b || b.deleted)
    return (
      <Empty icon="🤔" title="문제집을 찾을 수 없어요">
        <button className="btn" onClick={() => go('/books')}>
          문제집 목록
        </button>
      </Empty>
    );
  if (editing) return <BookEditor book={b} onDone={() => setEditing(false)} />;
  const done = bookDone(b);
  const reserved = reservedPages(d, b.id);
  const v = planViews(d, words, today).find((x) => x.plan.target === 'book' && x.plan.targetId === b.id);
  const all = expand(b.units.filter((u) => !u.skip).map((u) => [u.from, u.to]));
  const n = all.filter((p) => done.has(p)).length;
  const pace = v ? paceOf(v.plan, v.target, planCtx(d, today)) : 0;
  const showPlan = planning;

  function markPages(on: boolean) {
    const r = expand(parseRanges(pages));
    if (!r.length) return;
    markBook(b.id, r, on);
    setPages('');
    toast(`${rangeText(r)}쪽 ${on ? '체크' : '해제'}했어요`);
  }

  return (
    <div className="st-page">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go('/books')} aria-label="문제집 목록">
          ‹
        </button>
        <h2>
          <SubjectDot id={b.subjectId} d={d} /> {b.name}
        </h2>
        <Menu
          items={[
            { label: v ? '계획 고치기' : '계획 세우기', onClick: () => setPlanning(true), hidden: showPlan },
            { label: '목차 고치기', onClick: () => setEditing(true) },
            {
              label: '문제집 지우기',
              danger: true,
              onClick: () => {
                if (!confirmDelete(`「${b.name}」`)) return;
                for (const p of alive(d.plans)) if (p.targetId === b.id) remove('plans', p.id);
                remove('books', b.id);
                go('/books');
              },
            },
          ]}
        />
      </div>

      <section className="st-card">
        <div className="st-big-progress">
          <div>
            <b>{all.length ? Math.round((n / all.length) * 100) : 0}%</b>
            <span>
              {n} / {all.length}쪽
            </span>
          </div>
          <Bar value={n} max={all.length} label="푼 쪽" />
        </div>
        {v && (
          <>
            <p className="st-sub">
              {v.sched.today.length ? (
                <>
                  오늘 <b>p.{rangeText(v.sched.today)}</b> ({v.sched.today.length}쪽)
                </>
              ) : v.plan.start > today ? (
                `${shortDate(v.plan.start)}부터 시작`
              ) : (
                '오늘은 배정 없음'
              )}
              {v.sched.end && ` · ${longDate(v.sched.end)}까지 남은 ${v.sched.remaining.length}쪽`}
              {pace !== 0 && (
                <span className={pace > 0 ? 'ok' : 'bad'}>
                  {' '}
                  · 계획보다 {Math.abs(pace)}쪽 {pace > 0 ? '앞섬' : '밀림'}
                </span>
              )}
            </p>
            {v.sched.warning && <PlanWarning p={v} />}
            {(() => {
              const f = forecastFor(d, v, today);
              return <p className={`st-forecast ${f.state === 'short' ? 'bad' : ''}`}>끝내기 예측: {forecastText(f, '쪽', shortDate)}</p>;
            })()}
          </>
        )}
        {!v && !showPlan && (
          <p className="st-sub">
            아직 계획 없이 등록만 해 둔 문제집이에요.{' '}
            <button className="st-link" onClick={() => setPlanning(true)}>
              계획 세우기
            </button>
          </p>
        )}
        {reserved.size > 0 && <p className="st-hint">과외 숙제로 잡힌 p.{rangeText([...reserved])}는 이 계획에서 빠져요.</p>}
      </section>

      {showPlan && (
        <section className="st-card">
          <h3 className="st-h">{v ? '계획 고치기' : '계획 세우기'}</h3>
          <PlanForm target="book" targetId={b.id} units={b.units} done={done} reserved={reserved} existing={v?.plan} today={today} onDone={() => setPlanning(false)} />
        </section>
      )}

      {v && <Calendar v={v} today={today} />}

      <section className="st-card">
        <h3 className="st-h">단원</h3>
        <div className="st-units">
          {b.units.map((u, i) => {
            const ps = expand([[u.from, u.to]]);
            const k = ps.filter((p) => done.has(p)).length;
            const full = k === ps.length;
            return (
              <div key={i} className={`st-unitrow ${u.skip ? 'skip' : ''}`}>
                <button className={`st-check ${full ? 'on' : ''}`} aria-pressed={full} aria-label={`${u.name} 다 했어요`} onClick={() => markBook(b.id, ps, !full)}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M5 12.5l4.2 4.2L19 7" />
                  </svg>
                </button>
                <span className="st-unitname">{u.name}</span>
                <small>
                  p.{u.from}~{u.to}
                  {u.skip && ' · 계획에서 뺌'}
                </small>
                <div className="st-mini">
                  <Bar value={k} max={ps.length} label={`${u.name} 푼 쪽`} />
                </div>
              </div>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // 적은 쪽을 이미 다 했으면 해제, 아니면 체크
            const all = expand(parseRanges(pages));
            markPages(!(all.length > 0 && all.every((p) => done.has(p))));
          }}
        >
          <input className="st-input" placeholder="쪽 직접 체크 (예: 12-20, 25) · 이미 한 쪽이면 해제" value={pages} onChange={(e) => setPages(e.target.value)} aria-label="쪽 직접 체크" />
        </form>
        {done.size > 0 && <p className="st-hint">한 쪽: {rangeText(compress(done))}</p>}
      </section>
    </div>
  );
}

/** 이번 달·다음 달 달력: 날마다 배정 쪽 수 */
function Calendar({ v, today }: { v: NonNullable<ReturnType<typeof planViews>[number]>; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const map = new Map<string, { n: number; items: number[]; weight: number }>();
  if (v.sched.today.length) map.set(today, { n: v.sched.today.length, items: v.sched.today, weight: 1 });
  for (const x of v.sched.days) map.set(x.date, { n: x.items.length, items: x.items, weight: x.weight });
  const end = v.sched.end && v.sched.end > today ? v.sched.end : addDays(today, 27);
  const from = weekStart(today);
  const to = addDays(weekStart(end), 6);
  const days = daysBetween(from, to > addDays(from, 69) ? addDays(from, 69) : to);
  const sel = open ? map.get(open) : null;
  return (
    <section className="st-card">
      <h3 className="st-h">달력</h3>
      <div className="st-cal">
        {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
          <b key={w} className="st-cal-wd">
            {w}
          </b>
        ))}
        {days.map((day) => {
          const x = map.get(day);
          const past = day < today;
          const cls = [day === today ? 'today' : '', past ? 'past' : '', x?.weight === 0 ? 'rest' : '', x && x.weight > 0 && x.weight < 1 ? 'tutor' : '', day === v.sched.end ? 'end' : ''].join(' ');
          return (
            <button key={day} className={`st-cal-day ${cls}`} onClick={() => setOpen(day === open ? null : day)} aria-label={`${shortDate(day)} ${x?.n ?? 0}쪽`}>
              <span>{Number(day.slice(8))}</span>
              {x && x.n > 0 && <i>{x.n}</i>}
            </button>
          );
        })}
      </div>
      <p className="st-hint">{open ? (sel && sel.n ? `${shortDate(open)}: p.${rangeText(sel.items)}` : `${shortDate(open)}: 배정 없음`) : '날짜를 누르면 그날 쪽이 보여요 · 흐린 칸: 쉬는 날 · 점선: 과외 날 · 굵은 테두리: 마지막 날'}</p>
    </section>
  );
}
