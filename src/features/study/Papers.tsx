// 기출·모의고사 풀이 기록: 옛 수능·모의고사를 찾아 풀었거나 모의고사 모음집을 푼 것.
// 점수·등급·걸린 시간·틀린 번호를 남기고, 틀린 번호는 오답 노트로, 걸린 시간은 공부 기록으로 넣을 수 있다.
import { useState } from 'react';
import { addSession } from './actions';
import { BarChart, LineChart, TableView } from './charts';
import { shortDate } from './dates';
import { parseWrongNums } from './grades';
import { alive, newId, type PastPaper } from './model';
import { notesFromPaper, numberFrequency, PAPER_KIND, paperTitle, papersOf, percent } from './papers';
import { getStudy, put, putMany, remove, useStudy } from './store';
import { minutesText } from './timer';
import { confirmDelete, Empty, Field, go, Icon, Sheet, SubjectDot, SubjectPicker, subjectsOf, tap, toast, useToday } from './ui';

/** 문제집 · 기출 풀이 바꾸기 */
export function BookTabs({ on }: { on: 'books' | 'papers' }) {
  return (
    <div className="st-seg" role="tablist" aria-label="문제집과 기출 풀이">
      <button role="tab" aria-selected={on === 'books'} className={on === 'books' ? 'on' : ''} onClick={() => go('/books')}>
        문제집
      </button>
      <button role="tab" aria-selected={on === 'papers'} className={on === 'papers' ? 'on' : ''} onClick={() => go('/books/papers')}>
        기출·모의고사 풀이
      </button>
    </div>
  );
}

const md = (x: string) => shortDate(x).replace(/\(.\)/, '');

