// 예습: 수업 전에 미리 볼 곳을 적어 두고, 예습하며 궁금한 점을 남기고, 수업 뒤에 이해했는지 확인한다.
// (설정 → 메뉴에서 이 칸을 숨길 수 있다)
import { useState } from 'react';
import { addDays, diffDays, shortDate } from './dates';
import { alive, newId, type PreviewItem } from './model';
import { put, remove, useStudy } from './store';
import { Check, confirmDelete, Empty, Field, go, Icon, Sheet, SubjectDot, SubjectPicker, subjectsOf, tap, toast, useToday } from './ui';

const AFTER: Record<NonNullable<PreviewItem['after']>, string> = { ok: '이해했어요', some: '조금 헷갈려요', no: '모르겠어요' };

/** 수업 날을 말로: 오늘 수업 · 내일 수업 · 10/28(화) 수업 · 지난 수업 */
export function classDayText(today: string, date: string) {
  const n = diffDays(today, date);
  if (n === 0) return '오늘 수업';
  if (n === 1) return '내일 수업';
  if (n < 0) return `${shortDate(date)} 수업 (지남)`;
  return `${shortDate(date)} 수업`;
}

/** 오늘 화면에 보일 예습: 오늘·내일 수업인데 아직 안 한 것 (지난 것 포함) */
export function previewsForToday(list: PreviewItem[], today: string) {
  return list.filter((p) => !p.done && p.date <= addDays(today, 1)).sort((a, b) => a.date.localeCompare(b.date));
}

export function togglePreview(p: PreviewItem) {
  put('previews', { ...p, done: !p.done, doneAt: p.done ? undefined : Date.now() });
}

