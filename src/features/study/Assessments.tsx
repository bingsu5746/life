// 수행평가: 과목 · 내는 날 · 준비할 것 체크리스트
import { useState } from 'react';
import { addDays, dday, diffDays, shortDate } from './dates';
import { scopeLines, scopeText } from './exams';
import { ExamTabs } from './Exams';
import { alive, newId, type Assessment } from './model';
import { put, remove, useStudy } from './store';
import { Bar, Check, confirmDelete, Empty, Field, go, Icon, Sheet, SubjectDot, SubjectPicker, subjectsOf, tap, toast, useToday } from './ui';

export function toggleStep(a: Assessment, stepId: string) {
  put('assessments', { ...a, steps: a.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done, at: Date.now() } : s)) });
}

/** 다가오는 수행평가 (안 끝낸 것, 내는 날 순) */
export const upcomingTasks = (list: Assessment[], today: string) => list.filter((a) => !a.done && a.due >= today).sort((a, b) => a.due.localeCompare(b.due));

/** sub: 'new' 이면 넣기 창 */
export function Assessments({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState<Assessment | 'new' | null>(sub === 'new' ? 'new' : null);
  const all = alive(d.assessments);
  const up = upcomingTasks(all, today);
  const late = all.filter((a) => !a.done && a.due < today).sort((a, b) => b.due.localeCompare(a.due));
  const done = all.filter((a) => a.done).sort((a, b) => b.due.localeCompare(a.due));
  const close = () => {
    setEdit(null);
    if (sub) go('/exams/tasks');
  };
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>수행평가</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
          <Icon name="plus" /> 수행평가 넣기
        </button>
      </div>
      <ExamTabs on="tasks" />
      {!all.length ? (
        <Empty title="수행평가를 넣어 보세요">
          <p>내는 날과 준비할 것(자료 찾기, 초안, 발표 연습 등)을 넣으면 D-day 와 체크리스트를 오늘 화면에도 보여 드려요.</p>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            수행평가 넣기
          </button>
        </Empty>
      ) : (
        <>
          {!up.length && <p className="st-hint">다가오는 수행평가가 없어요.</p>}
          <div className="st-exam-grid">
            {up.map((a) => (
              <TaskCard key={a.id} a={a} today={today} onEdit={() => setEdit(a)} />
            ))}
          </div>
          {late.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">날짜가 지났는데 끝내지 않은 것</h3>
              {late.map((a) => (
                <div key={a.id} className="st-item">
                  <SubjectDot id={a.subjectId} d={d} />
                  <div className="st-item-main" {...tap(() => setEdit(a))}>
                    <div className="st-item-title">{a.title}</div>
                    <div className="st-item-sub bad">{shortDate(a.due)} · {diffDays(a.due, today)}일 지남</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => put('assessments', { ...a, done: true })}>
                    끝냈어요
                  </button>
                </div>
              ))}
            </section>
          )}
          {done.length > 0 && (
            <details className="st-card st-more">
              <summary>끝낸 수행평가 {done.length}</summary>
              {done.map((a) => (
                <div key={a.id} className="st-item st-tap" {...tap(() => setEdit(a))}>
                  <SubjectDot id={a.subjectId} d={d} />
                  <div className="st-item-main">
                    <div className="st-item-title done">{a.title}</div>
                    <div className="st-item-sub">
                      {d.subjects[a.subjectId]?.name ?? '과목'} · {shortDate(a.due)}
                    </div>
                  </div>
                </div>
              ))}
            </details>
          )}
        </>
      )}
      {edit && <TaskSheet item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
    </div>
  );
}

export function TaskCard({ a, today, onEdit, compact }: { a: Assessment; today: string; onEdit?: () => void; compact?: boolean }) {
  const d = useStudy();
  const n = a.steps.filter((s) => s.done).length;
  const steps = compact ? a.steps.filter((s) => !s.done).slice(0, 2) : a.steps;
  return (
    <section className={compact ? 'st-task compact' : 'st-card st-task'}>
      <div className="st-task-head" {...(onEdit ? tap(onEdit) : {})}>
        <span className="st-exam-dday">{dday(today, a.due)}</span>
        <div>
          <strong>{a.title}</strong>
          <small>
            <SubjectDot id={a.subjectId} d={d} /> {d.subjects[a.subjectId]?.name ?? '과목'} · {shortDate(a.due)}
          </small>
        </div>
      </div>
      {a.steps.length > 0 && !compact && <Bar value={n} max={a.steps.length} label={`${a.title} 준비`} />}
      {steps.map((s) => (
        <div key={s.id} className="st-item">
          <Check on={s.done} label={`${s.text} 했어요`} onClick={() => toggleStep(a, s.id)} />
          <div className="st-item-main">
            <div className={`st-item-title ${s.done ? 'done' : ''}`}>{s.text}</div>
          </div>
        </div>
      ))}
      {compact && a.steps.length > 0 && (
        <small className="st-muted">
          준비 {n}/{a.steps.length}
        </small>
      )}
      {!compact && a.steps.length > 0 && n === a.steps.length && (
        <button className="btn btn-sm" onClick={() => (put('assessments', { ...a, done: true }), toast('수행평가를 끝냈어요'))}>
          다 냈어요
        </button>
      )}
      {!compact && a.memo && <p className="st-hint">{a.memo}</p>}
    </section>
  );
}

function TaskSheet({ item, today, onClose }: { item?: Assessment; today: string; onClose: () => void }) {
  const d = useStudy();
  const [subjectId, setSubjectId] = useState(item?.subjectId ?? subjectsOf(d)[0]?.id ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [due, setDue] = useState(item?.due ?? addDays(today, 14));
  const [text, setText] = useState(item ? scopeText(item.steps) : '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  const steps = scopeLines(text, item?.steps);
  function save() {
    if (!subjectId || !title.trim() || !due) return;
    put('assessments', { ...(item ?? { done: false, created: Date.now() }), id: item?.id ?? newId(), subjectId, title: title.trim().slice(0, 60), due, steps, memo: memo.trim() || undefined } as Assessment);
    toast(item ? '고쳤어요' : '수행평가를 넣었어요');
    onClose();
  }
  return (
    <Sheet title={item ? '수행평가 고치기' : '수행평가 넣기'} onClose={onClose}>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field label="무엇을">
          <input className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 독서 감상문 · 영어 말하기 발표 · 과학 실험 보고서" />
        </Field>
        <Field label="내는 날 · 발표하는 날">
          <input className="st-input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="준비할 것 (한 줄에 하나, 선택)" hint="체크하며 준비해요. 예: 주제 정하기 / 자료 찾기 / 초안 쓰기 / 발표 연습">
          <textarea className="st-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'주제 정하기\n자료 찾기\n초안 쓰기\n발표 연습'} />
        </Field>
        <Field label="메모 (선택)">
          <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 평가 기준 — 내용 40, 발표 30, 질의응답 30" />
        </Field>
        <div className="st-row end">
          {item && (
            <>
              <button
                className="btn btn-sm st-danger"
                onClick={() => {
                  if (!confirmDelete(`「${item.title}」 수행평가`)) return;
                  remove('assessments', item.id);
                  onClose();
                }}
              >
                지우기
              </button>
              <button className="btn btn-sm" onClick={() => (put('assessments', { ...item, done: !item.done }), onClose())}>
                {item.done ? '다시 하는 중으로' : '끝냈어요'}
              </button>
            </>
          )}
          <button className="btn btn-primary" disabled={!subjectId || !title.trim() || !due} onClick={save}>
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
