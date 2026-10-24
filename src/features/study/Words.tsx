// 영단어 (설계 §9.4~9.9): 목록 · 넣기(PDF·붙여넣기·사진) · 목록 하나 · 외우기(카드·객관식)
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dday, shortDate } from './dates';
import { alive, newId, type Word, type WordList } from './model';
import { rangeText } from './pages';
import { BOX_LABEL, dueText } from './review';
import { dayUnits, listDoneDays, listWords, planViews, wordListViews } from './select';
import { getStudy, getWords, put, putWords, remove, removeWords, useStudy, useWords } from './store';
import { addWords, answerWord, markDays } from './actions';
import { parseWords, wordsText, type ParsedWord } from './wordParse';
import { choicesFor, requeue, type Mode } from './wordSession';
import { PlanForm } from './PlanForm';
import { Bar, confirmDelete, Empty, Field, go, Sheet, SubjectDot, SubjectPicker, toast, useToday } from './ui';

const KIND_LABEL: Record<WordList['kind'], string> = { book: '단어장', test: '단어 시험', inbox: '모르는 단어 모음' };

export function Words({ id, sub }: { id?: string; sub?: string }) {
  if (id === 'new') return <NewList />;
  if (id && (sub === 'learn' || sub === 'prep' || sub === 'weak')) return <WordRun listId={id} mode={sub} />;
  if (id) return <ListDetail id={id} />;
  return <ListIndex />;
}

