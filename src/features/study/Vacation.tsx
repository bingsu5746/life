// 방학 계획 카드 · 시험 끝나고 할 것 카드
import { useState } from 'react';
import { longDate, shortDate } from './dates';
import { examEnd, upcomingExams } from './exams';
import { newId, type StudySettings } from './model';
import { getStudy, setSettings, useStudy } from './store';
import { Bar, Field, Sheet, toast, useToday } from './ui';
import { minutesText } from './timer';
import { vacationView } from './vacation';

type Vac = NonNullable<StudySettings['vacation']>;

export function VacationCard({ compact }: { compact?: boolean }) {
  const d = useStudy();
  const today = useToday();
  const v = d.settings.vacation;
  const [edit, setEdit] = useState(false);
  if (!v) {
    if (compact) return null;
    return (
      <section className="st-card">
        <div className="st-inline between">
          <h3 className="st-h">방학 계획</h3>
          <button className="btn btn-sm" onClick={() => setEdit(true)}>
            만들기
          </button>
        </div>
        <p className="st-hint">방학 기간 · 하루 공부 목표 · 방학 동안 할 것을 정하면 얼마나 지켰는지 보여 줘요.</p>
        {edit && <VacSheet onClose={() => setEdit(false)} />}
      </section>
    );
  }
  const w = vacationView(d, v, today);
  if (compact && !w.on) return null;
  const toggle = (id: string) => {
    const cur = getStudy().settings.vacation;
    if (cur) setSettings({ vacation: { ...cur, goals: cur.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)) } });
  };
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">방학 계획</h3>
        {!compact && (
          <button className="st-link" onClick={() => setEdit(true)}>
            고치기
          </button>
        )}
      </div>
      <p className="st-sub">
        {shortDate(v.from)} ~ {shortDate(v.to)} · {w.on ? `${w.passed}일째 · ${w.left}일 남음` : today < v.from ? `${w.total}일 · 아직 시작 전` : '끝났어요'}
      </p>
      {w.passed > 0 && (
        <>
          <Bar value={w.kept} max={w.passed} label="하루 목표 지킨 날" />
          <small className="st-muted">
            하루 {minutesText(v.dailyMin)} 목표 · 지킨 날 {w.kept}/{w.passed}일 · 하루 평균 {minutesText(w.avg)}
            {w.on ? ` · 오늘 ${minutesText(w.todayMin)}` : ''}
          </small>
        </>
      )}
      {v.goals.length > 0 && (
        <div className="md-list">
          {v.goals.map((g) => (
            <label key={g.id} className={`md-dose ${g.done ? 'done' : ''}`}>
              <input type="checkbox" checked={g.done} onChange={() => toggle(g.id)} />
              <span>{g.text}</span>
            </label>
          ))}
        </div>
      )}
      {edit && <VacSheet item={v} onClose={() => setEdit(false)} />}
    </section>
  );
}

function VacSheet({ item, onClose }: { item?: Vac; onClose: () => void }) {
  const today = useToday();
  const [from, setFrom] = useState(item?.from ?? today);
  const [to, setTo] = useState(item?.to ?? today);
  const [daily, setDaily] = useState(String(Math.round((item?.dailyMin ?? 240) / 60)));
  const [goals, setGoals] = useState(item?.goals.map((g) => g.text).join('\n') ?? '');
  const ok = from && to && to >= from;
  return (
    <Sheet title={item ? '방학 계획 고치기' : '방학 계획 만들기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-inline wrap">
          <label className="st-cond-time">
            시작
            <input className="st-input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="st-cond-time">
            끝
            <input className="st-input sm" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="st-cond-time">
            하루 공부 (시간)
            <input className="st-input xs" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        </div>
        <Field label="방학 동안 할 것 (한 줄에 하나)">
          <textarea className="st-input" rows={5} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder={'수학 개념원리 1권 끝내기\n영단어 Day 1~30\n운전면허 필기'} />
        </Field>
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => window.confirm('방학 계획을 지울까요?') && (setSettings({ vacation: undefined }), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              const lines = goals.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);
              setSettings({ vacation: { from, to, dailyMin: Math.round(Math.min(15, Number(daily) || 0) * 60), goals: lines.map((t) => item?.goals.find((g) => g.text === t) ?? { id: newId(), text: t, done: false }) } });
              toast('방학 계획을 저장했어요');
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

/** 시험 끝나고 할 것: 시험 기간에 적어 두면 시험이 끝나는 날 알려 준다 */
export function AfterExamCard({ banner }: { banner?: boolean }) {
  const d = useStudy();
  const today = useToday();
  const list = d.settings.afterExam ?? [];
  const [text, setText] = useState('');
  const exam = upcomingExams(d, today)[0];
  const end = exam ? examEnd(exam) : null;
  const set = (l: StudySettings['afterExam']) => setSettings({ afterExam: l });
  if (banner) {
    const left = list.filter((x) => !x.done);
    if (!left.length || end !== today) return null;
  }
  return (
    <section className="st-card">
      <h3 className="st-h">시험 끝나고 할 것</h3>
      <p className="st-sub">{end ? (end === today ? '오늘 시험이 끝나요! 하고 싶던 것을 해요' : `${exam!.name} 끝나는 날(${longDate(end)}) 18시에 알려 드려요`) : '시험을 넣으면 끝나는 날 알려 드려요'}</p>
      <div className="md-list">
        {list.map((x) => (
          <label key={x.id} className={`md-dose ${x.done ? 'done' : ''}`}>
            <input type="checkbox" checked={x.done} onChange={() => set(list.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))} />
            <span>{x.text}</span>
            {!banner && (
              <button className="st-x" aria-label={`${x.text} 지우기`} onClick={(e) => (e.preventDefault(), set(list.filter((y) => y.id !== x.id)))}>
                ✕
              </button>
            )}
          </label>
        ))}
      </div>
      {!banner && (
        <form
          className="st-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            set([...list, { id: newId(), text: text.trim().slice(0, 80), done: false }].slice(-40));
            setText('');
          }}
        >
          <input className="st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 친구들이랑 노래방, 밀린 드라마 보기" />
          <button className="btn btn-sm" disabled={!text.trim()}>
            넣기
          </button>
        </form>
      )}
    </section>
  );
}
