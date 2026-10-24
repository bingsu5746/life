// 문제집: 목록 · 넣기(목차 붙여넣기·사진) · 문제집 하나(계획·달력·진도) (설계 §4~5)
import { useMemo, useRef, useState } from 'react';
import { addDays, daysBetween, longDate, shortDate, weekStart } from './dates';
import { alive, newId, type Book, type Unit } from './model';
import { compress, expand, rangeText } from './pages';
import { paceOf } from './plan';
import { bookDone, planCtx, planViews, reservedPages } from './select';
import { put, remove, useStudy, useWords } from './store';
import { parseToc, tocText, type TocRow } from './toc';
import { markBook } from './actions';
import { PlanForm } from './PlanForm';
import { PlanWarning } from './Today';
import { Bar, confirmDelete, Empty, Field, go, SubjectDot, SubjectPicker, SubjectTag, toast, useToday } from './ui';

export function Books({ id }: { id?: string }) {
  if (id === 'new') return <BookEditor onDone={(b) => go(b ? `/books/${b}` : '/books')} />;
  if (id) return <BookDetail id={id} />;
  return <BookList />;
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
        <button className="btn btn-primary" onClick={() => go('/books/new')}>
          ＋ 문제집 넣기
        </button>
      </div>
      {!books.length && (
        <Empty icon="📖" title="아직 넣은 문제집이 없어요">
          <p>목차를 붙여 넣거나 목차 사진을 찍으면, 시험까지 하루에 풀 페이지를 정해 드려요.</p>
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
                <Bar value={n} max={all.length} color={color} />
                <small>
                  {n}/{all.length}쪽 ({all.length ? Math.round((n / all.length) * 100) : 0}%)
                </small>
                {v ? (
                  <small className={v.sched.warning ? 'bad' : ''}>
                    {v.sched.today.length ? `오늘 p.${rangeText(v.sched.today)}` : v.sched.remaining.length ? '오늘은 쉬는 날' : '계획 끝'}
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

/** 문제집 넣기·고치기: 이름 · 과목 · 목차 */
function BookEditor({ book, onDone }: { book?: Book; onDone: (id?: string) => void }) {
  const [name, setName] = useState(book?.name ?? '');
  const [subjectId, setSubjectId] = useState(book?.subjectId ?? '');
  const [text, setText] = useState(book ? tocText(book.units) : '');
  const [last, setLast] = useState('');
  const [skips, setSkips] = useState<Set<string>>(() => new Set(book?.units.filter((u) => u.skip).map((u) => u.name)));
  const [ocr, setOcr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rows: TocRow[] = useMemo(() => parseToc(text, Number(last) || undefined), [text, last]);
  const good = rows.filter((r) => !r.problem);
  const needsLast = rows.some((r) => r.problem === '끝 페이지를 알려 주세요');

  async function readPhotos(files: FileList) {
    const { readImageText } = await import('../../lib/ocr');
    let all = '';
    for (const [i, f] of [...files].entries()) {
      setOcr(`사진 ${i + 1}/${files.length} 읽는 중…`);
      try {
        all += (await readImageText(f, (stage, r) => setOcr(`사진 ${i + 1}/${files.length} · ${stage === 'recognizing text' ? '글자 읽는 중' : '준비 중'} ${Math.round(r * 100)}%`))) + '\n';
      } catch {
        setOcr(null);
        toast('사진을 읽지 못했어요. 인터넷 연결을 확인하거나 직접 입력해 주세요');
        return;
      }
    }
    setOcr(null);
    setText((t) => (t.trim() ? t.trim() + '\n' : '') + all.trim());
    toast('읽은 글을 넣었어요. 틀린 곳을 고쳐 주세요');
  }

  function save() {
    if (!name.trim() || !subjectId || !good.length) return;
    const units: Unit[] = good.map((r) => ({ name: r.name, from: r.from, to: r.to, skip: skips.has(r.name) || undefined }));
    const id = book?.id ?? newId();
    put('books', { ...(book ?? { done: [], undone: [] }), id, name: name.trim(), subjectId, units });
    onDone(id);
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
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 쎈 수학 상" />
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
            📷 목차 사진으로 채우기
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && void readPhotos(e.target.files)} />
          {ocr && <span className="st-muted">{ocr}</span>}
        </div>
        <p className="st-hint">사진은 이 기기 안에서만 읽고 저장하지 않아요. 처음 쓸 때 글자 인식 자료를 인터넷에서 받아요.</p>
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
                        checked={skips.has(r.name)}
                        onChange={() => {
                          const n = new Set(skips);
                          n.has(r.name) ? n.delete(r.name) : n.add(r.name);
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
          <button className="btn btn-primary" disabled={!name.trim() || !subjectId || !good.length} onClick={save}>
            저장하고 계획 세우기
          </button>
        </div>
      </div>
    </div>
  );
}

function BookDetail({ id }: { id: string }) {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);
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
  const color = d.subjects[b.subjectId]?.color;
  const pace = v ? paceOf(v.plan, v.target, planCtx(d, today)) : 0;
  const showPlan = planning || (!v && !alive(d.plans).some((p) => p.targetId === b.id));

  function markPages(on: boolean) {
    const r = pages
      .split(/[,\s]+/)
      .map((x) => x.match(/^(\d+)(?:[-~](\d+))?$/))
      .filter(Boolean)
      .flatMap((m) => expand([[Number(m![1]), Number(m![2] ?? m![1])]]));
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
        <div className="st-row">
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            목차 고치기
          </button>
          <button
            className="btn btn-sm st-danger"
            onClick={() => {
              if (!confirmDelete(`「${b.name}」`)) return;
              for (const p of alive(d.plans)) if (p.targetId === b.id) remove('plans', p.id);
              remove('books', b.id);
              go('/books');
            }}
          >
            지우기
          </button>
        </div>
      </div>

      <section className="st-card">
        <div className="st-big-progress">
          <div>
            <b>{all.length ? Math.round((n / all.length) * 100) : 0}%</b>
            <span>
              {n} / {all.length}쪽
            </span>
          </div>
          <Bar value={n} max={all.length} color={color} />
        </div>
        {v && (
          <>
            <p className="st-sub">
              {v.sched.today.length ? (
                <>
                  오늘 <b>p.{rangeText(v.sched.today)}</b> ({v.sched.today.length}쪽)
                </>
              ) : (
                '오늘은 배정 없음'
              )}
              {v.sched.end && ` · ${longDate(v.sched.end)}까지 남은 ${v.sched.remaining.length}쪽`}
              {pace !== 0 && <span className={pace > 0 ? 'ok' : 'bad'}> · 계획보다 {Math.abs(pace)}쪽 {pace > 0 ? '앞섬' : '밀림'}</span>}
            </p>
            {v.sched.warning && <PlanWarning p={v} />}
            {!planning && (
              <button className="btn btn-sm" onClick={() => setPlanning(true)}>
                계획 고치기
              </button>
            )}
          </>
        )}
        {reserved.size > 0 && <p className="st-hint">과외 숙제로 잡힌 p.{rangeText([...reserved])}는 이 계획에서 빠져요.</p>}
      </section>

      {showPlan && (
        <section className="st-card">
          <h3 className="st-h">{v ? '계획 고치기' : '계획 세우기'}</h3>
          <PlanForm target="book" targetId={b.id} units={b.units} done={done} reserved={reserved} existing={v?.plan} today={today} onDone={() => setPlanning(false)} />
        </section>
      )}

      {v && <Calendar v={v} today={today} color={color} />}

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
                  <Bar value={k} max={ps.length} color={color} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="st-inline wrap">
          <input className="st-input sm" placeholder="쪽 직접: 12-20, 25" value={pages} onChange={(e) => setPages(e.target.value)} />
          <button className="btn btn-sm" onClick={() => markPages(true)}>
            체크
          </button>
          <button className="btn btn-sm" onClick={() => markPages(false)}>
            해제
          </button>
        </div>
        {done.size > 0 && <p className="st-hint">한 쪽: {rangeText(compress(done))}</p>}
      </section>
    </div>
  );
}

/** 이번 달·다음 달 달력: 날마다 배정 쪽 수 */
function Calendar({ v, today, color }: { v: NonNullable<ReturnType<typeof planViews>[number]>; today: string; color?: string }) {
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
              {x && x.n > 0 && <i style={{ background: color }}>{x.n}</i>}
            </button>
          );
        })}
      </div>
      <p className="st-hint">
        {open ? (sel && sel.n ? `${shortDate(open)}: p.${rangeText(sel.items)}` : `${shortDate(open)}: 배정 없음`) : '날짜를 누르면 그날 쪽이 보여요 · 흐린 칸: 쉬는 날 · 점선: 과외 날 · 굵은 테두리: 마지막 날'}
      </p>
    </section>
  );
}