/** sub: 'new' 이면 넣기 창 */
export function Preview({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState<PreviewItem | 'new' | null>(sub === 'new' ? 'new' : null);
  const all = alive(d.previews);
  const todo = all.filter((p) => !p.done).sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  // 수업이 끝났는데 이해했는지 아직 안 적은 것
  const check = all.filter((p) => p.done && p.date <= today && !p.after).sort((a, b) => a.date.localeCompare(b.date));
  // 수업 뒤에도 헷갈린 것: 다시 볼 것
  const again = all.filter((p) => p.after === 'some' || p.after === 'no').sort((a, b) => b.date.localeCompare(a.date));
  const past = all
    .filter((p) => p.done && (p.date > today || p.after === 'ok'))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
  const weekFrom = addDays(today, -6);
  const weekDone = all.filter((p) => p.done && p.doneAt && p.doneAt >= new Date(`${weekFrom}T00:00:00`).getTime()).length;
  const close = () => {
    setEdit(null);
    if (sub) go('/preview');
  };

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>예습</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
          <Icon name="plus" /> 예습 넣기
        </button>
      </div>

      {!all.length ? (
        <Empty title="예습할 곳을 적어 보세요">
          <p>수업 전에 미리 볼 곳(교과서 쪽·단원)을 넣으면 오늘 화면에 보여 드려요. 예습하며 궁금한 점을 적어 두면 수업 때 확인하고, 수업 뒤에 이해했는지 체크해요.</p>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            예습 넣기
          </button>
        </Empty>
      ) : (
        <>
          <section className="st-card">
            <div className="st-inline between">
              <h3 className="st-h">예습할 것</h3>
              <small className="st-muted">최근 7일 {weekDone}개 했어요</small>
            </div>
            {!todo.length && <p className="st-hint">남은 예습이 없어요.</p>}
            {todo.map((p) => (
              <PreviewRow key={p.id} p={p} today={today} onEdit={() => setEdit(p)} />
            ))}
          </section>

          {check.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">수업 듣고 나서 이해했나요?</h3>
              {check.map((p) => (
                <div key={p.id} className="pv-check">
                  <div className="st-item-main" {...tap(() => setEdit(p))}>
                    <div className="st-item-title">
                      <SubjectDot id={p.subjectId} d={d} /> {d.subjects[p.subjectId]?.name ?? '과목'} · {p.text}
                    </div>
                    {p.questions && <div className="st-item-sub">궁금했던 것: {p.questions}</div>}
                  </div>
                  <div className="st-inline wrap">
                    {(['ok', 'some', 'no'] as const).map((a) => (
                      <button key={a} className="btn btn-sm" onClick={() => put('previews', { ...p, after: a })}>
                        {AFTER[a]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {again.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">다시 볼 것</h3>
              {again.map((p) => (
                <div key={p.id} className="st-item">
                  <SubjectDot id={p.subjectId} d={d} />
                  <div className="st-item-main" {...tap(() => setEdit(p))}>
                    <div className="st-item-title">{p.text}</div>
                    <div className="st-item-sub">
                      {d.subjects[p.subjectId]?.name ?? '과목'} · {shortDate(p.date)} · {AFTER[p.after!]}
                      {p.questions ? ` · ${p.questions}` : ''}
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={() => (put('previews', { ...p, after: 'ok' }), toast('다시 봤어요'))}>
                    다시 봤어요
                  </button>
                </div>
              ))}
            </section>
          )}

          {past.length > 0 && (
            <details className="st-card st-more">
              <summary>한 예습 {past.length}</summary>
              {past.map((p) => (
                <PreviewRow key={p.id} p={p} today={today} onEdit={() => setEdit(p)} />
              ))}
            </details>
          )}
        </>
      )}

      {edit && <PreviewSheet item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
    </div>
  );
}

export function PreviewRow({ p, today, onEdit }: { p: PreviewItem; today: string; onEdit?: () => void }) {
  const d = useStudy();
  const late = !p.done && p.date < today;
  return (
    <div className="st-item">
      <Check on={p.done} label={`${p.text} 예습 했어요`} onClick={() => togglePreview(p)} />
      <div className="st-item-main" {...(onEdit ? tap(onEdit) : {})}>
        <div className={`st-item-title ${p.done ? 'done' : ''}`}>{p.text}</div>
        <div className="st-item-sub">
          <SubjectDot id={p.subjectId} d={d} /> {d.subjects[p.subjectId]?.name ?? '과목'} · <span className={late ? 'bad' : ''}>{classDayText(today, p.date)}</span>
          {p.questions ? ` · 궁금한 점 있음` : ''}
        </div>
      </div>
    </div>
  );
}

function PreviewSheet({ item, today, onClose }: { item?: PreviewItem; today: string; onClose: () => void }) {
  const d = useStudy();
  const [subjectId, setSubjectId] = useState(item?.subjectId ?? subjectsOf(d)[0]?.id ?? '');
  const [date, setDate] = useState(item?.date ?? addDays(today, 1));
  const [text, setText] = useState(item?.text ?? '');
  const [questions, setQuestions] = useState(item?.questions ?? '');
  const last = d.subjects[subjectId]?.progress?.slice(-1)[0];
  const quick = [
    { label: '오늘', date: today },
    { label: '내일', date: addDays(today, 1) },
    { label: '모레', date: addDays(today, 2) },
  ];
  function save() {
    if (!subjectId || !text.trim() || !date) return;
    put('previews', {
      ...(item ?? { done: false, created: Date.now() }),
      id: item?.id ?? newId(),
      subjectId,
      date,
      text: text.trim().slice(0, 100),
      questions: questions.trim().slice(0, 500) || undefined,
    } as PreviewItem);
    toast(item ? '고쳤어요' : '예습을 넣었어요');
    onClose();
  }
  return (
    <Sheet title={item ? '예습 고치기' : '예습 넣기'} onClose={onClose}>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field group label="수업 날">
          <div className="st-inline wrap">
            {quick.map((q) => (
              <button key={q.label} type="button" className={`st-chip ${date === q.date ? 'on' : ''}`} aria-pressed={date === q.date} onClick={() => setDate(q.date)}>
                {q.label}
              </button>
            ))}
            <input className="st-input sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="수업 날" />
          </div>
        </Field>
        <Field label="예습할 곳" hint={last ? `학교 진도: ${last.text} (${shortDate(last.date)}) — 그다음 부분을 적어 보세요` : '예: 3단원 2절 · 교과서 58~63쪽 · 프린트 4번'}>
          <input className="st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 교과서 58~63쪽 읽고 모르는 말 표시" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())} />
        </Field>
        <Field label="궁금한 점 (선택)" hint="예습하다 모르는 것을 적어 두면 수업 때 확인하기 좋아요">
          <textarea className="st-input" rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder="예: 삼각함수 그래프는 왜 주기가 2π 인지" />
        </Field>
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete('이 예습')) return;
                remove('previews', item.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!subjectId || !text.trim() || !date} onClick={save}>
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