function ListIndex() {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const views = wordListViews(d, words, today, planViews(d, words, today));
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>영단어</h2>
        <button className="btn btn-primary" onClick={() => go('/words/new')}>
          ＋ 단어 목록
        </button>
      </div>
      {!views.length && (
        <Empty icon="🔤" title="단어 목록을 만들어 보세요">
          <p>단어장 PDF를 넣거나, 단어와 뜻을 붙여 넣거나, 단어장 사진을 찍어 넣을 수 있어요.</p>
        </Empty>
      )}
      <div className="st-grid">
        {views.map((v) => {
          const learned = v.words.filter((w) => w.learned).length;
          const seen = v.words.filter((w) => w.box > 0).length;
          return (
            <button key={v.list.id} className="st-wl" onClick={() => go(`/words/${v.list.id}`)}>
              <div className="st-wl-top">
                <span className="st-pill">{KIND_LABEL[v.list.kind]}</span>
                {v.list.testDate && <span className="st-pill warn">{dday(today, v.list.testDate)}</span>}
              </div>
              <strong>
                <SubjectDot id={v.list.subjectId} d={d} /> {v.list.name}
              </strong>
              <Bar value={seen} max={v.words.length} color="var(--blue-2)" />
              <small>
                {v.words.length}단어 · 익히는 중 {seen - learned} · 익힘 {learned}
              </small>
              <small className={v.fresh.length + v.due.length ? 'ok' : 'st-muted'}>{v.fresh.length + v.due.length ? `오늘 새 단어 ${v.fresh.length} · 복습 ${v.due.length}` : '오늘 분량 끝'}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewList() {
  const d = useStudy();
  const today = useToday();
  const [kind, setKind] = useState<WordList['kind']>('book');
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState(() => alive(d.subjects).find((s) => /영어|english/i.test(s.name))?.id ?? '');
  const [days, setDays] = useState('');
  const [testDate, setTestDate] = useState(addDays(today, 7));
  function save() {
    if (!name.trim() || !subjectId) return;
    const id = newId();
    put('wordLists', { id, name: name.trim(), kind, subjectId, days: kind === 'book' && days ? Number(days) : undefined, testDate: kind === 'test' ? testDate : undefined, done: [], undone: [] });
    go(`/words/${id}`);
  }
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>단어 목록 만들기</h2>
        <button className="btn btn-sm" onClick={() => go('/words')}>
          취소
        </button>
      </div>
      <div className="st-card st-form">
        <Field group label="종류">
          <div className="st-seg">
            {(['book', 'test', 'inbox'] as const).map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>
        <p className="st-hint">
          {kind === 'book'
            ? '갖고 있는 단어장: Day 단위로 하루 분량을 나눠 드려요. 단어를 넣지 않고 Day 수만 넣어도 계획·체크는 돼요.'
            : kind === 'test'
              ? '학교·학원 단어 시험: 시험 이틀 전까지 새 단어를 나눠 익히고, 전날은 전체 복습해요.'
              : '문제 풀다 만난 모르는 단어: 하루에 정한 수만큼 새로 익혀요.'}
        </p>
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'book' ? '예: 수능 영단어 2000' : kind === 'test' ? '예: 학원 단어 시험 Day 5~8' : '모르는 단어 모음'} />
        </Field>
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        {kind === 'book' && (
          <Field label="Day 수" hint="PDF·붙여넣기로 단어를 넣으면 Day 수는 자동으로 맞춰져요">
            <input className="st-input xs" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} placeholder="예: 50" />
          </Field>
        )}
        {kind === 'test' && (
          <Field label="시험 날">
            <input className="st-input sm" type="date" min={today} value={testDate} onChange={(e) => setTestDate(e.target.value)} />
          </Field>
        )}
        <div className="st-row end">
          <button className="btn btn-primary" disabled={!name.trim() || !subjectId} onClick={save}>
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}

function ListDetail({ id }: { id: string }) {
  const d = useStudy();
  const allWords = useWords();
  const today = useToday();
  const [importing, setImporting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [edit, setEdit] = useState<Word | null>(null);
  const [filter, setFilter] = useState<'all' | 'new' | 'learning' | 'learned'>('all');
  const [q, setQ] = useState('');
  const list = d.wordLists[id];
  const plans = planViews(d, allWords, today);
  if (!list || list.deleted)
    return (
      <Empty icon="🤔" title="단어 목록을 찾을 수 없어요">
        <button className="btn" onClick={() => go('/words')}>
          영단어
        </button>
      </Empty>
    );
  const v = wordListViews(d, allWords, today, plans).find((x) => x.list.id === id)!;
  const ws = v.words;
  const doneDays = listDoneDays(list, ws);
  const weak = ws.filter((w) => w.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 20);
  const shown = ws.filter((w) => (filter === 'new' ? w.box === 0 : filter === 'learning' ? w.box > 0 && !w.learned : filter === 'learned' ? w.learned : true)).filter((w) => !q || w.term.toLowerCase().includes(q.toLowerCase()) || w.meaning.includes(q));
  const days = list.days ?? 0;

  return (
    <div className="st-page">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go('/words')} aria-label="영단어">
          ‹
        </button>
        <h2>
          <SubjectDot id={list.subjectId} d={d} /> {list.name}
        </h2>
        <div className="st-row">
          <button className="btn btn-sm btn-primary" onClick={() => setImporting(true)}>
            ＋ 단어 넣기
          </button>
          <ListMenu list={list} words={ws} />
        </div>
      </div>

      <section className="st-card st-learn-cta">
        <div>
          <span className="st-pill">{KIND_LABEL[list.kind]}</span>
          {list.testDate && (
            <span className="st-pill warn">
              시험 {shortDate(list.testDate)} {dday(today, list.testDate)}
            </span>
          )}
          <p className="st-sub">
            {ws.length}단어 · 아직 안 봄 {ws.filter((w) => w.box === 0).length} · 익히는 중 {ws.filter((w) => w.box > 0 && !w.learned).length} · 익힘 {ws.filter((w) => w.learned).length}
          </p>
          <div className="st-boxes" aria-label="상자별 단어 수">
            {BOX_LABEL.map((_, b) => (
              <span key={b}>
                <b>{ws.filter((w) => w.box === b && !w.learned).length}</b>
                <small>{b === 0 ? '새 단어' : `${b}번 상자`}</small>
              </span>
            ))}
            <span>
              <b>{ws.filter((w) => w.learned).length}</b>
              <small>익힘</small>
            </span>
          </div>
        </div>
        <div className="st-col">
          <button className="btn btn-primary btn-lg" disabled={!v.fresh.length && !v.due.length} onClick={() => go(`/words/${id}/learn`)}>
            오늘 외우기 {v.fresh.length + v.due.length > 0 && `(${v.fresh.length + v.due.length})`}
          </button>
          {list.kind === 'test' && (
            <button className={`btn ${v.prep ? 'btn-primary' : ''}`} disabled={!ws.length} onClick={() => go(`/words/${id}/prep`)}>
              🎯 시험 대비 (전체 한 번씩)
            </button>
          )}
          {weak.length > 0 && (
            <button className="btn" onClick={() => go(`/words/${id}/weak`)}>
              자주 틀리는 단어 {weak.length}개
            </button>
          )}
        </div>
      </section>

      {list.kind === 'book' && (
        <section className="st-card">
          <h3 className="st-h">Day 계획</h3>
          {days === 0 ? (
            <p className="st-hint">Day 수를 넣거나 단어를 Day 별로 넣으면 계획을 세울 수 있어요.</p>
          ) : (
            <>
              {v.plan && !planning && (
                <p className="st-sub">
                  {v.todayDays.length ? (
                    <>
                      오늘 <b>Day {rangeText(v.todayDays)}</b>
                    </>
                  ) : (
                    '오늘은 배정 없음'
                  )}
                  {v.plan.sched.end && ` · ${shortDate(v.plan.sched.end)}까지 남은 ${v.plan.sched.remaining.length}개 Day`}{' '}
                  <button className="st-link" onClick={() => setPlanning(true)}>
                    계획 고치기
                  </button>
                </p>
              )}
              {(!v.plan || planning) && (
                <PlanForm target="words" targetId={id} units={dayUnits(days)} done={doneDays} reserved={new Set()} existing={v.plan?.plan} today={today} onDone={() => setPlanning(false)} />
              )}
              <div className="st-days">
                {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                  const dw = ws.filter((w) => w.day === day);
                  const on = doneDays.has(day);
                  return (
                    <button key={day} className={`st-day ${on ? 'on' : ''} ${v.todayDays.includes(day) ? 'today' : ''}`} onClick={() => markDays(id, [day], !on)} title={dw.length ? `${dw.length}단어` : '단어 없음 (종이 단어장)'} aria-pressed={on}>
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="st-hint">Day 를 누르면 다 외운 것으로 체크·해제해요. 단어를 넣은 Day 는 모두 한 번 익히면 저절로 체크돼요.</p>
            </>
          )}
        </section>
      )}

      {weak.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">자주 틀리는 단어</h3>
          <div className="st-weak">
            {weak.slice(0, 10).map((w) => (
              <span key={w.id}>
                <b>{w.term}</b> {w.meaning} <small className="bad">✕{w.wrong}</small>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="st-card">
        <div className="st-inline wrap">
          <div className="st-seg sm">
            {(['all', 'new', 'learning', 'learned'] as const).map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? '전체' : f === 'new' ? '안 봄' : f === 'learning' ? '익히는 중' : '익힘'}
              </button>
            ))}
          </div>
          <input className="st-input sm" placeholder="찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!ws.length ? (
          <Empty icon="📄" title="아직 단어가 없어요">
            <button className="btn btn-primary" onClick={() => setImporting(true)}>
              ＋ 단어 넣기 (PDF · 붙여넣기 · 사진)
            </button>
          </Empty>
        ) : (
          <table className="st-table words">
            <tbody>
              {shown.slice(0, 400).map((w) => (
                <tr key={w.id} onClick={() => setEdit(w)}>
                  <td className="st-term">{w.term}</td>
                  <td>{w.meaning || <span className="bad">뜻 없음</span>}</td>
                  <td className="st-muted nowrap">
                    {w.day !== undefined && `Day ${w.day} · `}
                    {dueText(w, today)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shown.length > 400 && <p className="st-hint">처음 400개만 보여요. 찾기로 좁혀 보세요.</p>}
      </section>
      {importing && <ImportSheet list={list} existing={ws} onClose={() => setImporting(false)} />}
      {edit && <WordSheet w={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ListMenu({ list, words }: { list: WordList; words: Word[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(list.name);
  const [days, setDays] = useState(String(list.days ?? ''));
  const [testDate, setTestDate] = useState(list.testDate ?? '');
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        ⋯
      </button>
      {open && (
        <Sheet title="단어 목록 설정" onClose={() => setOpen(false)}>
          <div className="st-form">
            <Field label="이름">
              <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {list.kind === 'book' && (
              <Field label="Day 수">
                <input className="st-input xs" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}
            {list.kind === 'test' && (
              <Field label="시험 날">
                <input className="st-input sm" type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
              </Field>
            )}
            <div className="st-row">
              <button
                className="btn btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(wordsText(words)).then(
                    () => toast('단어<탭>뜻 글로 복사했어요 (다시 붙여 넣을 수 있어요)'),
                    () => toast('복사하지 못했어요'),
                  );
                }}
              >
                글로 복사 (내보내기)
              </button>
              <button
                className="btn btn-sm st-danger"
                onClick={() => {
                  if (!confirmDelete(`「${list.name}」과 단어 ${words.length}개`)) return;
                  removeWords(words.map((w) => w.id));
                  for (const p of alive(getStudy().plans)) if (p.targetId === list.id) remove('plans', p.id);
                  remove('wordLists', list.id);
                  go('/words');
                }}
              >
                목록 지우기
              </button>
            </div>
            <div className="st-row end">
              <button
                className="btn btn-primary"
                onClick={() => {
                  put('wordLists', { ...list, name: name.trim() || list.name, days: days ? Number(days) : list.days, testDate: testDate || list.testDate });
                  setOpen(false);
                }}
              >
                저장
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

function WordSheet({ w, onClose }: { w: Word; onClose: () => void }) {
  const [term, setTerm] = useState(w.term);
  const [meaning, setMeaning] = useState(w.meaning);
  const [day, setDay] = useState(w.day === undefined ? '' : String(w.day));
  return (
    <Sheet title="단어 고치기" onClose={onClose}>
      <div className="st-form">
        <Field label="단어">
          <input className="st-input" value={term} onChange={(e) => setTerm(e.target.value)} />
        </Field>
        <Field label="뜻">
          <input className="st-input" value={meaning} onChange={(e) => setMeaning(e.target.value)} />
        </Field>
        <Field label="Day">
          <input className="st-input xs" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <p className="st-hint">
          {w.box === 0 ? '아직 안 봄' : w.learned ? '익힘' : `${w.box}번 상자 · 다음 ${w.due}`} · 틀린 횟수 {w.wrong}
        </p>
        <div className="st-row end">
          <button
            className="btn btn-sm"
            onClick={() => {
              putWords([{ ...w, box: 0, learned: false, wrong: 0, firstSeen: undefined }]);
              onClose();
            }}
          >
            처음부터 다시
          </button>
          <button
            className="btn btn-sm st-danger"
            onClick={() => {
              removeWords([w.id]);
              onClose();
            }}
          >
            지우기
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              putWords([{ ...w, term: term.trim() || w.term, meaning: meaning.trim(), day: day ? Number(day) : undefined }]);
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

/** 단어 넣기: PDF · 붙여넣기 · 사진 → 표로 확인 → 저장 */
function ImportSheet({ list, existing, onClose }: { list: WordList; existing: Word[]; onClose: () => void }) {
  const today = useToday();
  const [tab, setTab] = useState<'pdf' | 'paste' | 'photo'>(list.kind === 'book' ? 'pdf' : 'paste');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ file: File; pages: number; from: string; to: string; password?: string } | null>(null);
  const [needPw, setNeedPw] = useState<File | null>(null);
  const [pw, setPw] = useState('');
  const [keepSentences, setKeepSentences] = useState(false);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const abort = useRef<AbortController | null>(null);
  const rows: ParsedWord[] = useMemo(() => parseWords(text, existing.map((w) => w.term)), [text, existing]);
  const good = rows.filter((r, i) => !skip.has(i) && (!r.problem || r.problem === '뜻이 비어 있어요'));
  useEffect(() => () => abort.current?.abort(), []);

  async function openPdf(file: File, password?: string) {
    setBusy('PDF 여는 중…');
    try {
      const { pdfPageCount, PdfPasswordError } = await import('./wordPdf');
      try {
        const pages = await pdfPageCount(file, password);
        setPdf({ file, pages, from: '1', to: String(pages), password });
        setNeedPw(null);
      } catch (e) {
        if (e instanceof PdfPasswordError) {
          setNeedPw(file);
          if (password) toast('비밀번호가 맞지 않아요');
        } else throw e;
      }
    } catch {
      toast('PDF 를 열지 못했어요. 붙여넣기나 사진으로 넣어 주세요');
    } finally {
      setBusy(null);
    }
  }

  async function readPdfPages() {
    if (!pdf) return;
    abort.current = new AbortController();
    setBusy('읽는 중…');
    try {
      const { readPdf } = await import('./wordPdf');
      const r = await readPdf(pdf.file, { from: Number(pdf.from) || 1, to: Number(pdf.to) || pdf.pages, password: pdf.password, keepSentences, signal: abort.current.signal, onProgress: (m, ratio) => setBusy(`${m} (${Math.round(ratio * 100)}%)`) });
      setText((t) => (t.trim() ? t.trim() + '\n' : '') + r.text);
      setSkip(new Set());
      toast(r.scanned.length ? `글자가 없는 ${r.scanned.length}쪽은 글자 인식으로 읽었어요. 틀린 곳을 고쳐 주세요` : '읽은 단어를 표로 보여 드려요. 확인하고 저장하세요');
    } catch {
      toast('PDF 를 읽지 못했어요');
    } finally {
      setBusy(null);
    }
  }

  async function readPhotos(files: FileList) {
    const { readImageText } = await import('../../lib/ocr');
    let all = '';
    for (const [i, f] of [...files].entries()) {
      try {
        all += (await readImageText(f, (_s, r) => setBusy(`사진 ${i + 1}/${files.length} 읽는 중 ${Math.round(r * 100)}%`))) + '\n';
      } catch {
        setBusy(null);
        return toast('사진을 읽지 못했어요. 인터넷 연결을 확인해 주세요 (처음엔 글자 인식 자료를 받아요)');
      }
    }
    setBusy(null);
    setText((t) => (t.trim() ? t.trim() + '\n' : '') + all.trim());
  }

  function save() {
    if (!good.length) return;
    addWords(list.id, good, existing, today);
    const maxDay = Math.max(0, ...good.map((r) => r.day ?? 0));
    if (list.kind === 'book' && maxDay > (list.days ?? 0)) put('wordLists', { ...getStudy().wordLists[list.id], days: maxDay });
    toast(`${good.length}단어를 넣었어요`);
    onClose();
  }

  return (
    <Sheet title="단어 넣기" onClose={onClose} wide>
      <div className="st-seg">
        <button className={tab === 'pdf' ? 'on' : ''} onClick={() => setTab('pdf')}>
          📄 PDF
        </button>
        <button className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>
          📋 붙여넣기
        </button>
        <button className={tab === 'photo' ? 'on' : ''} onClick={() => setTab('photo')}>
          📷 사진
        </button>
      </div>
      {tab === 'pdf' && (
        <div className="st-form">
          <p className="st-hint">단어장 PDF 는 이 기기 안에서만 읽고 어디에도 올리지 않아요. 단어와 뜻만 저장해요.</p>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => e.target.files?.[0] && void openPdf(e.target.files[0])} />
          {needPw && (
            <div className="st-inline">
              <input className="st-input sm" type="password" placeholder="PDF 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button className="btn btn-sm" onClick={() => void openPdf(needPw, pw)}>
                열기
              </button>
            </div>
          )}
          {pdf && (
            <>
              <div className="st-inline wrap">
                <span>
                  {pdf.file.name} · {pdf.pages}쪽 중
                </span>
                <input className="st-input xs" inputMode="numeric" value={pdf.from} onChange={(e) => setPdf({ ...pdf, from: e.target.value.replace(/\D/g, '') })} aria-label="시작 쪽" />~
                <input className="st-input xs" inputMode="numeric" value={pdf.to} onChange={(e) => setPdf({ ...pdf, to: e.target.value.replace(/\D/g, '') })} aria-label="끝 쪽" />쪽
                <label className="st-toggle">
                  <input type="checkbox" checked={keepSentences} onChange={(e) => setKeepSentences(e.target.checked)} /> 예문도 넣기
                </label>
                <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void readPdfPages()}>
                  읽기
                </button>
                {busy && (
                  <button className="btn btn-sm" onClick={() => abort.current?.abort()}>
                    그만
                  </button>
                )}
              </div>
              <p className="st-hint">스캔한 PDF(글자 없음)는 글자 인식으로 읽어 시간이 걸려요. 쪽 범위를 좁혀 보세요.</p>
            </>
          )}
        </div>
      )}
      {tab === 'photo' && (
        <div className="st-form">
          <p className="st-hint">단어장 쪽을 찍어 주세요. 두 단으로 된 쪽은 한 단씩 잘라 찍으면 더 잘 읽어요. 사진은 저장하지 않아요.</p>
          <input type="file" accept="image/*" multiple onChange={(e) => e.target.files?.length && void readPhotos(e.target.files)} />
        </div>
      )}
      {busy && <p className="st-muted">{busy}</p>}
      <Field label={tab === 'paste' ? '한 줄에 단어 하나' : '읽은 글 (고칠 수 있어요)'} hint={<>예: <code>apple 사과</code> · <code>1. give up 포기하다</code> · 엑셀에서 두 칸 복사 · <code>Day 3</code> 줄로 Day 나누기</>}>
        <textarea className="st-input mono" rows={tab === 'paste' ? 10 : 6} value={text} onChange={(e) => (setText(e.target.value), setSkip(new Set()))} placeholder={'Day 1\nabandon 버리다\nabsorb 흡수하다'} />
      </Field>
      {rows.length > 0 && (
        <>
          <p className="st-sub">
            {good.length}단어 넣을 수 있어요 {rows.length - good.length > 0 && <span className="bad">· 빼는 줄 {rows.length - good.length}</span>}
          </p>
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th />
                  <th>단어</th>
                  <th>뜻</th>
                  <th>Day</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((r, i) => {
                  const off = skip.has(i) || (!!r.problem && r.problem !== '뜻이 비어 있어요');
                  return (
                    <tr key={i} className={off ? 'off' : r.problem ? 'warnrow' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!off}
                          disabled={!!r.problem && r.problem !== '뜻이 비어 있어요'}
                          aria-label={`${r.term} 넣기`}
                          onChange={() => {
                            const n = new Set(skip);
                            n.has(i) ? n.delete(i) : n.add(i);
                            setSkip(n);
                          }}
                        />
                      </td>
                      <td className="st-term">{r.term}</td>
                      <td>{r.meaning || <span className="bad">{r.problem}</span>}</td>
                      <td>{r.problem && r.meaning ? <span className="bad">{r.problem}</span> : r.day ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="st-row end">
        <button className="btn btn-primary" disabled={!good.length} onClick={save}>
          {good.length}단어 넣기
        </button>
      </div>
    </Sheet>
  );
}

// ===== 외우기 =====

function WordRun({ listId, mode }: { listId: string; mode: 'learn' | 'prep' | 'weak' }) {
  const d = useStudy();
  const today = useToday();
  const list = d.wordLists[listId];
  const [method, setMethod] = useState<'card' | 'quiz'>(() => (localStorage.getItem('my-study.study.word-method') === 'quiz' ? 'quiz' : 'card'));
  const [dir, setDir] = useState<'en' | 'ko'>('en');
  // 세션을 시작할 때의 단어 목록 (도중에 상자가 바뀌어도 그대로)
  const [queue, setQueue] = useState<string[] | null>(null);
  const [answered, setAnswered] = useState<Map<string, boolean>>(new Map());
  const [shown, setShown] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  function begin() {
    const all = getWords();
    const ws = listWords(all, listId);
    const v = wordListViews(getStudy(), all, today, planViews(getStudy(), all, today)).find((x) => x.list.id === listId);
    let ids: string[];
    if (mode === 'prep') ids = ws.map((w) => w.id);
    else if (mode === 'weak') ids = ws.filter((w) => w.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 20).map((w) => w.id);
    else ids = [...(v?.due ?? []), ...(v?.fresh ?? [])].map((w) => w.id);
    if (mode !== 'learn') ids = ids.sort(() => Math.random() - 0.5);
    setQueue(ids);
    setTotal(ids.length);
    setAnswered(new Map());
    try {
      localStorage.setItem('my-study.study.word-method', method);
    } catch {
      /* 무시 */
    }
  }

  if (!list || list.deleted) return <Empty icon="🤔" title="단어 목록을 찾을 수 없어요" />;
  if (!queue)
    return (
      <div className="st-page narrow">
        <div className="st-page-head">
          <button className="st-back" onClick={() => go(`/words/${listId}`)} aria-label="돌아가기">
            ‹
          </button>
          <h2>{mode === 'prep' ? '🎯 시험 대비' : mode === 'weak' ? '자주 틀리는 단어' : '오늘 외우기'}</h2>
        </div>
        <div className="st-card st-form">
          <p className="st-sub">{list.name}</p>
          <Field group label="방식">
            <div className="st-seg">
              <button className={method === 'card' ? 'on' : ''} onClick={() => setMethod('card')}>
                🃏 카드 넘기기
              </button>
              <button className={method === 'quiz' ? 'on' : ''} onClick={() => setMethod('quiz')}>
                ✅ 객관식
              </button>
            </div>
          </Field>
          <Field group label="방향">
            <div className="st-seg">
              <button className={dir === 'en' ? 'on' : ''} onClick={() => setDir('en')}>
                영어 → 뜻
              </button>
              <button className={dir === 'ko' ? 'on' : ''} onClick={() => setDir('ko')}>
                뜻 → 영어
              </button>
            </div>
          </Field>
          <p className="st-hint">
            {method === 'card' ? '먼저 떠올린 뒤 뜻을 보고 「알았다 / 몰랐다」를 눌러요. 상자 1~5번을 모두 오를 수 있어요.' : '보기 4개 중 고르기. 고르기는 떠올리기보다 쉬워서 3번 상자까지만 올라요.'}
            {mode === 'prep' && ' 시험 대비는 상자를 올리지 않고, 틀린 단어만 1번 상자로 보내요.'} 틀린 단어는 몇 장 뒤에 다시 나와요.
          </p>
          <button className="btn btn-primary btn-lg" onClick={begin}>
            시작
          </button>
        </div>
      </div>
    );

  const words = getWords();
  const cur = queue.length ? words[queue[0]] : null;
  const firstTry = answered.size;
  const right = [...answered.values()].filter(Boolean).length;

  if (!cur) {
    return (
      <div className="st-page narrow">
        <div className="st-card st-done-card">
          <div className="st-empty-icon">🎉</div>
          <h2>끝!</h2>
          <p>
            {total}단어 중 처음에 맞힌 것 {right}개 ({total ? Math.round((right / total) * 100) : 0}%)
          </p>
          <p className="st-hint">틀린 단어는 내일 다시 나와요.</p>
          <div className="st-row">
            <button className="btn btn-primary" onClick={() => go('/')}>
              오늘 화면으로
            </button>
            <button className="btn" onClick={() => go(`/words/${listId}`)}>
              목록 보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pool = alive(words).filter((w) => w.meaning);
  const field = dir === 'en' ? 'meaning' : 'term';
  const choices = method === 'quiz' ? choicesFor(cur, pool, Math.random, field) : null;
  const useQuiz = method === 'quiz' && choices;
  const ask = dir === 'en' ? cur.term : cur.meaning || cur.term;
  const ans = dir === 'en' ? cur.meaning : cur.term;

  function reply(correct: boolean) {
    if (!answered.has(cur!.id)) {
      answerWord(cur!, correct, useQuiz ? 'quiz' : 'card', mode === 'prep' ? 'prep' : ('learn' as Mode), today);
      setAnswered(new Map(answered).set(cur!.id, correct));
    }
    setQueue(requeue(queue!, correct));
    setShown(false);
    setPicked(null);
  }

  return (
    <div className="st-run">
      <div className="st-run-top">
        <button className="st-back" onClick={() => go(`/words/${listId}`)} aria-label="그만하기">
          ✕
        </button>
        <Bar value={total - queue.length} max={total} color="var(--ok)" />
        <span className="st-muted">
          {firstTry}/{total}
        </span>
      </div>
      <RunCard key={cur.id + queue.length} ask={ask} sub={dir === 'en' && cur.day !== undefined ? `Day ${cur.day}` : answered.has(cur.id) ? '다시 나온 단어' : `${BOX_LABEL[cur.box] === '새로' ? '새 단어' : `${cur.box}번 상자`}`}>
        {useQuiz ? (
          <div className="st-choices">
            {choices!.map((c, i) => {
              const state = picked ? (c === ans ? 'right' : c === picked ? 'wrong' : '') : '';
              return (
                <button
                  key={c + i}
                  className={`st-choice ${state}`}
                  disabled={!!picked}
                  onClick={() => {
                    setPicked(c);
                    setTimeout(() => reply(c === ans), c === ans ? 450 : 1300);
                  }}
                >
                  <b>{i + 1}</b> {c}
                </button>
              );
            })}
          </div>
        ) : shown ? (
          <>
            <div className="st-answer">{ans || '(뜻 없음)'}</div>
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
            {dir === 'en' ? '뜻 보기' : '단어 보기'}
          </button>
        )}
      </RunCard>
      <KeyHelp quiz={!!useQuiz} shown={shown} onShow={() => setShown(true)} onReply={reply} onPick={(i) => choices && !picked && document.querySelectorAll<HTMLButtonElement>('.st-choice')[i]?.click()} />
    </div>
  );
}

/** 문제 카드 (폰: 좌우로 밀어서 몰랐다/알았다) */
export function RunCard({ ask, sub, children }: { ask: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="st-runcard">
      {sub && <small className="st-muted">{sub}</small>}
      <div className="st-ask-text">{ask}</div>
      {children}
    </div>
  );
}

/** 키보드: 스페이스 뜻 보기, ←/1 몰랐다, →/2 알았다, 1~4 객관식 */
export function KeyHelp({ quiz, shown, onShow, onReply, onPick }: { quiz: boolean; shown: boolean; onShow: () => void; onReply: (ok: boolean) => void; onPick: (i: number) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (quiz) {
        if (/^[1-4]$/.test(e.key)) onPick(Number(e.key) - 1);
        return;
      }
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        onShow();
      } else if (shown && (e.key === 'ArrowLeft' || e.key === '1')) onReply(false);
      else if (shown && (e.key === 'ArrowRight' || e.key === '2')) onReply(true);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return <p className="st-hint center st-keys">{quiz ? '키보드 1~4로 고르기' : '스페이스: 보기 · ←: 몰랐다 · →: 알았다'}</p>;
}
