// 복습: 오답 노트 · 암기 카드 (설계 §9.1~9.3)
import { useEffect, useMemo, useRef, useState } from 'react';
import { shortDate } from './dates';
import { alive, newId, REASONS, type CardDeck, type MemoCard, type NoteComment, type WrongNote, type WrongReason } from './model';
import { answer, dueText, dueToday } from './review';
import { blanksToday, cardsToday } from './select';
import { getStudy, put, putMany, remove, useStudy } from './store';
import { addPhoto, photoBlob, photoUrl, removePhoto } from './photos';
import { BlankRun, Blanks } from './Blanks';
import { requeue } from './wordSession';
import { Bar, confirmDelete, Empty, Field, go, Menu, Sheet, SubjectDot, SubjectPicker, SubjectTag, subjectsOf, toast, useToday, tap } from './ui';
import { SwipeCard } from './SwipeCard';
import { Passages } from './Passages';
import { dueAgain } from './passages';
import { guessNoteSubject, isCareless, mistakePatterns } from './mistakes';
import { loadTimer } from './timerStore';

export function Review({ sub }: { sub?: string }) {
  if (sub === 'redo' || sub?.startsWith('redo?')) return <NoteRun />;
  if (sub?.startsWith('cards-run')) return <CardRun />;
  if (sub?.startsWith('blank-run-')) return <BlankRun id={sub.slice(10)} />;
  if (sub?.startsWith('deck-')) return <DeckView id={sub.slice(5)} />;
  return <ReviewHome tab={sub === 'cards' || sub === 'new-deck' ? 'cards' : sub === 'blank' || sub === 'new-blank' ? 'blank' : sub === 'passages' || sub === 'new-passage' || sub?.startsWith('passage-') ? 'passages' : 'notes'} sub={sub} />;
}

/** sub: 'new-note' · 'new-deck' 이면 바로 넣기 창 (「＋」에서 올 때) */
function ReviewHome({ tab, sub }: { tab: 'notes' | 'cards' | 'blank' | 'passages'; sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const notesDue = dueToday(alive(d.notes), today);
  const cardsDue = cardsToday(d, today);
  const blanksDue = blanksToday(d, today).length;
  const passDue = alive(d.passages).filter((x) => dueAgain(x, today)).length;
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>복습</h2>
        <div className="st-seg">
          <button className={tab === 'notes' ? 'on' : ''} onClick={() => go('/review')}>
            오답 노트 {notesDue.length > 0 && <b className="st-count">{notesDue.length}</b>}
          </button>
          <button className={tab === 'cards' ? 'on' : ''} onClick={() => go('/review/cards')}>
            암기 카드 {cardsDue.length > 0 && <b className="st-count">{cardsDue.length}</b>}
          </button>
          <button className={tab === 'blank' ? 'on' : ''} onClick={() => go('/review/blank')}>
            백지 복습 {blanksDue > 0 && <b className="st-count">{blanksDue}</b>}
          </button>
          <button className={tab === 'passages' ? 'on' : ''} onClick={() => go('/review/passages')}>
            지문 {passDue > 0 && <b className="st-count">{passDue}</b>}
          </button>
        </div>
      </div>
      {tab === 'passages' ? (
        <Passages open={sub === 'new-passage' ? 'new' : sub?.startsWith('passage-') ? sub.slice(8) : undefined} />
      ) : tab === 'notes' ? (
        <Notes today={today} adding={sub === 'new-note'} />
      ) : tab === 'cards' ? (
        <Cards today={today} adding={sub === 'new-deck'} />
      ) : (
        <Blanks today={today} adding={sub === 'new-blank'} />
      )}
    </div>
  );
}

// ===== 오답 노트 =====

