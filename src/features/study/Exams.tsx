// 시험 · 시험 범위 · 학교 진도
import { useState } from 'react';
import { addDays, dday, diffDays, longDate, shortDate } from './dates';
import { addProgress, daysAgo, examEnd, examProgress, nextSubjects, scopeDate, scopeLines, scopeText, upcomingExams } from './exams';
import { alive, newId, type Exam, type ExamScope, type Subject } from './model';
import { put, useStudy } from './store';
import { removeExam } from './actions';
import { Bar, Check, confirmDelete, Empty, Field, go, Icon, Menu, Sheet, SubjectDot, SubjectPicker, subjectsOf, toast, useToday, tap } from './ui';

/** id: 'new' 이면 시험 넣기 창, 'progress' 면 학교 진도 적기 창, 그 밖엔 시험 하나 */
export function Exams({ id }: { id?: string }) {
  if (id && id !== 'new' && id !== 'progress') return <ExamDetail id={id} />;
  return <ExamList adding={id === 'new'} progress={id === 'progress'} />;
}

function ExamList({ adding, progress }: { adding: boolean; progress: boolean }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState<Exam | 'new' | null>(adding ? 'new' : null);
  const [prog, setProg] = useState<Subject | 'pick' | null>(progress ? 'pick' : null);
  const upcoming = upcomingExams(d, today);
  const past = alive(d.exams)
    .filter((e) => examEnd(e) < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const subjects = subjectsOf(d);
  const close = (f: () => void) => () => {
    f();
    if (adding || progress) go('/exams');
  };
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>시험</h2>
      </div>

      {!upcoming.length ? (
        <Empty title="다가오는 시험이 없어요">
          <p>시험 날과 과목별 시험 범위를 넣으면 D-day 와 범위 체크리스트를 보여 드려요.</p>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            시험 넣기
          </button>
        </Empty>
      ) : (
        <div className="st-exam-grid">
          {upcoming.map((e) => {
            const p = examProgress(e);
            return (
              <button key={e.id} className="st-exam-card" onClick={() => go(`/exams/${e.id}`)}>
                <span className="st-exam-dday">{dday(today, e.date)}</span>
                <strong>{e.name}</strong>
                <small>
                  {longDate(e.date)}
                  {examEnd(e) !== e.date && ` ~ ${shortDate(examEnd(e))}`}
                </small>
                {p.total > 0 ? (
                  <>
                    <Bar value={p.done} max={p.total} label="시험 범위" />
                    <small>
                      범위 {p.done}/{p.total} · 과목 {e.scopes?.length ?? 0}개
                    </small>
                  </>
                ) : (
                  <small className="st-muted">시험 범위를 넣어 보세요</small>
                )}
              </button>
            );
          })}
        </div>
      )}

      <section className="st-card">
        <div className="st-inline between">
          <h3 className="st-h">학교 진도</h3>
          {subjects.length > 0 && (
            <button className="st-iconbtn" aria-label="학교 진도 적기" onClick={() => setProg('pick')}>
              <Icon name="plus" />
            </button>
          )}
        </div>
        {!subjects.length ? (
          <p className="st-hint">과목을 먼저 만들면 과목마다 학교에서 어디까지 나갔는지 적어 둘 수 있어요.</p>
        ) : (
          subjects.map((s) => {
            const last = s.progress?.[s.progress.length - 1];
            return (
              <div key={s.id} className="st-item st-tap" {...tap(() => setProg(s))}>
                <SubjectDot id={s.id} d={d} />
                <div className="st-item-main">
                  <div className="st-item-title">{s.name}</div>
                  <div className="st-item-sub">{last ? `${last.text} · ${daysAgo(today, last.date) === 0 ? '오늘' : `${daysAgo(today, last.date)}일 전`}` : '아직 기록 없음'}</div>
                </div>
                <Icon name="chevron" />
              </div>
            );
          })
        )}
      </section>

      {past.length > 0 && (
        <details className="st-card st-more">
          <summary>지난 시험 {past.length}</summary>
          {past.map((e) => (
            <div key={e.id} className="st-item st-tap" {...tap(() => go(`/exams/${e.id}`))}>
              <div className="st-item-main">
                <div className="st-item-title">{e.name}</div>
                <div className="st-item-sub">{longDate(e.date)}</div>
              </div>
            </div>
          ))}
        </details>
      )}

      {edit && <ExamSheet exam={edit === 'new' ? undefined : edit} today={today} onClose={close(() => setEdit(null))} />}
      {prog === 'pick' && (
        <Sheet title="어느 과목 진도인가요?" onClose={close(() => setProg(null))}>
          <div className="st-addlist">
            {subjects.map((s) => (
              <button key={s.id} className="st-addrow" onClick={() => setProg(s)}>
                <span>
                  <b>{s.name}</b>
                  <small>{s.progress?.length ? s.progress[s.progress.length - 1].text : '아직 기록 없음'}</small>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {prog && prog !== 'pick' && <ProgressSheet subject={d.subjects[prog.id] ?? prog} today={today} onClose={close(() => setProg(null))} />}
    </div>
  );
}

function ProgressSheet({ subject, today, onClose }: { subject: Subject; today: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const list = [...(subject.progress ?? [])].reverse();
  return (
    <Sheet title={`${subject.name} 학교 진도`} onClose={onClose}>
      <form
        className="st-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          put('subjects', { ...subject, progress: addProgress(subject.progress, today, text.trim()) });
          toast('학교 진도를 적었어요');
          onClose();
        }}
      >
        <input className="st-input" autoFocus placeholder="오늘 어디까지 나갔나요? (예: 2단원 3절, 교과서 54쪽)" value={text} onChange={(e) => setText(e.target.value)} aria-label="학교 진도" />
        <p className="st-hint">Enter 로 저장해요. 같은 날 다시 적으면 그날 기록을 고쳐요.</p>
      </form>
      {list.length > 0 && (
        <div className="st-progress-log">
          {list.map((p) => (
            <div key={p.date} className="st-item">
              <small className="st-muted nowrap">{shortDate(p.date)}</small>
              <div className="st-item-main">{p.text}</div>
              <button
                className="st-x"
                aria-label="이 기록 지우기"
                onClick={() => put('subjects', { ...subject, progress: (subject.progress ?? []).filter((x) => x.date !== p.date) })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function ExamSheet({ exam, today, onClose }: { exam?: Exam; today: string; onClose: () => void }) {
  const [name, setName] = useState(exam?.name ?? '');
  const [date, setDate] = useState(exam?.date ?? addDays(today, 30));
  return (
    <Sheet title={exam ? '시험 고치기' : '시험 넣기'} onClose={onClose}>
      <form
        className="st-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !date) return;
          const id = exam?.id ?? newId();
          put('exams', { ...(exam ?? { scopes: [] }), id, name: name.trim(), date });
          onClose();
          if (!exam) go(`/exams/${id}`);
        }}
      >
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2학기 기말고사" required />
        </Field>
        <Field label="시험 시작 날" hint="과목마다 날이 다르면 범위를 넣을 때 과목 날짜를 따로 정해요">
          <input className="st-input sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <button className="btn btn-primary">{exam ? '저장' : '넣고 범위 쓰기'}</button>
      </form>
    </Sheet>
  );
}

function ExamDetail({ id }: { id: string }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState(false);
  const [scope, setScope] = useState<ExamScope | 'new' | null>(null);
  const exam = d.exams[id];
  if (!exam || exam.deleted)
    return (
      <Empty title="시험을 찾을 수 없어요">
        <button className="btn" onClick={() => go('/exams')}>
          시험 목록
        </button>
      </Empty>
    );
  const p = examProgress(exam);
  const scopes = [...(exam.scopes ?? [])].sort((a, b) => scopeDate(exam, a).localeCompare(scopeDate(exam, b)));
  const plans = alive(d.plans).filter((pl) => pl.examId === exam.id && !pl.finished);
  const saveScopes = (list: ExamScope[]) => put('exams', { ...exam, scopes: list });
  const toggle = (s: ExamScope, lineId: string) => saveScopes((exam.scopes ?? []).map((x) => (x.id === s.id ? { ...x, lines: x.lines.map((l) => (l.id === lineId ? { ...l, done: !l.done, at: Date.now() } : l)) } : x)));
  const left = diffDays(today, exam.date);

  return (
    <div className="st-page">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go('/exams')} aria-label="시험 목록">
          ‹
        </button>
        <h2>{exam.name}</h2>
        <Menu
          items={[
            { label: '과목 범위 넣기', onClick: () => setScope('new') },
            { label: '이름·날짜 고치기', onClick: () => setEdit(true) },
            {
              label: '시험 지우기',
              danger: true,
              onClick: () => {
                if (!confirmDelete(`「${exam.name}」`)) return;
                removeExam(exam.id);
                go('/exams');
              },
            },
          ]}
        />
      </div>

      <section className="st-card st-exam-hero">
        <span className="st-exam-dday big">{dday(today, exam.date)}</span>
        <div>
          <strong>{longDate(exam.date)}</strong>
          {examEnd(exam) !== exam.date && <span className="st-muted"> ~ {longDate(examEnd(exam))}</span>}
          <p className="st-sub">{left > 0 ? `${left}일 남았어요` : left === 0 ? '오늘이 시험이에요' : '시험이 끝났어요'}</p>
        </div>
        {p.total > 0 && (
          <div className="st-exam-hero-bar">
            <Bar value={p.done} max={p.total} label="시험 범위" />
            <small>
              범위 {p.done}/{p.total} ({Math.round((p.done / p.total) * 100)}%)
            </small>
          </div>
        )}
      </section>

      {scopes.map((s) => {
        const sd = scopeDate(exam, s);
        const n = s.lines.filter((l) => l.done).length;
        return (
          <section key={s.id} className="st-card">
            <div className="st-scope-head st-tap" {...tap(() => setScope(s))} title="범위 고치기">
              <SubjectDot id={s.subjectId} d={d} />
              <b>{d.subjects[s.subjectId]?.name ?? '과목'}</b>
              <span className="st-pill">
                {shortDate(sd)} {dday(today, sd)}
              </span>
              <small className="st-muted">
                {n}/{s.lines.length}
              </small>
            </div>
            {s.lines.map((l) => (
              <div key={l.id} className="st-item">
                <Check on={l.done} label={`${l.text} 다 했어요`} onClick={() => toggle(s, l.id)} />
                <div className="st-item-main">
                  <div className={`st-item-title ${l.done ? 'done' : ''}`}>{l.text}</div>
                </div>
              </div>
            ))}
            {s.note && <p className="st-hint">{s.note}</p>}
            {(() => {
              const last = d.subjects[s.subjectId]?.progress?.slice(-1)[0];
              return last ? <p className="st-hint">학교 진도: {last.text} ({shortDate(last.date)})</p> : null;
            })()}
          </section>
        );
      })}

      <button className="st-addline" onClick={() => setScope('new')}>
        <Icon name="plus" /> 과목 시험 범위 넣기
      </button>

      {plans.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">이 시험에 맞춘 계획</h3>
          {plans.map((pl) => {
            const owner = pl.target === 'book' ? d.books[pl.targetId] : d.wordLists[pl.targetId];
            return (
              <div key={pl.id} className="st-item st-tap" {...tap(() => go(pl.target === 'book' ? `/books/${pl.targetId}` : `/words/${pl.targetId}`))}>
                <SubjectDot id={owner?.subjectId} d={d} />
                <div className="st-item-main">
                  <div className="st-item-title">{owner?.name}</div>
                </div>
                <Icon name="chevron" />
              </div>
            );
          })}
        </section>
      )}

      {edit && <ExamSheet exam={exam} today={today} onClose={() => setEdit(false)} />}
      {scope && (
        <ScopeSheet
          exam={exam}
          scope={scope === 'new' ? undefined : scope}
          onClose={() => setScope(null)}
          onSave={(next) => {
            const list = exam.scopes ?? [];
            saveScopes(list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [...list, next]);
            setScope(null);
          }}
          onDelete={(sid) => {
            saveScopes((exam.scopes ?? []).filter((x) => x.id !== sid));
            setScope(null);
          }}
        />
      )}
    </div>
  );
}

function ScopeSheet({ exam, scope, onClose, onSave, onDelete }: { exam: Exam; scope?: ExamScope; onClose: () => void; onSave: (s: ExamScope) => void; onDelete: (id: string) => void }) {
  const d = useStudy();
  const used = new Set((exam.scopes ?? []).filter((s) => s.id !== scope?.id).map((s) => s.subjectId));
  const [subjectId, setSubjectId] = useState(scope?.subjectId ?? subjectsOf(d).find((s) => !used.has(s.id))?.id ?? '');
  const [date, setDate] = useState(scope?.date ?? exam.date);
  const [text, setText] = useState(scope ? scopeText(scope.lines) : '');
  const [note, setNote] = useState(scope?.note ?? '');
  const lines = scopeLines(text, scope?.lines);
  return (
    <Sheet title={scope ? '시험 범위 고치기' : '과목 시험 범위'} onClose={onClose} wide>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        {used.has(subjectId) && <p className="bad">이 과목 범위는 이미 있어요. 그 과목을 눌러 고쳐 주세요.</p>}
        <Field label="이 과목 시험 날">
          <input className="st-input sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="시험 범위 (한 줄에 하나, 체크하며 공부해요)" hint="예: 교과서 12~80쪽 / 1~3단원 / 프린트 1~5 / 쎈 B단계">
          <textarea className="st-input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'교과서 12~80쪽\n1~3단원 개념 정리\n프린트 1~5'} />
        </Field>
        <Field label="메모 (선택)">
          <input className="st-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 서술형 30%, 수행평가 반영" />
        </Field>
        <div className="st-row end">
          {scope && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete('이 과목 범위') && onDelete(scope.id)}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!subjectId || !lines.length || used.has(subjectId)}
            onClick={() => onSave({ id: scope?.id ?? newId(), subjectId, date: date && date !== exam.date ? date : undefined, lines, note: note.trim() || undefined, at: Date.now() })}
          >
            저장 ({lines.length}줄)
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 오늘 화면 맨 위: 가장 가까운 시험을 크게 */
export function DdayHero({ today }: { today: string }) {
  const d = useStudy();
  const exams = upcomingExams(d, today);
  if (!exams.length)
    return (
      <button className="st-dday-empty" onClick={() => go('/exams/new')}>
        시험 날을 넣으면 여기에 D-day 가 크게 보여요 <Icon name="chevron" />
      </button>
    );
  const [e, ...rest] = exams;
  const p = examProgress(e);
  const subs = nextSubjects(e, today).slice(0, 4);
  const left = diffDays(today, e.date);
  return (
    <section className="st-hero" {...tap(() => go(`/exams/${e.id}`))} aria-label={`${e.name} ${dday(today, e.date)}`}>
      <div className="st-hero-main">
        <span className="st-hero-dday">{left > 0 ? `D-${left}` : left === 0 ? 'D-day' : '시험 중'}</span>
        <div>
          <strong>{e.name}</strong>
          <small>{longDate(e.date)}</small>
        </div>
      </div>
      {p.total > 0 && (
        <div className="st-hero-bar">
          <Bar value={p.done} max={p.total} label="시험 범위" />
          <small>
            시험 범위 {p.done}/{p.total}
          </small>
        </div>
      )}
      {subs.length > 0 && (
        <div className="st-hero-subs">
          {subs.map((s) => (
            <span key={s.id}>
              {d.subjects[s.subjectId]?.name ?? '과목'} <b>{dday(today, scopeDate(e, s))}</b>
              <small>
                {s.lines.filter((l) => l.done).length}/{s.lines.length}
              </small>
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="st-hero-more">
          {rest.slice(0, 3).map((x) => (
            <span key={x.id}>
              {x.name} {dday(today, x.date)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
