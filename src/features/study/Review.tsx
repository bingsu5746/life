// 복습: 오답 노트 · 암기 카드 (설계 §9.1~9.3)
import { useEffect, useMemo, useState } from 'react';
import { shortDate } from './dates';
import { alive, newId, REASONS, type CardDeck, type MemoCard, type WrongNote, type WrongReason } from './model';
import { answer, dueText, dueToday } from './review';
import { getStudy, put, remove, useStudy } from './store';
import { addPhoto, photoUrl, removePhoto } from './photos';
import { requeue } from './wordSession';
import { Bar, confirmDelete, Empty, Field, go, Sheet, SubjectDot, SubjectPicker, SubjectTag, subjectsOf, toast, useToday } from './ui';
import { KeyHelp, RunCard } from './Words';

export function Review({ sub }: { sub?: string }) {
  if (sub === 'redo') return <NoteRun />;
  if (sub?.startsWith('cards-run')) return <CardRun />;
  if (sub?.startsWith('deck-')) return <DeckView id={sub.slice(5)} />;
  return <ReviewHome tab={sub === 'cards' ? 'cards' : 'notes'} />;
}

function ReviewHome({ tab }: { tab: 'notes' | 'cards' }) {
  const d = useStudy();
  const today = useToday();
  const notesDue = dueToday(alive(d.notes), today);
  const cardsDue = dueToday(alive(d.cards), today);
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
        </div>
      </div>
      {tab === 'notes' ? <Notes today={today} /> : <Cards today={today} />}
    </div>
  );
}

// ===== 오답 노트 =====

function Notes({ today }: { today: string }) {
  const d = useStudy();
  const [edit, setEdit] = useState<WrongNote | 'new' | null>(null);
  const [subject, setSubject] = useState('');
  const [show, setShow] = useState<'open' | 'resolved'>('open');
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
        <div className="st-col">
          <button className="btn btn-primary btn-lg" disabled={!due.length} onClick={() => go('/review/redo')}>
            다시 풀기 {due.length > 0 && `(${due.length})`}
          </button>
          <button className="btn" onClick={() => setEdit('new')}>
            ＋ 오답 넣기
          </button>
        </div>
      </section>
      <div className="st-inline wrap">
        <div className="st-seg sm">
          <button className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>
            해결 전
          </button>
          <button className={show === 'resolved' ? 'on' : ''} onClick={() => setShow('resolved')}>
            해결됨
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
      {!list.length ? (
        <Empty icon="📝" title={show === 'open' ? '오답이 없어요' : '아직 해결한 오답이 없어요'}>
          <p>문제집을 체크할 때 「틀린 번호」를 쓰거나, 여기서 사진과 함께 넣을 수 있어요.</p>
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
              {n.reason && <span className="st-pill">{REASONS[n.reason]}</span>}
              {n.wrong > 1 && <small className="bad"> ✕{n.wrong}</small>}
            </button>
          ))}
        </div>
      )}
      {edit && <NoteSheet note={edit === 'new' ? undefined : edit} today={today} onClose={() => setEdit(null)} />}
    </>
  );
}

