// 백지 복습: 단원 이름만 보고 기억나는 대로 쓰고 → 핵심 내용과 비교 → 빠뜨린 것 표시 → 상자 간격으로 다시
import { useState } from 'react';
import { guessMissed } from './blank';
import { shortDate } from './dates';
import { scopeLines, scopeText } from './exams';
import { alive, newId, type BlankSheet } from './model';
import { answer, dueText } from './review';
import { blanksToday } from './select';
import { getStudy, put, remove, useStudy } from './store';
import { confirmDelete, Empty, Field, go, Icon, Sheet, SubjectDot, SubjectPicker, subjectsOf, tap, toast, useToday } from './ui';

export function Blanks({ today, adding }: { today: string; adding?: boolean }) {
  const d = useStudy();
  const [edit, setEdit] = useState<BlankSheet | 'new' | null>(adding ? 'new' : null);
  const all = alive(d.blanks).sort((a, b) => a.due.localeCompare(b.due));
  const due = blanksToday(d, today);
  const close = () => {
    setEdit(null);
    if (adding) go('/review/blank');
  };
  return (
    <>
      {!all.length ? (
        <Empty title="백지 복습할 단원을 넣어 보세요">
          <p>단원 이름과 꼭 기억해야 할 핵심 내용(한 줄에 하나)을 넣어요. 교과서·노트 정리에서 옮겨 적으면 돼요.</p>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            단원 넣기
          </button>
        </Empty>
      ) : (
        <>
          <div className="st-inline between">
            <span className="st-sub">오늘 할 것 {due.length}개</span>
            <button className="btn btn-sm" onClick={() => setEdit('new')}>
              <Icon name="plus" /> 단원 넣기
            </button>
          </div>
          <section className="st-card">
            {all.map((b) => {
              const last = b.tries[b.tries.length - 1];
              const isDue = due.some((x) => x.id === b.id);
              return (
                <div key={b.id} className="st-item">
                  <SubjectDot id={b.subjectId} d={d} />
                  <div className="st-item-main" {...tap(() => setEdit(b))}>
                    <div className="st-item-title">{b.title}</div>
                    <div className="st-item-sub">
                      {d.subjects[b.subjectId]?.name ?? '과목'} · 핵심 {b.points.length}개 · {last ? `${shortDate(last.date)}에 ${b.points.length - last.missed.length}/${b.points.length}` : '아직 안 해 봄'} · {b.box === 0 ? '오늘' : dueText(b, today)}
                    </div>
                  </div>
                  <button className={`btn btn-sm ${isDue ? 'btn-primary' : ''}`} onClick={() => go(`/review/blank-run-${b.id}`)}>
                    떠올리기
                  </button>
                </div>
              );
            })}
          </section>
        </>
      )}
      {edit && <BlankSheetEditor item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
    </>
  );
}

function BlankSheetEditor({ item, today, onClose }: { item?: BlankSheet; today: string; onClose: () => void }) {
  const d = useStudy();
  const [subjectId, setSubjectId] = useState(item?.subjectId ?? subjectsOf(d)[0]?.id ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [text, setText] = useState(item ? scopeText(item.points) : '');
  const points = scopeLines(text, item?.points);
  function save() {
    if (!subjectId || !title.trim() || !points.length) return;
    put('blanks', { ...(item ?? { box: 0, due: today, wrong: 0, tries: [], created: Date.now() }), id: item?.id ?? newId(), subjectId, title: title.trim().slice(0, 60), points } as BlankSheet);
    toast(item ? '고쳤어요' : '단원을 넣었어요');
    onClose();
  }
  return (
    <Sheet title={item ? '백지 복습 고치기' : '백지 복습 단원 넣기'} onClose={onClose} wide>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        <Field label="단원 이름 (떠올릴 때 이것만 보여요)">
          <input className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2단원 광합성과 호흡" />
        </Field>
        <Field label="핵심 내용 (한 줄에 하나)" hint="떠올려 쓴 글과 줄마다 비교해요. 짧고 분명하게 쓸수록 잘 비교돼요.">
          <textarea className="st-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'광합성은 엽록체에서 일어난다\n빛에너지를 화학 에너지로 바꾼다\n이산화 탄소 + 물 → 포도당 + 산소'} />
        </Field>
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`「${item.title}」 백지 복습`)) return;
                remove('blanks', item.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!subjectId || !title.trim() || !points.length} onClick={save}>
            저장 ({points.length}줄)
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function BlankRun({ id }: { id: string }) {
  const d = useStudy();
  const today = useToday();
  const b = d.blanks[id];
  const [written, setWritten] = useState('');
  const [missed, setMissed] = useState<Set<string> | null>(null);
  if (!b || b.deleted)
    return (
      <Empty title="찾을 수 없어요">
        <button className="btn" onClick={() => go('/review/blank')}>
          백지 복습
        </button>
      </Empty>
    );
  const back = () => go('/review/blank');
  function finish() {
    if (!missed) return;
    const cur = getStudy().blanks[id];
    const s = getStudy().settings;
    const all = missed.size === 0;
    // 다 떠올리면 다음 상자, 하나라도 빠뜨리면 1번 상자(내일)
    const next = answer({ ...cur, box: Math.max(cur.box, 0) }, all, 'card', today, s.intervals);
    put('blanks', { ...next, tries: [...cur.tries, { id: newId(), date: today, missed: [...missed], at: Date.now() }].slice(-10) });
    toast(all ? '다 떠올렸어요! 다음엔 더 길게 쉬었다 나와요' : `${missed.size}개를 빠뜨렸어요. 내일 다시 나와요`);
    back();
  }
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={back} aria-label="백지 복습">
          ‹
        </button>
        <h2>{b.title}</h2>
      </div>
      {!missed ? (
        <section className="st-card st-form">
          <p className="st-hint">
            <SubjectDot id={b.subjectId} d={d} /> {d.subjects[b.subjectId]?.name ?? '과목'} · 핵심 {b.points.length}개. 아무것도 보지 말고 기억나는 대로 써 보세요.
          </p>
          <textarea className="st-input" rows={10} autoFocus value={written} onChange={(e) => setWritten(e.target.value)} placeholder="기억나는 것을 모두 적어요" aria-label="떠올려 쓰기" />
          <div className="st-row end">
            <button className="btn btn-primary" onClick={() => setMissed(new Set(guessMissed(b.points, written)))}>
              다 썼어요, 비교하기
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="st-card">
            <h3 className="st-h">핵심 내용 — 떠올린 것에 체크 (자동으로 짐작했어요, 고칠 수 있어요)</h3>
            {b.points.map((p) => {
              const ok = !missed.has(p.id);
              return (
                <label key={p.id} className={`blk-point ${ok ? 'ok' : 'miss'}`}>
                  <input
                    type="checkbox"
                    checked={ok}
                    onChange={() => {
                      const n = new Set(missed);
                      ok ? n.add(p.id) : n.delete(p.id);
                      setMissed(n);
                    }}
                  />
                  <span>{p.text}</span>
                  {!ok && <small className="bad">빠뜨림</small>}
                </label>
              );
            })}
            <p className="st-sub">
              {b.points.length - missed.size}/{b.points.length} 떠올렸어요
            </p>
          </section>
          <details className="st-card st-more">
            <summary>내가 쓴 글</summary>
            <p className="blk-written">{written || '(비어 있어요)'}</p>
          </details>
          <div className="st-row end">
            <button className="btn" onClick={() => setMissed(null)}>
              다시 쓰기
            </button>
            <button className="btn btn-primary" onClick={finish}>
              저장
            </button>
          </div>
        </>
      )}
    </div>
  );
}
