// 목표 대학 · 학과: 목표(직접 넣음)와 지금 성적(성적 칸의 내신 · 최근 모의고사)의 차이
import { useState } from 'react';
import { MOCK_SUBJECTS, recordsOf, subjectNames } from './grades';
import { newId, type UnivGoal } from './model';
import { setSettings, useStudy } from './store';
import { confirmDelete, Empty, Field, go, Icon, Sheet } from './ui';
import { schoolAverage, univGap } from './univ';

const gradeText = (x: number) => `${Math.round(x * 100) / 100}등급`;

export function UnivGoals() {
  const d = useStudy();
  const goals = d.settings.univGoals ?? [];
  const [edit, setEdit] = useState<UnivGoal | 'new' | null>(null);
  const sa = schoolAverage(d);
  const save = (g: UnivGoal | null, id?: string) => {
    const rest = goals.filter((x) => x.id !== (g?.id ?? id));
    setSettings({ univGoals: g ? (goals.some((x) => x.id === g.id) ? goals.map((x) => (x.id === g.id ? g : x)) : [...goals, g]) : rest });
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>목표 대학</h2>
        {goals.length < 10 && (
          <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
            <Icon name="plus" /> 목표 넣기
          </button>
        )}
      </div>
      <p className="st-hint">가고 싶은 대학 · 학과와 목표 성적(내신 평균 등급, 모의고사 과목별 등급 · 백분위)을 넣으면 지금 성적과 얼마나 차이 나는지 보여 줘요. 대학별 합격선은 해마다 달라서 앱이 정하지 않아요. 입시 자료를 보고 직접 넣어 주세요.</p>
      <section className="st-card">
        <div className="st-stat-row">
          <div>
            <small>지금 내신 평균</small>
            <b>{sa ? gradeText(sa.avg) : '—'}</b>
          </div>
          <div>
            <small>넣은 내신 성적</small>
            <b>{sa ? `${sa.records}번 · ${sa.count}과목` : '없음'}</b>
          </div>
        </div>
        <p className="st-hint">성적 칸에 넣은 내신 등급의 단순 평균이에요 (과목 단위 수는 반영하지 않아요). 모의고사는 과목마다 가장 최근 성적과 비교해요.</p>
        {!sa && (
          <button className="btn btn-sm" onClick={() => go('/exams/grades')}>
            성적 넣으러 가기
          </button>
        )}
      </section>
      {!goals.length ? (
        <Empty title="목표 대학을 넣어 보세요">
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            목표 넣기
          </button>
        </Empty>
      ) : (
        goals.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setEdit(g)} />)
      )}
      {edit && (
        <GoalSheet
          item={edit === 'new' ? undefined : edit}
          onSave={(g) => {
            save(g);
            setEdit(null);
          }}
          onDelete={(id) => {
            save(null, id);
            setEdit(null);
          }}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function GoalCard({ g, onEdit }: { g: UnivGoal; onEdit: () => void }) {
  const d = useStudy();
  const gap = univGap(d, g);
  const rows = [
    ...(gap.school ? [{ k: '내신 평균', goal: gradeText(gap.school.goal), now: gap.school.now === null ? '성적 없음' : gradeText(gap.school.now), gap: gap.school.gap, ok: gap.school.ok, unit: '등급' }] : []),
    ...gap.mock.flatMap((m) => [
      ...(m.grade ? [{ k: `${m.subject} 등급`, goal: gradeText(m.grade.goal), now: m.grade.now === null ? '성적 없음' : gradeText(m.grade.now), gap: m.grade.gap, ok: m.grade.ok, unit: '등급' }] : []),
      ...(m.percentile ? [{ k: `${m.subject} 백분위`, goal: `${m.percentile.goal}`, now: m.percentile.now === null ? '성적 없음' : `${m.percentile.now}`, gap: m.percentile.gap, ok: m.percentile.ok, unit: '' }] : []),
    ]),
  ];
  const done = rows.filter((r) => r.ok).length;
  return (
    <section className="st-card">
      <div className="st-inline between st-tap" role="button" tabIndex={0} onClick={onEdit} onKeyDown={(e) => e.key === 'Enter' && onEdit()}>
        <b>
          {g.univ}
          {g.major && <span className="st-muted"> · {g.major}</span>}
        </b>
        {rows.length > 0 && <small className={done === rows.length ? '' : 'st-muted'}>{done === rows.length ? '모두 달성' : `${done}/${rows.length} 달성`}</small>}
      </div>
      {!rows.length ? (
        <p className="st-hint">목표 성적을 넣어 주세요 (눌러서 고치기).</p>
      ) : (
        <div className="st-table" role="table" aria-label={`${g.univ} 목표와 지금`}>
          {rows.map((r) => (
            <div key={r.k} className="st-item" role="row">
              <div className="st-item-main">
                <div className="st-item-title">{r.k}</div>
                <div className="st-item-sub">
                  목표 {r.goal} · 지금 {r.now}
                </div>
              </div>
              <span className={`sg-need ${r.ok ? '' : 'bad'}`}>{r.gap === null ? '—' : r.ok ? '달성' : r.unit === '등급' ? `${Math.round(r.gap * 100) / 100}등급 올려야` : `${Math.abs(r.gap)} 더`}</span>
            </div>
          ))}
        </div>
      )}
      {g.memo && <p className="st-item-sub">{g.memo}</p>}
    </section>
  );
}

function GoalSheet({ item, onSave, onDelete, onClose }: { item?: UnivGoal; onSave: (g: UnivGoal) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const d = useStudy();
  const [univ, setUniv] = useState(item?.univ ?? '');
  const [major, setMajor] = useState(item?.major ?? '');
  const [school, setSchool] = useState(item?.school?.toString() ?? '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  // 모의고사 과목: 성적에 나온 과목 + 기본 과목
  const names = [...new Set([...subjectNames(recordsOf(d, 'mock')), ...MOCK_SUBJECTS, ...Object.keys(item?.mock ?? {})])].slice(0, 10);
  const [mock, setMock] = useState<Record<string, { grade: string; percentile: string }>>(() => Object.fromEntries(names.map((n) => [n, { grade: item?.mock?.[n]?.grade?.toString() ?? '', percentile: item?.mock?.[n]?.percentile?.toString() ?? '' }])));
  const num = (v: string, lo: number, hi: number) => {
    const x = Number(v.replace(',', '.'));
    return v.trim() && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined;
  };
  const badSchool = !!school.trim() && num(school, 1, 9) === undefined;
  const badMock = Object.values(mock).some((m) => (m.grade.trim() && num(m.grade, 1, 9) === undefined) || (m.percentile.trim() && num(m.percentile, 0, 100) === undefined));
  function save() {
    if (!univ.trim() || badSchool || badMock) return;
    const mk = Object.fromEntries(
      Object.entries(mock)
        .map(([k, v]) => [k, { grade: num(v.grade, 1, 9), percentile: num(v.percentile, 0, 100) }] as const)
        .filter(([, v]) => v.grade !== undefined || v.percentile !== undefined),
    );
    onSave({ id: item?.id ?? newId(), univ: univ.trim().slice(0, 40), major: major.trim().slice(0, 40) || undefined, school: num(school, 1, 9), mock: Object.keys(mk).length ? mk : undefined, memo: memo.trim().slice(0, 200) || undefined });
  }
  return (
    <Sheet title={item ? '목표 고치기' : '목표 대학 넣기'} onClose={onClose}>
      <div className="st-form">
        <Field label="대학">
          <input className="st-input" value={univ} onChange={(e) => setUniv(e.target.value)} placeholder="예: ○○대학교" autoFocus={!item} />
        </Field>
        <Field label="학과 (선택)">
          <input className="st-input" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="예: 컴퓨터공학과" />
        </Field>
        <Field label="내신 목표 평균 등급 (선택)" hint={badSchool ? '1~9 사이로 넣어 주세요' : '예: 2.3'}>
          <input className="st-input xs" inputMode="decimal" value={school} onChange={(e) => setSchool(e.target.value)} />
        </Field>
        <Field group label="모의고사 목표 (선택)" hint={badMock ? '등급은 1~9, 백분위는 0~100 으로 넣어 주세요' : '과목마다 등급이나 백분위 중 아는 것만'}>
          {names.map((n) => (
            <div key={n} className="st-inline wrap">
              <span className="st-cond-time" style={{ minWidth: '4.5em' }}>
                {n}
              </span>
              <input className="st-input xs" inputMode="numeric" value={mock[n]?.grade ?? ''} onChange={(e) => setMock({ ...mock, [n]: { ...mock[n], grade: e.target.value } })} placeholder="등급" aria-label={`${n} 목표 등급`} />
              <input className="st-input xs" inputMode="numeric" value={mock[n]?.percentile ?? ''} onChange={(e) => setMock({ ...mock, [n]: { ...mock[n], percentile: e.target.value } })} placeholder="백분위" aria-label={`${n} 목표 백분위`} />
            </div>
          ))}
        </Field>
        <Field label="메모 (선택)">
          <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 학생부종합 · 수학 가중치 높음" />
        </Field>
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.univ}」 목표`) && onDelete(item.id)}>
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!univ.trim() || badSchool || badMock} onClick={save}>
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