function source(n: WrongNote) {
  const b = n.bookId ? getStudy().books[n.bookId] : undefined;
  return [b?.name, n.page ? `p.${n.page}` : '', n.number ? `${n.number}번` : ''].filter(Boolean).join(' ');
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
  const [f, setF] = useState(() => ({
    subjectId: note?.subjectId ?? '',
    bookId: note?.bookId ?? '',
    page: note?.page ? String(note.page) : '',
    number: note?.number ?? '',
    question: note?.question ?? '',
    photos: note?.photos ?? ([] as string[]),
    myAnswer: note?.myAnswer ?? '',
    answer: note?.answer ?? '',
    reason: note?.reason ?? (null as WrongReason | null),
    memo: note?.memo ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const books = alive(d.books).filter((b) => !f.subjectId || b.subjectId === f.subjectId);
  async function addPhotos(files: FileList) {
    setBusy(true);
    const ids: string[] = [];
    for (const file of files) {
      try {
        const r = await addPhoto(file);
        ids.push(r.id);
        if (r.error) toast(`이 기기에는 저장했지만 서버에는 못 올렸어요: ${r.error}`);
      } catch {
        toast('사진을 넣지 못했어요');
      }
    }
    setF((x) => ({ ...x, photos: [...x.photos, ...ids] }));
    setBusy(false);
  }
  function save() {
    if (!f.subjectId) return toast('과목을 골라 주세요');
    const base = note ?? { id: newId(), created: Date.now(), box: 1, due: today, wrong: 1 };
    put('notes', { ...base, subjectId: f.subjectId, bookId: f.bookId || undefined, page: f.page ? Number(f.page) : undefined, number: f.number || undefined, question: f.question, photos: f.photos, myAnswer: f.myAnswer, answer: f.answer, reason: f.reason, memo: f.memo });
    onClose();
  }
  return (
    <Sheet title={note ? '오답 고치기' : '오답 넣기'} onClose={onClose} wide>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker value={f.subjectId} onChange={(id) => setF({ ...f, subjectId: id })} />
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
                  void removePhoto(p);
                  setF({ ...f, photos: f.photos.filter((x) => x !== p) });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <label className="st-photo-add">
            {busy ? '넣는 중…' : '📷 사진'}
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
                for (const p of note.photos) void removePhoto(p);
                remove('notes', note.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          {note?.learned && (
            <button className="btn btn-sm" onClick={() => (put('notes', { ...note, learned: false, box: 1, due: today }), onClose())}>
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

function NoteRun() {
  const d = useStudy();
  const today = useToday();
  const [queue, setQueue] = useState<string[]>(() => dueToday(alive(getStudy().notes), today).map((n) => n.id));
  const [total] = useState(queue.length);
  const [revealed, setRevealed] = useState(false);
  const [first, setFirst] = useState<Map<string, boolean>>(new Map());
  const n = queue.length ? d.notes[queue[0]] : null;
  if (!n)
    return (
      <div className="st-page narrow">
        <div className="st-card st-done-card">
          <div className="st-empty-icon">🎉</div>
          <h2>오늘 다시 풀기 끝!</h2>
          <p>
            {total}문제 중 {[...first.values()].filter(Boolean).length}문제를 맞혔어요
          </p>
          <button className="btn btn-primary" onClick={() => go('/')}>
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
        <Bar value={total - queue.length} max={total} color="var(--ok)" />
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
        {!revealed ? (
          <div className="st-row center">
            <p className="st-hint">답을 보기 전에 직접 풀어 보세요</p>
            <button className="btn btn-lg st-no" onClick={() => setRevealed(true)}>
              또 틀렸어요
            </button>
            <button className="btn btn-lg st-yes" onClick={() => reply(true)}>
              맞혔어요
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
              {n.memo && <div>📝 {n.memo}</div>}
              {!n.answer && !n.reason && !n.memo && <div className="st-muted">적어 둔 정답·메모가 없어요</div>}
            </div>
            <button className="btn btn-lg btn-primary" onClick={() => reply(false)}>
              다음 (내일 다시)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ===== 암기 카드 =====

function Cards({ today }: { today: string }) {
  const d = useStudy();
  const [adding, setAdding] = useState(false);
  const decks = alive(d.decks);
  const cards = alive(d.cards);
  const due = dueToday(cards, today);
  return (
    <>
      <section className="st-card st-learn-cta">
        <div>
          <p className="st-sub">
            오늘 볼 카드 <b>{due.length}</b> · 전체 {cards.length}장 · 익힘 {cards.filter((c) => c.learned).length}
          </p>
          <p className="st-hint">영어 단어는 「영단어」 탭이 더 좋아요 (단어장 계획·객관식).</p>
        </div>
        <div className="st-col">
          <button className="btn btn-primary btn-lg" disabled={!due.length} onClick={() => go('/review/cards-run')}>
            카드 복습 {due.length > 0 && `(${due.length})`}
          </button>
          <button className="btn" onClick={() => setAdding(true)}>
            ＋ 카드 묶음
          </button>
        </div>
      </section>
      {!decks.length ? (
        <Empty icon="🃏" title="카드 묶음이 없어요">
          <p>앞면(문제)과 뒷면(답)을 한 줄씩 붙여 넣어 한꺼번에 만들 수 있어요.</p>
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
                <Bar value={n} max={cs.length} color={d.subjects[dk.subjectId]?.color} />
                <small>
                  {cs.length}장 · 오늘 {dueToday(cs, today).length + cs.filter((c) => c.box === 0).length}
                </small>
              </button>
            );
          })}
        </div>
      )}
      {adding && <DeckSheet onClose={() => setAdding(false)} />}
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
      return { front: (m[0] ?? '').trim(), back: m.slice(1).join(' / ').trim() };
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
        <div className="st-row">
          <button className="btn btn-sm" onClick={() => setEdit(true)}>
            고치기
          </button>
          <button
            className="btn btn-sm st-danger"
            onClick={() => {
              if (!confirmDelete(`「${deck.name}」과 카드 ${cards.length}장`)) return;
              for (const c of cards) remove('cards', c.id);
              remove('decks', deck.id);
              go('/review/cards');
            }}
          >
            지우기
          </button>
        </div>
      </div>
      <section className="st-card st-form">
        <Field label="카드 한꺼번에 넣기" hint={<>한 줄에 카드 하나: <code>앞면 | 뒷면</code> · 엑셀·시트에서 두 칸 복사 · <code>앞 - 뒤</code></>}>
          <textarea className="st-input mono" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'임진왜란 | 1592\n광합성 장소 | 엽록체'} />
        </Field>
        <div className="st-row end">
          <button
            className="btn btn-primary"
            disabled={!parsed.length}
            onClick={() => {
              for (const c of parsed) put('cards', { id: newId(), deckId: id, front: c.front, back: c.back, box: 0, due: today, wrong: 0 });
              setText('');
              toast(`${parsed.length}장을 넣었어요`);
            }}
          >
            {parsed.length}장 넣기
          </button>
        </div>
      </section>
      <section className="st-card">
        <div className="st-row">
          <button className="btn btn-primary" disabled={!cards.some((c) => c.box === 0 || (c.due <= today && !c.learned))} onClick={() => go(`/review/cards-run?deck=${id}`)}>
            이 묶음 공부하기
          </button>
        </div>
        <table className="st-table words">
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} onClick={() => setCard(c)}>
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
    const cs = alive(getStudy().cards).filter((c) => !deckId || c.deckId === deckId);
    // 복습할 카드 + (묶음을 고르면) 새 카드 20장까지
    return [...dueToday(cs, today), ...(deckId ? cs.filter((c) => c.box === 0).slice(0, 20) : [])].map((c) => c.id);
  });
  const [total] = useState(queue.length);
  const [first, setFirst] = useState<Map<string, boolean>>(new Map());
  const [shown, setShown] = useState(false);
  const d = useStudy();
  const c = queue.length ? d.cards[queue[0]] : null;
  if (!c)
    return (
      <div className="st-page narrow">
        <div className="st-card st-done-card">
          <div className="st-empty-icon">🎉</div>
          <h2>카드 복습 끝!</h2>
          <p>
            {total}장 중 처음에 안 것 {[...first.values()].filter(Boolean).length}장
          </p>
          <button className="btn btn-primary" onClick={() => go('/')}>
            오늘 화면으로
          </button>
        </div>
      </div>
    );
  function reply(ok: boolean) {
    if (!first.has(c!.id)) {
      const s = getStudy().settings;
      put('cards', answer(c!, ok, 'card', today, s.intervals, s.quizMaxBox));
      setFirst(new Map(first).set(c!.id, ok));
    }
    setQueue(requeue(queue, ok));
    setShown(false);
  }
  return (
    <div className="st-run">
      <div className="st-run-top">
        <button className="st-back" onClick={() => go('/review/cards')} aria-label="그만하기">
          ✕
        </button>
        <Bar value={first.size} max={total} color="var(--ok)" />
        <label className="st-toggle sm">
          <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> 뒤→앞
        </label>
      </div>
      <RunCard key={c.id + queue.length} ask={flip ? c.back : c.front} sub={d.decks[c.deckId]?.name}>
        {shown ? (
          <>
            <div className="st-answer">{flip ? c.front : c.back}</div>
            <div className="st-row center">
              <button className="btn btn-lg st-no" onClick={() => reply(false)}>
                몰랐다
              </button>
              <button className="btn btn-lg st-yes" onClick={() => reply(true)}>
                알았다
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-lg btn-primary" onClick={() => setShown(true)}>
            답 보기
          </button>
        )}
      </RunCard>
      <KeyHelp quiz={false} shown={shown} onShow={() => setShown(true)} onReply={reply} onPick={() => {}} />
    </div>
  );
}
