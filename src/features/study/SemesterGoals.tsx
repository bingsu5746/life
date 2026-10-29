// 내신 목표 역산: 과목마다 학기 목표 점수 · 반영 비율 · 받은 점수 → 남은 시험에서 필요한 점수
import { useState } from 'react';
import { neededScore } from './grades';
import { type Id, type SemesterGoal } from './model';
import { setSettings, useStudy } from './store';
import { Empty, go, SubjectDot, subjectsOf } from './ui';
import { ExamTabs } from './Exams';

const DEFAULT_PARTS: SemesterGoal['parts'] = [
  { name: '중간고사', weight: 30 },
  { name: '기말고사', weight: 30 },
  { name: '수행평가', weight: 40 },
];

export function SemesterGoals() {
  const d = useStudy();
  const subjects = subjectsOf(d);
  const goals = d.settings.semesterGoals ?? {};
  const save = (id: Id, g: SemesterGoal | null) => {
    const next = { ...goals };
    if (g) next[id] = g;
    else delete next[id];
    setSettings({ semesterGoals: next });
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>내신 목표</h2>
      </div>
      <ExamTabs on="goal" />
      <p className="st-hint">학기 목표 점수(100점 환산)와 반영 비율, 이미 받은 점수를 넣으면 남은 시험에서 몇 점이 필요한지 계산해요. 등급은 다른 학생들 점수에 따라 달라서 점수로만 계산해요. 여기서 정한 목표는 시험 공부 계획의 과목 시간에도 반영돼요.</p>
      {!subjects.length && (
        <Empty title="과목이 없어요">
          <button className="btn" onClick={() => go('/exams')}>
            시험 넣으러 가기
          </button>
        </Empty>
      )}
      {subjects.map((s) => (
        <GoalCard key={s.id} id={s.id} name={s.name} goal={goals[s.id]} onSave={(g) => save(s.id, g)} />
      ))}
    </div>
  );
}

function GoalCard({ id, name, goal, onSave }: { id: Id; name: string; goal?: SemesterGoal; onSave: (g: SemesterGoal | null) => void }) {
  const d = useStudy();
  const [open, setOpen] = useState(false);
  const g = goal ?? { target: 90, parts: DEFAULT_PARTS };
  const r = goal ? neededScore(goal) : null;
  const sum = g.parts.reduce((a, p) => a + p.weight, 0);
  const setPart = (i: number, patch: Partial<SemesterGoal['parts'][number]>) => onSave({ ...g, parts: g.parts.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const n = (v: string) => (v.trim() === '' ? undefined : Math.min(100, Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0)));
  return (
    <section className="st-card sg">
      <div className="st-inline between st-tap" onClick={() => setOpen(!open)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}>
        <b>
          <SubjectDot id={id} d={d} /> {name}
        </b>
        {r ? (
          <span className={`sg-need ${r.possible ? '' : 'bad'}`}>{r.need === null ? (r.possible ? `목표 ${g.target}점 달성 (${r.got}점)` : `${r.got}점 · 목표 ${g.target}점 못 미침`) : r.possible ? `남은 시험 ${r.need}점 필요` : `남은 시험을 100점 받아도 ${Math.floor(r.got + r.left)}점까지`}</span>
        ) : (
          <small className="st-muted">목표 정하기</small>
        )}
      </div>
      {open && (
        <div className="st-form sg-form">
          <label className="st-cond-time">
            학기 목표
            <input className="st-input xs" inputMode="decimal" value={g.target} onChange={(e) => onSave({ ...g, target: n(e.target.value) ?? 0 })} aria-label={`${name} 학기 목표 점수`} />점
          </label>
          {g.parts.map((p, i) => (
            <div key={i} className="sg-part">
              <input className="st-input" value={p.name} onChange={(e) => setPart(i, { name: e.target.value.slice(0, 20) })} aria-label="항목 이름" />
              <input className="st-input xs" inputMode="numeric" value={p.weight} onChange={(e) => setPart(i, { weight: n(e.target.value) ?? 0 })} aria-label={`${p.name} 반영 비율`} />%
              <input className="st-input xs" inputMode="decimal" value={p.score ?? ''} onChange={(e) => setPart(i, { score: n(e.target.value) })} placeholder="아직" aria-label={`${p.name} 받은 점수`} />점
              {g.parts.length > 1 && (
                <button type="button" className="st-x" aria-label={`${p.name} 빼기`} onClick={() => onSave({ ...g, parts: g.parts.filter((_, k) => k !== i) })}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {sum !== 100 && <p className="st-hint bad">반영 비율 합이 {sum}%예요. 100%가 되게 맞춰 주세요 (합에 맞춰 나눠서 계산은 해요).</p>}
          <div className="st-row between">
            <button type="button" className="st-link" onClick={() => onSave({ ...g, parts: [...g.parts, { name: '항목', weight: 0 }] })}>
              ＋ 항목
            </button>
            {goal && (
              <button type="button" className="st-link" onClick={() => onSave(null)}>
                목표 지우기
              </button>
            )}
          </div>
          {!goal && <p className="st-hint">값을 고치면 목표가 저장돼요.</p>}
        </div>
      )}
    </section>
  );
}