/** sub: 'new' 이면 넣기 창, 풀이 id 면 고치기 창 */
export function Papers({ sub }: { sub?: string }) {
  const d = useStudy();
  const [picked, setSubject] = useState('');
  const [lv, setLv] = useState<'' | '고1' | '고2' | '고3'>('');
  const everything = papersOf(d);
  const lvs = (['고1', '고2', '고3'] as const).filter((l) => everything.some((p) => (p.level ?? (p.kind === 'csat' ? '고3' : '')) === l));
  const ofLv = (p: PastPaper) => !lv || (p.level ?? (p.kind === 'csat' ? '고3' : '')) === lv;
  const all = everything.filter(ofLv);
  const editing = sub === 'new' ? 'new' : sub && d.papers[sub] && !d.papers[sub].deleted ? d.papers[sub] : null;
  const subjects = subjectsOf(d).filter((s) => all.some((p) => p.subjectId === s.id));
  // 과목이 하나뿐이면 그 과목으로 (그래프·번호 분석을 바로 보이게)
  const subject = picked || (subjects.length === 1 ? subjects[0].id : '');
  const list = papersOf(d, subject || undefined).filter(ofLv);
  const pts = list.filter((p) => percent(p) !== null);
  const totalMin = list.reduce((a, p) => a + (p.minutes ?? 0), 0);
  const freq = numberFrequency(list.map((p) => p.wrong));
  const top = [...freq.counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5);
  const groups: { label: string; value: number }[] = [];
  for (let a = 1; a <= freq.max; a += 5) {
    let n = 0;
    for (let q = a; q < a + 5; q++) n += freq.counts.get(q) ?? 0;
    groups.push({ label: `${a}~${a + 4}`, value: n });
  }
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>기출·모의고사 풀이</h2>
        <button className="btn btn-sm btn-primary" onClick={() => go('/books/papers/new')}>
          <Icon name="plus" /> 푼 것 넣기
        </button>
      </div>
      <BookTabs on="papers" />

      {!everything.length ? (
        <Empty icon="📄" title="푼 기출·모의고사를 기록해 보세요">
          <p>옛 수능·모의평가·학력평가를 찾아 풀었거나 모의고사 모음집을 풀었으면, 점수·걸린 시간·틀린 번호를 남겨요. 틀린 번호는 오답 노트로 바로 넣을 수 있어요.</p>
          <button className="btn btn-primary" onClick={() => go('/books/papers/new')}>
            푼 것 넣기
          </button>
        </Empty>
      ) : (
        <>
          {lvs.length > 1 && (
            <div className="st-seg sm" aria-label="학년">
              <button className={!lv ? 'on' : ''} onClick={() => setLv('')}>
                전체
              </button>
              {lvs.map((l) => (
                <button key={l} className={lv === l ? 'on' : ''} onClick={() => setLv(l)}>
                  {l === '고3' ? '고3·수능' : l}
                </button>
              ))}
            </div>
          )}
          {subjects.length > 1 && (
            <div className="st-chips">
              <button type="button" className={`st-chip ${!subject ? 'on' : ''}`} aria-pressed={!subject} onClick={() => setSubject('')}>
                전체
              </button>
              {subjects.map((s) => (
                <button key={s.id} type="button" className={`st-chip ${subject === s.id ? 'on' : ''}`} aria-pressed={subject === s.id} onClick={() => setSubject(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <section className="st-card">
            <div className="st-stat-row">
              <div>
                <small>푼 시험</small>
                <b>{list.length}회</b>
              </div>
              <div>
                <small>평균 점수</small>
                <b>{pts.length ? `${Math.round((pts.reduce((a, p) => a + percent(p)!, 0) / pts.length) * 10) / 10}점` : '—'}</b>
              </div>
              <div>
                <small>푼 시간</small>
                <b>{minutesText(totalMin)}</b>
              </div>
            </div>
            {subject && pts.length > 1 && <LineChart label="점수 흐름 (100점 기준)" points={pts.map((p) => ({ label: md(p.date), title: p.title, y: percent(p) }))} domain={[0, 100]} format={(v) => `${Math.round(v)}`} />}
          </section>

          {freq.counts.size > 0 && subject && (
            <section className="st-card">
              <h3 className="st-h">자주 틀리는 번호</h3>
              <p className="st-sub">{top.map(([q, c]) => `${q}번(${c}번)`).join(' · ')}</p>
              <BarChart label="번호대별 틀린 수" height={140} bars={groups} format={(v) => `${v}개`} />
              <TableView head={['번호', '틀린 횟수']} rows={[...freq.counts.entries()].sort((a, b) => a[0] - b[0]).map(([q, c]) => [`${q}번`, `${c}번`])} />
            </section>
          )}

          <section className="st-card">
            {[...list].reverse().map((p) => (
              <div key={p.id} className="st-item st-tap" {...tap(() => go(`/books/papers/${p.id}`))}>
                <SubjectDot id={p.subjectId} d={d} />
                <div className="st-item-main">
                  <div className="st-item-title">
                    {p.title} <span className="st-muted">· {d.subjects[p.subjectId]?.name ?? '과목'}</span>
                  </div>
                  <div className="st-item-sub">
                    {shortDate(p.date)} 풀이
                    {p.score !== undefined && ` · ${p.score}/${p.full ?? 100}점`}
                    {p.grade !== undefined && ` · ${p.grade}등급`}
                    {p.minutes !== undefined && ` · ${minutesText(p.minutes)}`}
                    {p.wrong.length > 0 && ` · 틀린 ${p.wrong.length}개`}
                  </div>
                  {p.memo && <div className="st-item-sub">{p.memo}</div>}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      {editing && <PaperSheet item={editing === 'new' ? undefined : editing} onClose={() => go('/books/papers')} />}
    </div>
  );
}

function PaperSheet({ item, onClose }: { item?: PastPaper; onClose: () => void }) {
  const d = useStudy();
  const today = useToday();
  const [subjectId, setSubjectId] = useState(item?.subjectId ?? subjectsOf(d)[0]?.id ?? '');
  const [kind, setKind] = useState<PastPaper['kind']>(item?.kind ?? 'csat');
  const [level, setLevel] = useState<NonNullable<PastPaper['level']>>(item?.level ?? '고3');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [title, setTitle] = useState(item?.title ?? '');
  const [touched, setTouched] = useState(!!item);
  const [bookId, setBookId] = useState(item?.bookId ?? '');
  const [date, setDate] = useState(item?.date ?? today);
  const [score, setScore] = useState(item?.score?.toString() ?? '');
  const [full, setFull] = useState(item?.full?.toString() ?? '100');
  const [grade, setGrade] = useState(item?.grade?.toString() ?? '');
  const [minutes, setMinutes] = useState(item?.minutes?.toString() ?? '');
  const [wrong, setWrong] = useState(item?.wrong.join(', ') ?? '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [toNotes, setToNotes] = useState(!item);
  const [toTime, setToTime] = useState(!item);
  const nums = parseWrongNums(wrong);
  const autoTitle = paperTitle(kind, year, month);
  const name = touched ? title : autoTitle;
  const books = alive(d.books).filter((b) => !subjectId || b.subjectId === subjectId);
  const n = (v: string, lo: number, hi: number) => {
    const x = Number(v.replace(',', '.'));
    return v.trim() && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined;
  };
  const bad = (score && n(score, 0, 1000) === undefined) || (grade && n(grade, 1, 9) === undefined) || (minutes && n(minutes, 0, 600) === undefined);

  function save() {
    if (!subjectId || !name.trim() || !date || bad) return;
    const p: PastPaper = {
      ...(item ?? { created: Date.now() }),
      id: item?.id ?? newId(),
      updatedAt: item?.updatedAt ?? 0,
      subjectId,
      kind,
      level,
      title: name.trim().slice(0, 60),
      bookId: bookId || undefined,
      date,
      score: n(score, 0, 1000),
      full: n(full, 1, 1000),
      grade: n(grade, 1, 9),
      minutes: n(minutes, 0, 600),
      wrong: nums,
      memo: memo.trim() || undefined,
    } as PastPaper;
    put('papers', p);
    const notes = toNotes ? notesFromPaper(getStudy(), p, today) : [];
    if (notes.length) putMany(notes.map((x) => ({ c: 'notes' as const, item: x as never })));
    if (toTime && p.minutes) addSession({ subjectId, start: new Date(`${date}T12:00:00`).getTime(), end: new Date(`${date}T12:00:00`).getTime() + p.minutes * 60_000, minutes: p.minutes, date, kind: 'manual' });
    toast(`기록했어요${notes.length ? ` · 오답 노트에 ${notes.length}문제` : ''}${toTime && p.minutes ? ' · 공부 시간에도 넣었어요' : ''}`);
    onClose();
  }

  return (
    <Sheet title={item ? '풀이 기록 고치기' : '푼 기출·모의고사 넣기'} onClose={onClose} wide>
      <div className="st-form">
        <div className="st-seg sm" aria-label="학년">
          {(['고1', '고2', '고3'] as const).map((l) => (
            <button key={l} type="button" className={level === l ? 'on' : ''} aria-pressed={level === l} onClick={() => setLevel(l)}>
              {l === '고3' ? '고3·수능' : l}
            </button>
          ))}
        </div>
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field group label="종류">
          <div className="st-seg">
            {(Object.keys(PAPER_KIND) as PastPaper['kind'][]).map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {PAPER_KIND[k]}
              </button>
            ))}
          </div>
        </Field>
        {!item && (
          <div className="st-inline wrap">
            <input className="st-input xs" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="해" aria-label="해 (예: 2025)" />
            {kind !== 'csat' && <input className="st-input xs" inputMode="numeric" value={month} onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="월" aria-label="월" />}
            <span className="st-muted">→ 이름을 자동으로 지어요</span>
          </div>
        )}
        <Field label="시험 이름">
          <input
            className="st-input"
            value={name}
            onChange={(e) => {
              setTouched(true);
              setTitle(e.target.value);
            }}
            placeholder="예: 2025학년도 수능 · 2024년 6월 모의평가 · ○○ 모의고사 3회"
          />
        </Field>
        {books.length > 0 && (
          <select className="st-input" value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="모의고사 모음 문제집">
            <option value="">모의고사 모음 문제집 (선택)</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <div className="st-inline wrap">
          <label className="st-cond-time">
            푼 날
            <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="st-cond-time">
            점수
            <span className="st-inline">
              <input className="st-input xs" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} aria-label="점수" />/
              <input className="st-input xs" inputMode="numeric" value={full} onChange={(e) => setFull(e.target.value)} aria-label="만점" />
            </span>
          </label>
          <label className="st-cond-time">
            등급
            <input className="st-input xs" inputMode="numeric" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="등급" />
          </label>
          <label className="st-cond-time">
            걸린 시간(분)
            <input className="st-input xs" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} aria-label="걸린 시간 (분)" />
          </label>
        </div>
        {bad && <p className="bad">숫자를 확인해 주세요 (등급 1~9, 시간 600분까지)</p>}
        <Field label="틀린 번호" hint={nums.length ? `${nums.length}문제: ${nums.join(', ')}` : '예: 3, 7, 21~23'}>
          <input className="st-input" value={wrong} onChange={(e) => setWrong(e.target.value.replace(/[^\d,~\-\s]/g, ''))} placeholder="3, 7, 21~23" />
        </Field>
        <Field label="한마디 (선택)">
          <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 시간 배분 실패 — 21번에서 10분 씀" />
        </Field>
        <label className="st-toggle">
          <input type="checkbox" checked={toNotes} onChange={(e) => setToNotes(e.target.checked)} /> 틀린 번호를 오답 노트에도 넣기 (내일부터 다시 풀기)
        </label>
        {!item && (
          <label className="st-toggle">
            <input type="checkbox" checked={toTime} onChange={(e) => setToTime(e.target.checked)} /> 걸린 시간을 공부 기록에도 넣기
          </label>
        )}
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`「${item.title}」 풀이 기록`)) return;
                remove('papers', item.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!subjectId || !name.trim() || !date || !!bad} onClick={save}>
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