function Notes({ today, adding }: { today: string; adding?: boolean }) {
  const d = useStudy();
  const [edit, setEdit] = useState<WrongNote | 'new' | null>(adding ? 'new' : null);
  const [subject, setSubject] = useState('');
  const [show, setShow] = useState<'open' | 'resolved' | 'comments'>('open');
  const all = alive(d.notes);
  const due = dueToday(all, today);
  const list = all
    .filter((n) => (show === 'open' ? !n.learned : n.learned))
    .filter((n) => !subject || n.subjectId === subject)
    .sort((a, b) => a.due.localeCompare(b.due) || b.created - a.created);
  const open = all.filter((n) => !n.learned && (!subject || n.subjectId === subject));
  const reasons = (Object.keys(REASONS) as WrongReason[]).map((r) => ({ r, n: open.filter((x) => x.reason === r).length })).filter((x) => x.n);
  const totalR = reasons.reduce((a, x) => a + x.n, 0);
  return (
    <>
      <section className="st-card st-learn-cta">
        <div>
          <p className="st-sub">
            오늘 다시 풀 문제 <b>{due.length}</b> · 해결 안 된 오답 {all.filter((n) => !n.learned).length} · 해결 {all.filter((n) => n.learned).length}
          </p>
          {totalR > 0 && (
            <div className="st-reasons">
              {reasons
                .sort((a, b) => b.n - a.n)
                .map((x) => (
                  <span key={x.r}>
                    {REASONS[x.r]} <b>{Math.round((x.n / totalR) * 100)}%</b>
                  </span>
                ))}
            </div>
          )}
        </div>
        {due.length > 0 && (
          <button className="btn btn-primary btn-lg" onClick={() => go('/review/redo')}>
            다시 풀기 ({due.length})
          </button>
        )}
      </section>
      <Patterns subject={subject} onPick={setSubject} />
      <div className="st-inline wrap">
        <div className="st-seg sm">
          <button className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>
            해결 전
          </button>
          <button className={show === 'resolved' ? 'on' : ''} onClick={() => setShow('resolved')}>
            해결됨
          </button>
          <button className={show === 'comments' ? 'on' : ''} onClick={() => setShow('comments')}>
            한마디 모아 보기
          </button>
        </div>
        <select className="st-input sm" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목">
          <option value="">모든 과목</option>
          {subjectsOf(d).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {show === 'comments' ? (
        <CommentList subject={subject} onOpen={setEdit} />
      ) : !list.length ? (
        <Empty icon="📝" title={show === 'open' ? '오답이 없어요' : '아직 해결한 오답이 없어요'}>
          <p>문제집을 체크할 때 「틀린 번호」를 쓰거나, 사진과 함께 넣을 수 있어요.</p>
          {show === 'open' && (
            <button className="btn btn-primary" onClick={() => setEdit('new')}>
              오답 넣기
            </button>
          )}
        </Empty>
      ) : (
        <div className="st-notes">
          {list.map((n) => (
            <button key={n.id} className="st-note-card" onClick={() => setEdit(n)}>
              <div className="st-note-top">
                <SubjectTag id={n.subjectId} d={d} />
                <small className="st-muted">{source(n)}</small>
                <small className={n.due <= today && !n.learned ? 'ok' : 'st-muted'}>{dueText(n, today)}</small>
              </div>
              {n.photos[0] && <Photo id={n.photos[0]} small />}
              {n.question && <p>{n.question}</p>}
              {n.comments?.length ? <p className="nt-last">{n.comments[n.comments.length - 1].text}</p> : null}
              {n.reason && <span className="st-pill">{REASONS[n.reason]}</span>}
              {n.wrong > 1 && <small className="bad"> ✕{n.wrong}</small>}
            </button>
          ))}
        </div>
      )}
      {edit && <NoteSheet note={edit === 'new' ? undefined : edit} today={today} onClose={() => (setEdit(null), adding && go('/review'))} />}
    </>
  );
}

/** 모든 오답의 한마디를 최근 것부터 (시험 전에 훑어보기) */
function CommentList({ subject, onOpen }: { subject: string; onOpen: (n: WrongNote) => void }) {
  const d = useStudy();
  const rows = alive(d.notes)
    .filter((n) => !subject || n.subjectId === subject)
    .flatMap((n) => (n.comments ?? []).map((c) => ({ n, c })))
    .sort((a, b) => (b.c.at ?? 0) - (a.c.at ?? 0) || b.c.date.localeCompare(a.c.date));
  if (!rows.length)
    return (
      <Empty icon="💬" title="아직 남긴 한마디가 없어요">
        <p>오답을 열거나 다시 풀 때 「나에게 한마디」를 남기면 여기에 모여요. 시험 전에 훑어보면 같은 실수를 줄일 수 있어요.</p>
      </Empty>
    );
  return (
    <section className="st-card">
      {rows.map(({ n, c }) => (
        <div key={c.id} className="st-item st-tap" {...tap(() => onOpen(n))}>
          <SubjectDot id={n.subjectId} d={d} />
          <div className="st-item-main">
            <div className="st-item-title">{c.text}</div>
            <div className="st-item-sub">
              {d.subjects[n.subjectId]?.name ?? '과목'} · {source(n) || '오답'} · {shortDate(c.date)}
              {n.learned ? ' · 해결됨' : ''}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function source(n: WrongNote) {
  const b = n.bookId ? getStudy().books[n.bookId] : undefined;
  const paper = n.paperId ? getStudy().papers[n.paperId] : undefined;
  return [paper && !paper.deleted ? paper.title : b?.name, n.page ? `p.${n.page}` : '', n.number ? `${n.number.replace(/번$/, '')}번` : ''].filter(Boolean).join(' ');
}

/** 나에게 한마디: 목록 + 새로 쓰기. onChange 로 바뀐 목록을 넘긴다 */
function Comments({ list, today, onChange, autoFocus }: { list: NoteComment[]; today: string; onChange: (l: NoteComment[]) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...list, { id: newId(), date: today, text: t.slice(0, 300), at: Date.now() }]);
    setText('');
  };
  return (
    <div className="nt-comments">
      {list.map((c) => (
        <div key={c.id} className="nt-comment">
          <small className="st-muted">{shortDate(c.date)}</small>
          <span>{c.text}</span>
          <button type="button" className="st-x" aria-label="이 한마디 지우기" onClick={() => onChange(list.filter((x) => x.id !== c.id))}>
            ✕
          </button>
        </div>
      ))}
      <div className="st-inline">
        <input className="st-input" value={text} autoFocus={autoFocus} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="예: 부호 바꿀 때 괄호 먼저 / 조건 「정수」 놓치지 않기" aria-label="나에게 한마디" />
        <button type="button" className="btn btn-sm" disabled={!text.trim()} onClick={add}>
          남기기
        </button>
      </div>
    </div>
  );
}

function Photo({ id, small }: { id: string; small?: boolean }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void photoUrl(id).then((u) => on && setUrl(u));
    return () => {
      on = false;
    };
  }, [id]);
  if (url === undefined) return <div className={`st-photo ${small ? 'sm' : ''} loading`} />;
  if (!url) return <div className={`st-photo ${small ? 'sm' : ''} missing`}>사진을 못 받았어요</div>;
  return <img className={`st-photo ${small ? 'sm' : ''}`} src={url} alt="문제 사진" />;
}

function NoteSheet({ note, today, onClose }: { note?: WrongNote; today: string; onClose: () => void }) {
  const d = useStudy();
  // 새 오답: 과목을 미리 골라 둔다 (사람이 바꾸면 그대로 둔다)
  const [guess, setGuess] = useState(() => (note ? null : guessNoteSubject(d, Date.now(), loadTimer()?.subjectId)));
  const [f, setF] = useState(() => ({
    subjectId: note?.subjectId ?? guess?.id ?? '',
    bookId: note?.bookId ?? '',
    page: note?.page ? String(note.page) : '',
    number: note?.number ?? '',
    question: note?.question ?? '',
    photos: note?.photos ?? ([] as string[]),
    myAnswer: note?.myAnswer ?? '',
    answer: note?.answer ?? '',
    reason: note?.reason ?? (null as WrongReason | null),
    memo: note?.memo ?? '',
    comments: note?.comments ?? ([] as NoteComment[]),
  }));
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState<string | null>(null);
  /** 사진의 글자를 읽어 「문제」 칸에 넣는다 (기기 안에서만, 수식·그림은 못 읽음) */
  async function readQuestion() {
    setOcr('읽는 중…');
    try {
      const { readImageText } = await import('../../lib/ocr');
      let all = '';
      for (const [i, id] of f.photos.entries()) {
        const blob = await photoBlob(id);
        if (!blob) continue;
        all += (await readImageText(blob, (_s, r) => setOcr(`읽는 중 ${i + 1}/${f.photos.length} ${Math.round(r * 100)}%`))).trim() + '\n';
      }
      const t = all.replace(/\n{3,}/g, '\n\n').trim();
      if (!t) toast('사진에서 글자를 찾지 못했어요');
      else {
        const g = !note && (!f.subjectId || guess) ? guessNoteSubject(d, Date.now(), loadTimer()?.subjectId, t) : null;
        if (g) setGuess(g);
        setF((x) => ({
          ...x,
          subjectId: g ? g.id : x.subjectId,
          question: x.question.trim() ? `${x.question.trim()}\n${t}` : t,
        }));
        toast('읽은 글을 「문제」 칸에 넣었어요. 틀린 글자는 고쳐 주세요');
      }
    } catch {
      toast('글자를 읽지 못했어요. 인터넷 연결을 확인해 주세요 (처음엔 글자 인식 자료를 받아요)');
    } finally {
      setOcr(null);
    }
  }
  // 이 창에서 넣은 사진: 저장하지 않고 닫으면 지운다 (서버 사진 수 한도를 쓰지 않게)
  const added = useRef<string[]>([]);
  const saved = useRef(false);
  const close = () => {
    if (!saved.current) for (const p of added.current) void removePhoto(p);
    onClose();
  };
  const books = alive(d.books).filter((b) => !f.subjectId || b.subjectId === f.subjectId);
  async function addPhotos(files: FileList) {
    setBusy(true);
    const ids: string[] = [];
    for (const file of files) {
      try {
        const r = await addPhoto(file);
        ids.push(r.id);
        added.current.push(r.id);
        if (r.error) toast(`이 기기에는 저장했어요. 서버에는 못 올려서 나중에 다시 올려요 (${r.error})`);
      } catch {
        toast('사진을 넣지 못했어요');
      }
    }
    setF((x) => ({ ...x, photos: [...x.photos, ...ids] }));
    setBusy(false);
  }
  function save() {
    if (!f.subjectId) return toast('과목을 골라 주세요');
    const base = note ?? {
      id: newId(),
      created: Date.now(),
      box: 1,
      due: today,
      wrong: 1,
    };
    put('notes', {
      ...base,
      subjectId: f.subjectId,
      bookId: f.bookId || undefined,
      page: f.page ? Number(f.page) : undefined,
      number: f.number || undefined,
      question: f.question,
      photos: f.photos,
      myAnswer: f.myAnswer,
      answer: f.answer,
      reason: f.reason,
      memo: f.memo,
      comments: f.comments.length ? f.comments : undefined,
    });
    // 뺀 사진은 저장할 때 지운다 (취소하면 그대로 남게)
    for (const p of note?.photos ?? []) if (!f.photos.includes(p)) void removePhoto(p);
    saved.current = true;
    onClose();
  }
  return (
    <Sheet title={note ? '오답 고치기' : '오답 넣기'} onClose={close} wide>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker
            value={f.subjectId}
            onChange={(id) => {
              setGuess(null);
              setF({ ...f, subjectId: id });
            }}
          />
          {guess && guess.id === f.subjectId && <small className="st-muted">추천: {guess.why}</small>}
        </Field>
        <div className="st-inline wrap">
          <select className="st-input sm" value={f.bookId} onChange={(e) => setF({ ...f, bookId: e.target.value })} aria-label="문제집">
            <option value="">문제집 (선택)</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input className="st-input xs" inputMode="numeric" placeholder="쪽" value={f.page} onChange={(e) => setF({ ...f, page: e.target.value.replace(/\D/g, '') })} aria-label="쪽" />
          <input className="st-input xs" placeholder="번호" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} aria-label="문제 번호" />
        </div>
        <Field label="문제 (글이나 사진)">
          <textarea className="st-input" rows={3} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
        </Field>
        <div className="st-photos">
          {f.photos.map((p) => (
            <div key={p} className="st-photo-wrap">
              <Photo id={p} small />
              <button
                className="st-x"
                aria-label="사진 빼기"
                onClick={() => {
                  if (added.current.includes(p)) {
                    added.current = added.current.filter((x) => x !== p);
                    void removePhoto(p);
                  }
                  setF({ ...f, photos: f.photos.filter((x) => x !== p) });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {f.photos.length > 0 && (
            <button type="button" className="btn btn-sm" disabled={!!ocr} onClick={() => void readQuestion()}>
              {ocr ?? '사진 글자 읽기'}
            </button>
          )}
          <label className="st-photo-add">
            {busy ? '넣는 중…' : '+ 사진'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && void addPhotos(e.target.files)} />
          </label>
        </div>
        <div className="st-inline wrap">
          <input className="st-input sm" placeholder="내 답" value={f.myAnswer} onChange={(e) => setF({ ...f, myAnswer: e.target.value })} />
          <input className="st-input sm" placeholder="정답" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} />
        </div>
        <Field group label="왜 틀렸나">
          <div className="st-chips">
            {(Object.keys(REASONS) as WrongReason[]).map((r) => (
              <button key={r} type="button" className={`st-chip ${f.reason === r ? 'on' : ''}`} onClick={() => setF({ ...f, reason: f.reason === r ? null : r })}>
                {REASONS[r]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="한 줄 메모">
          <input className="st-input" value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder="예: 부호 실수 조심" />
        </Field>
        <Field group label="나에게 한마디 (다음엔 이렇게)" hint="다시 풀 때마다 남길 수 있어요. 다시 풀기 전에 먼저 보여 드려요.">
          <Comments list={f.comments} today={today} onChange={(l) => setF((x) => ({ ...x, comments: l }))} />
        </Field>
        {note && (
          <p className="st-hint">
            {note.learned ? '해결됨' : `${note.box}번 상자 · 다음 ${shortDate(note.due)}`} · 틀린 횟수 {note.wrong}
          </p>
        )}
        <div className="st-row end">
          {note && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete('이 오답')) return;
                for (const p of new Set([...note.photos, ...f.photos])) void removePhoto(p);
                remove('notes', note.id);
                saved.current = true;
                onClose();
              }}
            >
              지우기
            </button>
          )}
          {note?.learned && (
            <button className="btn btn-sm" onClick={() => (put('notes', { ...note, learned: false, box: 1, due: today }), close())}>
              다시 풀기에 넣기
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

/** 과목별 오답 패턴 (오답이 4개 넘는 과목만) */
function Patterns({ subject, onPick }: { subject: string; onPick: (id: string) => void }) {
  const d = useStudy();
  const pats = mistakePatterns(d).filter((p) => p.total >= 4 && (!subject || p.subjectId === subject));
  if (!pats.length) return null;
  return (
    <details className="st-card mk-pat" open={!!subject}>
      <summary>오답 패턴</summary>
      {pats.map((p) => (
        <div key={p.subjectId} className="mk-row st-tap" {...tap(() => onPick(subject === p.subjectId ? '' : p.subjectId))}>
          <b>
            <SubjectDot id={p.subjectId} d={d} /> {d.subjects[p.subjectId]?.name ?? '과목'} <small className="st-muted">{p.total}개</small>
          </b>
          <span>
            {p.top ? `${REASONS[p.top.reason]} ${Math.round(p.top.share * 100)}%` : '틀린 이유를 적으면 패턴이 보여요'}
            {isCareless(p) && ' · 실수가 많아요 — 시험 계획에 실수 점검을 넣어요'}
          </span>
          {p.units.length > 0 && <small className="st-muted">많이 틀린 곳: {p.units.map((u) => `${u.name} ${u.n}개`).join(', ')}</small>}
        </div>
      ))}
    </details>
  );
}

function NoteRun() {
  const d = useStudy();
  const today = useToday();
  // ?subject=과목 이면 그 과목의 아직 못 익힌 오답 전부 (시험 공부 계획에서 열 때)
  const subject = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('subject');
  const [queue, setQueue] = useState<string[]>(() =>
    subject
      ? alive(getStudy().notes)
          .filter((x) => x.subjectId === subject && !x.learned)
          .sort((a, b) => b.wrong - a.wrong || a.created - b.created)
          .map((x) => x.id)
      : dueToday(alive(getStudy().notes), today).map((x) => x.id),
  );
  const [total] = useState(queue.length);
  const [revealed, setRevealed] = useState(false);
  const [first, setFirst] = useState<Map<string, boolean>>(new Map());
  const n = queue.length ? d.notes[queue[0]] : null;
  if (!n)
    return (
      <div className="st-page narrow">
        <div className="st-card st-done-card">
          <h2>{subject ? `${d.subjects[subject]?.name ?? ''} 오답 다시 풀기 끝!` : '오늘 다시 풀기 끝!'}</h2>
          <p>
            {total}문제 중 {[...first.values()].filter(Boolean).length}문제를 맞혔어요
          </p>
          <button className="btn btn-primary" onClick={() => go('/study')}>
            오늘 화면으로
          </button>
        </div>
      </div>
    );
  function reply(ok: boolean) {
    if (!first.has(n!.id)) {
      const s = getStudy().settings;
      const next = answer(n!, ok, 'redo', today, s.intervals, s.quizMaxBox);
      put('notes', next);
      if (next.learned) toast('5번 상자까지 맞혀서 「해결됨」으로 옮겼어요');
      setFirst(new Map(first).set(n!.id, ok));
    }
    // 오답은 세션 안에서 다시 내지 않는다 (같은 문제를 바로 또 풀면 답을 외운 것)
    setQueue(requeue(queue, true));
    setRevealed(false);
  }
  return (
    <div className="st-run">
      <div className="st-run-top">
        <button className="st-back" onClick={() => go('/review')} aria-label="그만하기">
          ✕
        </button>
        <Bar value={total - queue.length} max={total} label="푼 문제" />
        <span className="st-muted">
          {total - queue.length + 1}/{total}
        </span>
      </div>
      <div className="st-runcard">
        <div className="st-note-top">
          <SubjectDot id={n.subjectId} d={d} />
          <small>{source(n) || '오답'}</small>
          {n.wrong > 1 && <small className="bad">✕{n.wrong}</small>}
        </div>
        {n.photos.map((p) => (
          <Photo key={p} id={p} />
        ))}
        {n.question && <div className="st-ask-text sm">{n.question}</div>}
        {!n.photos.length && !n.question && <div className="st-ask-text sm">{source(n)} 문제를 다시 풀어 보세요</div>}
        {n.comments?.length ? (
          <div className="nt-remind">
            <small>지난번 나에게 한마디</small>
            {n.comments.slice(-3).map((c) => (
              <div key={c.id} className="nt-remind-line">
                {c.text}
              </div>
            ))}
          </div>
        ) : null}
        {!revealed ? (
          <div className="st-row center">
            <p className="st-hint">답을 보기 전에 직접 풀어 보세요</p>
            <button className="btn btn-lg btn-primary" onClick={() => setRevealed(true)}>
              다 풀었어요 · 답 확인
            </button>
          </div>
        ) : (
          <>
            <div className="st-answer">
              {n.answer && (
                <div>
                  정답: <b>{n.answer}</b>
                </div>
              )}
              {n.myAnswer && <div className="st-muted">처음 내 답: {n.myAnswer}</div>}
              {n.reason && <div>왜 틀렸나: {REASONS[n.reason]}</div>}
              {n.memo && <div>메모: {n.memo}</div>}
              {!n.answer && !n.reason && !n.memo && <div className="st-muted">적어 둔 정답·메모가 없어요. 풀이를 직접 맞춰 보세요</div>}
            </div>
            <details className="nt-add">
              <summary>나에게 한마디 남기기</summary>
              <Comments list={n.comments ?? []} today={today} onChange={(l) => put('notes', { ...getStudy().notes[n.id], comments: l })} autoFocus />
            </details>
            <div className="st-row center">
              <button className="btn btn-lg st-no" onClick={() => reply(false)}>
                또 틀렸어요
              </button>
              <button className="btn btn-lg st-yes" onClick={() => reply(true)}>
                맞혔어요
              </button>
            </div>
            <p className="st-hint center">틀리면 {d.settings.intervals[0] === 1 ? '내일' : `${d.settings.intervals[0]}일 뒤`} 다시 풀어요</p>
          </>
        )}
      </div>
    </div>
  );
}

// ===== 암기 카드 =====

function Cards({ today, adding: add }: { today: string; adding?: boolean }) {
  const d = useStudy();
  const [adding, setAdding] = useState(!!add);
  const decks = alive(d.decks);
  const cards = alive(d.cards);
  const due = cardsToday(d, today);
  return (
    <>
      <section className="st-card st-learn-cta">
        <div>
          <p className="st-sub">
            오늘 볼 카드 <b>{due.length}</b> · 전체 {cards.length}장 · 익힘 {cards.filter((c) => c.learned).length}
          </p>
          <p className="st-hint">영어 단어는 「영단어」 탭이 더 좋아요 (단어장 계획·객관식).</p>
        </div>
        {due.length > 0 && (
          <button className="btn btn-primary btn-lg" onClick={() => go('/review/cards-run')}>
            카드 복습 ({due.length})
          </button>
        )}
      </section>
      {!decks.length ? (
        <Empty icon="🃏" title="카드 묶음이 없어요">
          <p>앞면(문제)과 뒷면(답)을 한 줄씩 붙여 넣어 한꺼번에 만들 수 있어요.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            카드 묶음 만들기
          </button>
        </Empty>
      ) : (
        <div className="st-grid">
          {decks.map((dk) => {
            const cs = cards.filter((c) => c.deckId === dk.id);
            const n = cs.filter((c) => c.learned).length;
            return (
              <button key={dk.id} className="st-wl" onClick={() => go(`/review/deck-${dk.id}`)}>
                <strong>
                  <SubjectDot id={dk.subjectId} d={d} /> {dk.name}
                </strong>
                <Bar value={n} max={cs.length} label="익힌 카드" />
                <small>
                  {cs.length}장 · 오늘 {cardsToday(d, today, dk.id).length}
                </small>
              </button>
            );
          })}
        </div>
      )}
      {adding && <DeckSheet onClose={() => (setAdding(false), add && window.location.hash.endsWith('new-deck') && go('/review/cards'))} />}
    </>
  );
}

function DeckSheet({ deck, onClose }: { deck?: CardDeck; onClose: () => void }) {
  const [name, setName] = useState(deck?.name ?? '');
  const [subjectId, setSubjectId] = useState(deck?.subjectId ?? '');
  return (
    <Sheet title={deck ? '카드 묶음 고치기' : '카드 묶음 만들기'} onClose={onClose}>
      <div className="st-form">
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 한국사 연도" />
        </Field>
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        <div className="st-row end">
          <button
            className="btn btn-primary"
            disabled={!name.trim() || !subjectId}
            onClick={() => {
              const id = deck?.id ?? newId();
              put('decks', { id, name: name.trim(), subjectId });
              onClose();
              if (!deck) go(`/review/deck-${id}`);
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 「앞|뒤」, 「앞<탭>뒤」, 「앞 - 뒤」 */
export function parseCards(text: string): { front: string; back: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.split(/\t|\s*\|\s*|\s+[-–—]\s+/);
      return {
        front: (m[0] ?? '').trim(),
        back: m.slice(1).join(' / ').trim(),
      };
    })
    .filter((c) => c.front && c.back);
}

function DeckView({ id }: { id: string }) {
  const d = useStudy();
  const today = useToday();
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(false);
  const [card, setCard] = useState<MemoCard | null>(null);
  const deck = d.decks[id];
  const parsed = useMemo(() => parseCards(text), [text]);
  if (!deck || deck.deleted) return <Empty icon="🤔" title="카드 묶음을 찾을 수 없어요" />;
  const cards = alive(d.cards).filter((c) => c.deckId === id);
  return (
    <div className="st-page">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go('/review/cards')} aria-label="암기 카드">
          ‹
        </button>
        <h2>
          <SubjectDot id={deck.subjectId} d={d} /> {deck.name}
        </h2>
        <Menu
          items={[
            { label: '이름·과목 고치기', onClick: () => setEdit(true) },
            {
              label: '묶음 지우기',
              danger: true,
              onClick: () => {
                if (!confirmDelete(`「${deck.name}」과 카드 ${cards.length}장`)) return;
                for (const c of cards) remove('cards', c.id);
                remove('decks', deck.id);
                go('/review/cards');
              },
            },
          ]}
        />
      </div>
      <section className="st-card st-form">
        <Field
          label="카드 한꺼번에 넣기"
          hint={
            <>
              한 줄에 카드 하나: <code>앞면 | 뒷면</code> · 엑셀·시트에서 두 칸 복사 · <code>앞 - 뒤</code>
            </>
          }
        >
          <textarea className="st-input mono" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'임진왜란 | 1592\n광합성 장소 | 엽록체'} />
        </Field>
        <div className="st-row end">
          <button
            className="btn btn-primary"
            disabled={!parsed.length}
            onClick={() => {
              {
                const now = Date.now();
                putMany(
                  parsed.map((c, i) => ({
                    c: 'cards' as const,
                    item: {
                      id: newId(),
                      deckId: id,
                      front: c.front,
                      back: c.back,
                      box: 0,
                      due: today,
                      wrong: 0,
                      created: now + i,
                    },
                  })),
                );
              }
              setText('');
              toast(`${parsed.length}장을 넣었어요`);
            }}
          >
            {parsed.length}장 넣기
          </button>
        </div>
      </section>
      <section className="st-card">
        {cards.some((c) => c.box === 0 || (c.due <= today && !c.learned)) && (
          <div className="st-row">
            <button className="btn btn-primary" onClick={() => go(`/review/cards-run?deck=${id}`)}>
              이 묶음 공부하기
            </button>
          </div>
        )}
        <table className="st-table words">
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} {...tap(() => setCard(c))}>
                <td className="st-term">{c.front}</td>
                <td>{c.back}</td>
                <td className="st-muted nowrap">{dueText(c, today)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {edit && <DeckSheet deck={deck} onClose={() => setEdit(false)} />}
      {card && <CardSheet c={card} onClose={() => setCard(null)} />}
    </div>
  );
}

function CardSheet({ c, onClose }: { c: MemoCard; onClose: () => void }) {
  const [front, setFront] = useState(c.front);
  const [back, setBack] = useState(c.back);
  return (
    <Sheet title="카드 고치기" onClose={onClose}>
      <div className="st-form">
        <Field label="앞면">
          <input className="st-input" value={front} onChange={(e) => setFront(e.target.value)} />
        </Field>
        <Field label="뒷면">
          <input className="st-input" value={back} onChange={(e) => setBack(e.target.value)} />
        </Field>
        <div className="st-row end">
          <button className="btn btn-sm st-danger" onClick={() => (remove('cards', c.id), onClose())}>
            지우기
          </button>
          <button className="btn btn-primary" onClick={() => (put('cards', { ...c, front, back }), onClose())}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function CardRun() {
  const today = useToday();
  const deckId = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('deck');
  const [flip, setFlip] = useState(false);
  const [queue, setQueue] = useState<string[]>(() => {
    // 복습할 카드 + 오늘 새로 볼 카드 (하루 정한 수까지)
    return cardsToday(getStudy(), today, deckId).map((c) => c.id);
  });
  const [total] = useState(queue.length);
  const [first, setFirst] = useState<Map<string, boolean>>(new Map());
  const d = useStudy();
  const c = queue.length ? d.cards[queue[0]] : null;
  if (!c)
    return (
      <div className="st-page narrow">
        <div className="st-card st-done-card">
          <h2>카드 복습 끝!</h2>
          <p>
            {total}장 중 처음에 안 것 {[...first.values()].filter(Boolean).length}장
          </p>
          <button className="btn btn-primary" onClick={() => go('/study')}>
            오늘 화면으로
          </button>
        </div>
      </div>
    );
  function reply(ok: boolean) {
    if (!first.has(c!.id)) {
      const s = getStudy().settings;
      put('cards', {
        ...answer(c!, ok, 'card', today, s.intervals, s.quizMaxBox),
        firstSeen: c!.firstSeen ?? today,
      });
      setFirst(new Map(first).set(c!.id, ok));
    }
    setQueue(requeue(queue, ok));
  }
  return (
    <div className="st-run">
      <div className="st-run-top">
        <button className="st-back" onClick={() => go('/review/cards')} aria-label="그만하기">
          ✕
        </button>
        <Bar value={first.size} max={total} label="본 카드" />
        <label className="st-toggle sm">
          <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> 뒤→앞
        </label>
      </div>
      <SwipeCard key={`${c.id}:${queue.length}`} front={flip ? c.back : c.front} back={(flip ? c.front : c.back) || '(내용 없음)'} sub={d.decks[c.deckId]?.name} onAnswer={reply} />
    </div>
  );
}
