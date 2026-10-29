// 과외 · 숙제 (설계 §6)
import { useState } from 'react';
import { addDays, shortDate, WEEKDAYS } from './dates';
import { alive, newId, type HwItem, type Homework, type Id, type Tutor } from './model';
import { clampRange, expand, rangeText } from './pages';
import { homeworkViews } from './select';
import { put, remove, useStudy } from './store';
import { hasClass, homeworkDue, nextClass } from './tutor';
import { markHwPages, patchHwItem } from './actions';
import { Check, confirmDelete, Empty, Field, go, Icon, Menu, Sheet, SubjectDot, SubjectPicker, toast, useToday, WeekdayPicker, tap } from './ui';

/** sub: 'new' 이면 과외 등록 창, 'hw' 면 숙제 넣기 창을 연다 (「＋」에서 올 때) */
export function Tutors({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const tutors = alive(d.tutors);
  const [editTutor, setEditTutor] = useState<Tutor | 'new' | null>(() => (sub === 'new' || (sub === 'hw' && !tutors.length) ? 'new' : null));
  const [hwFor, setHwFor] = useState<{ tutor: Tutor; hw?: Homework } | null>(() => (sub === 'hw' && tutors.length === 1 ? { tutor: tutors[0] } : null));
  const [pickTutor, setPickTutor] = useState(sub === 'hw' && tutors.length > 1);
  const closeTo = (f: () => void) => () => {
    f();
    if (sub) go('/tutor');
  };
  const views = homeworkViews(d, today);
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>과외</h2>
      </div>
      {!tutors.length && (
        <Empty icon="🧑‍🏫" title="등록한 과외가 없어요">
          <p>과외 요일을 넣으면 숙제 마감이 자동으로 「다음 수업일」이 되고, 수업 있는 날은 문제집 분량을 줄여 드려요.</p>
          <button className="btn btn-primary" onClick={() => setEditTutor('new')}>
            과외 등록
          </button>
        </Empty>
      )}
      {tutors.map((t) => {
        const next = nextClass(t, today, true);
        const mine = views.filter((v) => v.hw.tutorId === t.id);
        const open = mine.filter((v) => !v.finished || v.due >= today);
        const past = mine.filter((v) => v.finished && v.due < today).slice(-5).reverse();
        const forNext = open.filter((v) => v.due === next);
        const questions = open.flatMap((v) => v.items.filter((i) => i.item.question).map((i) => i.item.question!));
        return (
          <section key={t.id} className="st-card">
            <div className="st-tutor-head">
              <div>
                <h3>
                  <SubjectDot id={t.subjectId} d={d} /> {t.name}
                </h3>
                <p className="st-sub">
                  {t.weekdays.length ? t.weekdays.map((w) => WEEKDAYS[w]).join('·') : '요일 없음'}
                  {t.time && ` ${t.time}`}
                  {next && (
                    <>
                      {' '}
                      · 다음 수업 <b>{next === today ? '오늘' : shortDate(next)}</b>
                      {forNext.length > 0 && ` — 숙제 ${forNext.reduce((a, v) => a + v.items.length, 0)}개 중 ${forNext.reduce((a, v) => a + v.items.filter((i) => i.finished).length, 0)}개 완료`}
                    </>
                  )}
                </p>
              </div>
              <Menu
                items={[
                  { label: '숙제 받았어요', onClick: () => setHwFor({ tutor: t }) },
                  { label: '과외 고치기 (요일·휴강·보강)', onClick: () => setEditTutor(t) },
                ]}
              />
            </div>
            {questions.length > 0 && (
              <div className="st-questions">
                <b>다음 수업에서 물어볼 것</b>
                <ul>
                  {questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {open.map((v) => (
              <div key={v.hw.id} className={`st-hw ${v.due < today && !v.finished ? 'late' : ''}`}>
                {/* 숙제 머리줄을 누르면 고치기 */}
                <div className="st-hw-head st-tap" title="숙제 고치기" {...tap(() => setHwFor({ tutor: t, hw: v.hw }))}>
                  <span className={`st-pill ${v.due < today && !v.finished ? 'bad' : v.due === today ? 'warn' : ''}`}>마감 {shortDate(v.due)}</span>
                  <small className="st-muted">{shortDate(v.hw.given)}에 받음</small>
                </div>
                {v.items.map((iv) => (
                  <HwLine key={iv.item.id} hw={v.hw} iv={iv} />
                ))}
                {v.hw.note && <p className="st-hint">{v.hw.note}</p>}
              </div>
            ))}
            {past.length > 0 && (
              <details className="st-more">
                <summary>지난 숙제</summary>
                {past.map((v) => (
                  <p key={v.hw.id} className="st-muted">
                    {shortDate(v.due)} · {v.items.map((i) => (i.item.kind === 'pages' ? `${i.item.bookName ?? d.books[i.item.bookId ?? '']?.name ?? ''} p.${i.item.range && rangeText([i.item.range])}` : i.item.text)).join(', ')} ✓
                  </p>
                ))}
              </details>
            )}
          </section>
        );
      })}
      {editTutor && <TutorSheet tutor={editTutor === 'new' ? undefined : editTutor} today={today} onClose={closeTo(() => setEditTutor(null))} />}
      {hwFor && <HomeworkSheet tutor={hwFor.tutor} hw={hwFor.hw} today={today} onClose={closeTo(() => setHwFor(null))} />}
      {pickTutor && (
        <Sheet title="어느 과외 숙제인가요?" onClose={closeTo(() => setPickTutor(false))}>
          <div className="st-addlist">
            {tutors.map((t) => (
              <button
                key={t.id}
                className="st-addrow"
                onClick={() => {
                  setPickTutor(false);
                  setHwFor({ tutor: t });
                }}
              >
                <span>
                  <b>{t.name}</b>
                  <small>{t.weekdays.map((w) => WEEKDAYS[w]).join('·')}</small>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function HwLine({ hw, iv }: { hw: Homework; iv: ReturnType<typeof homeworkViews>[number]['items'][number] }) {
  const d = useStudy();
  const { item } = iv;
  // 줄을 누르면 질문 메모 칸이 나타난다
  const [q, setQ] = useState<string | null>(null);
  const title = item.kind === 'pages' ? `${item.bookName ?? d.books[item.bookId ?? '']?.name ?? ''} p.${item.range ? rangeText([item.range]) : ''}` : item.text;
  return (
    <div className="st-item">
      {item.kind === 'pages' ? (
        <Check on={iv.finished} label="다 했어요" onClick={() => markHwPages(hw, item, iv.finished ? expand(item.range ? [item.range] : []) : iv.remaining, !iv.finished)} />
      ) : (
        <Check on={!!item.done} label="다 했어요" onClick={() => patchHwItem(hw.id, item.id, { done: !item.done })} />
      )}
      <div className="st-item-main" {...tap(() => q === null && setQ(item.question ?? ''))}>
        <div className={`st-item-title ${iv.finished ? 'done' : ''}`}>{title}</div>
        <div className="st-item-sub">
          {item.kind === 'pages' && !iv.finished && (iv.today.length ? `오늘 p.${rangeText(iv.today)} · ` : '') + `남은 ${iv.remaining.length}쪽`}
          {item.question && ` · 질문: ${item.question}`}
        </div>
        {q !== null && (
          <form
            className="st-inline"
            onSubmit={(e) => {
              e.preventDefault();
              patchHwItem(hw.id, item.id, { question: q.trim() || undefined });
              setQ(null);
            }}
          >
            <input
              autoFocus
              className="st-input sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setQ(null)}
              onClick={(e) => e.stopPropagation()}
              placeholder="다음 수업에서 물어볼 것 (예: p.37 5번) · Enter"
              aria-label="질문 메모"
            />
          </form>
        )}
      </div>
    </div>
  );
}

function TutorSheet({ tutor, today, onClose }: { tutor?: Tutor; today: string; onClose: () => void }) {
  const d = useStudy();
  const [name, setName] = useState(tutor?.name ?? '');
  const [subjectId, setSubjectId] = useState(tutor?.subjectId ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(tutor?.weekdays ?? []);
  const [time, setTime] = useState(tutor?.time ?? '');
  const [cancelled, setCancelled] = useState<string[]>(tutor?.cancelled ?? []);
  const [extra, setExtra] = useState<string[]>(tutor?.extra ?? []);
  const [pick, setPick] = useState(today);
  const upcoming = Array.from({ length: 28 }, (_, i) => addDays(today, i)).filter((x) => hasClass({ weekdays, cancelled: [], extra }, x));
  function save() {
    if (!name.trim() || !subjectId) return;
    put('tutors', { id: tutor?.id ?? newId(), name: name.trim(), subjectId, weekdays, time: time || undefined, cancelled, extra });
    onClose();
  }
  return (
    <Sheet title={tutor ? '과외 고치기' : '과외 등록'} onClose={onClose}>
      <div className="st-form">
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 수학 과외" />
        </Field>
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={(id) => (setSubjectId(id), !name && setName(`${d.subjects[id]?.name ?? ''} 과외`))} />
        </Field>
        <Field group label="수업 요일">
          <WeekdayPicker value={weekdays} onChange={setWeekdays} label="수업 요일" />
        </Field>
        <Field label="수업 시각 (선택)">
          <input className="st-input xs" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field group label="휴강 · 보강" hint="다가오는 수업을 누르면 휴강, 날짜를 골라 보강을 넣어요">
          <div className="st-chips">
            {upcoming.map((x) => (
              <button key={x} type="button" className={`st-chip ${cancelled.includes(x) ? 'off' : 'on'}`} onClick={() => setCancelled(cancelled.includes(x) ? cancelled.filter((c) => c !== x) : [...cancelled, x])}>
                {shortDate(x)}
                {cancelled.includes(x) ? ' 휴강' : ''}
                {extra.includes(x) ? ' 보강' : ''}
              </button>
            ))}
          </div>
          <div className="st-inline">
            <input className="st-input sm" type="date" value={pick} min={today} onChange={(e) => setPick(e.target.value)} />
            <button type="button" className="btn btn-sm" onClick={() => !extra.includes(pick) && setExtra([...extra, pick].sort())}>
              보강 넣기
            </button>
          </div>
        </Field>
        <div className="st-row end">
          {tutor && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                const hws = alive(d.homework).filter((h) => h.tutorId === tutor.id);
                if (!confirmDelete(`「${tutor.name}」`, hws.length ? `이 과외의 숙제 ${hws.length}개도 함께 지워요.` : '')) return;
                for (const h of hws) remove('homework', h.id);
                remove('tutors', tutor.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!name.trim() || !subjectId} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

interface Draft {
  id: Id;
  kind: HwItem['kind'];
  bookId: string;
  bookName: string;
  pages: string;
  text: string;
  wordListId: string;
}

const toDraft = (i: HwItem): Draft => ({ id: i.id, kind: i.kind, bookId: i.bookId ?? '', bookName: i.bookName ?? '', pages: i.range ? `${i.range[0]}-${i.range[1]}` : '', text: i.text ?? '', wordListId: i.wordListId ?? '' });
const blank = (): Draft => ({ id: newId(), kind: 'pages', bookId: '', bookName: '', pages: '', text: '', wordListId: '' });

function HomeworkSheet({ tutor, hw, today, onClose }: { tutor: Tutor; hw?: Homework; today: string; onClose: () => void }) {
  const d = useStudy();
  const books = alive(d.books).sort((a, b) => Number(b.subjectId === tutor.subjectId) - Number(a.subjectId === tutor.subjectId));
  const lists = alive(d.wordLists);
  const [items, setItems] = useState<Draft[]>(hw ? hw.items.map(toDraft) : [{ ...blank(), bookId: books[0]?.subjectId === tutor.subjectId ? books[0].id : '' }]);
  const autoDue = homeworkDue({ given: hw?.given ?? today, due: hw?.due ?? today, dueManual: false }, tutor);
  const [manual, setManual] = useState(hw?.dueManual ?? false);
  const [due, setDue] = useState(hw?.due ?? autoDue);
  const [includeDue, setIncludeDue] = useState(hw?.includeDue ?? false);
  const [note, setNote] = useState(hw?.note ?? '');
  const set = (i: number, patch: Partial<Draft>) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  function save() {
    const out: HwItem[] = [];
    for (const x of items) {
      const prev = hw?.items.find((i) => i.id === x.id);
      if (x.kind === 'pages') {
        const m = x.pages.match(/^\s*(\d{1,12})\s*(?:[-~]\s*(\d{1,12}))?\s*$/);
        const range = m && clampRange(Number(m[1]), Number(m[2] ?? m[1]));
        if (!range) continue;
        out.push({ ...prev, id: x.id, kind: 'pages', bookId: x.bookId || undefined, bookName: x.bookId ? undefined : x.bookName.trim() || '문제집', range });
      } else if (x.kind === 'words') {
        const l = d.wordLists[x.wordListId];
        if (!l) continue;
        out.push({ ...prev, id: x.id, kind: 'words', wordListId: l.id, text: x.text.trim() || `${l.name} 외우기` });
      } else if (x.text.trim()) out.push({ ...prev, id: x.id, kind: 'text', text: x.text.trim() });
    }
    if (!out.length) return toast('숙제 내용을 넣어 주세요');
    const at = Date.now();
    for (const it of out) it.at = at;
    put('homework', { id: hw?.id ?? newId(), tutorId: tutor.id, given: hw?.given ?? today, due: manual ? due : autoDue, dueManual: manual, includeDue, items: out, note: note.trim() });
    onClose();
  }

  return (
    <Sheet title={`${tutor.name} 숙제`} onClose={onClose} wide>
      <div className="st-form">
        {items.map((x, i) => (
          <div key={x.id} className="st-hw-edit">
            <div className="st-seg sm">
              {(['pages', 'text', 'words'] as const).map((k) => (
                <button key={k} type="button" className={x.kind === k ? 'on' : ''} onClick={() => set(i, { kind: k })}>
                  {k === 'pages' ? '문제집 쪽' : k === 'text' ? '글로 쓰기' : '단어'}
                </button>
              ))}
            </div>
            {x.kind === 'pages' && (
              <div className="st-inline wrap">
                <select className="st-input sm" value={x.bookId} onChange={(e) => set(i, { bookId: e.target.value })} aria-label="문제집">
                  <option value="">(내 문제집 아님)</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {!x.bookId && <input className="st-input sm" placeholder="책 이름" value={x.bookName} onChange={(e) => set(i, { bookName: e.target.value })} />}
                <input className="st-input xs" placeholder="37-40" value={x.pages} onChange={(e) => set(i, { pages: e.target.value })} aria-label="쪽" />
              </div>
            )}
            {x.kind === 'text' && <input className="st-input" placeholder="예: 오답 정리, 단어 50개 외우기" value={x.text} onChange={(e) => set(i, { text: e.target.value })} />}
            {x.kind === 'words' && (
              <div className="st-inline wrap">
                <select className="st-input sm" value={x.wordListId} onChange={(e) => set(i, { wordListId: e.target.value })} aria-label="단어 목록">
                  <option value="">단어 목록 고르기</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <input className="st-input sm" placeholder="예: Day 5~6" value={x.text} onChange={(e) => set(i, { text: e.target.value })} />
                {!lists.length && <span className="st-hint">단어 탭에서 목록을 먼저 만들어 주세요</span>}
              </div>
            )}
            {items.length > 1 && (
              <button type="button" className="st-x" aria-label="이 줄 빼기" onClick={() => setItems(items.filter((_, k) => k !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setItems([...items, blank()])}>
          ＋ 한 줄 더
        </button>
        <Field group label="마감" hint={manual ? undefined : `다음 수업일 ${shortDate(autoDue)} (휴강을 넣으면 따라 바뀌어요)`}>
          <div className="st-inline wrap">
            <label className="st-toggle">
              <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> 직접 정하기
            </label>
            {manual && <input className="st-input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
          </div>
        </Field>
        <label className="st-toggle">
          <input type="checkbox" checked={includeDue} onChange={(e) => setIncludeDue(e.target.checked)} /> 수업 날 당일에도 나눠 넣기 (기본: 전날까지)
        </label>
        <Field label="메모 (선택)">
          <input className="st-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="st-row end">
          {hw && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete('이 숙제')) return;
                remove('homework', hw.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" onClick={save}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}
