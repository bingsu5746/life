// 수능 목표: 영역마다 목표 등급 · 백분위 · 원점수와 모의고사(성적 칸) 최근 성적 · 최근 3번 평균을 견준다. 수능 날은 직접 넣는다
import { dday } from './dates';
import { findScore, MOCK_SUBJECTS, recordsOf, subjectNames } from './grades';
import type { CsatGoal, GradeRecord } from './model';
import { setSettings, useStudy } from './store';
import { go, useToday } from './ui';

type Goal = CsatGoal['subjects'][string];
const num = (v: string, lo: number, hi: number) => {
  if (!v.trim()) return undefined;
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
const avg = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export function CsatGoals() {
  const d = useStudy();
  const today = useToday();
  const g: CsatGoal = d.settings.csatGoal ?? { subjects: {} };
  const mocks = recordsOf(d, 'mock');
  const names = [...new Set([...MOCK_SUBJECTS, ...subjectNames(mocks)])];
  const save = (patch: Partial<CsatGoal>) => setSettings({ csatGoal: { ...g, ...patch } });
  const setSub = (name: string, p: Partial<Goal>) => save({ subjects: { ...g.subjects, [name]: { ...g.subjects[name], ...p } } });
  const latest = (name: string): { r: GradeRecord; s: NonNullable<ReturnType<typeof findScore>> } | null => {
    for (let i = mocks.length - 1; i >= 0; i--) {
      const s = findScore(mocks[i], name);
      if (s) return { r: mocks[i], s };
    }
    return null;
  };
  const last3 = (name: string) =>
    mocks
      .map((r) => findScore(r, name))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .slice(-3);
  // 위: 국어 · 수학 · 탐구 백분위 합, 목표 평균 등급
  const core = ['국어', '수학', '탐구1', '탐구2'];
  const goalPct = core.map((n) => g.subjects[n]?.percentile);
  const nowPct = core.map((n) => latest(n)?.s.percentile);
  const sum = (xs: (number | undefined)[]) => (xs.every((x) => typeof x === 'number') ? Math.round((xs as number[]).reduce((a, b) => a + b, 0) * 10) / 10 : null);
  const goalGrade = avg(names.map((n) => g.subjects[n]?.grade));
  const nowGrade = avg(names.filter((n) => g.subjects[n]?.grade).map((n) => latest(n)?.s.grade));
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>수능 목표</h2>
      </div>
      <section className="st-card">
        <div className="st-stat-row">
          <div>
            <small>수능까지</small>
            <b>{g.date ? dday(today, g.date) : '—'}</b>
          </div>
          <div>
            <small>목표 평균 등급</small>
            <b>{goalGrade ?? '—'}</b>
            {nowGrade !== null && <small className="st-muted">지금 {nowGrade}</small>}
          </div>
          <div>
            <small>국 · 수 · 탐 백분위 합</small>
            <b>{sum(goalPct) ?? '—'}</b>
            {sum(nowPct) !== null && <small className="st-muted">지금 {sum(nowPct)}</small>}
          </div>
        </div>
        <label className="st-cond-time">
          수능 날
          <input className="st-input sm" type="date" value={g.date ?? ''} onChange={(e) => save({ date: e.target.value || undefined })} aria-label="수능 날" />
        </label>
        <p className="st-hint">수능 날은 해마다 달라서 발표된 날을 직접 넣어 주세요. 지금 성적은 성적 칸에 넣은 모의고사에서 가져와요.</p>
        {!mocks.length && (
          <button className="btn btn-sm" onClick={() => go('/exams/grades')}>
            모의고사 성적 넣으러 가기
          </button>
        )}
      </section>
      {names.map((name) => {
        const t = g.subjects[name] ?? {};
        const l = latest(name);
        const recent = last3(name);
        const rp = avg(recent.map((s) => s.percentile));
        const gap = t.percentile !== undefined && l?.s.percentile !== undefined ? Math.round((t.percentile - l.s.percentile) * 10) / 10 : null;
        const gGap = t.grade !== undefined && l?.s.grade !== undefined ? l.s.grade - t.grade : null;
        const done = (gap !== null && gap <= 0) || (gap === null && gGap !== null && gGap <= 0);
        return (
          <section key={name} className="st-card csat">
            <div className="st-inline between">
              <b>{name}</b>
              {done ? <span className="csat-ok">목표 달성</span> : gap !== null ? <span className="csat-gap">백분위 +{gap}</span> : gGap !== null ? <span className="csat-gap">{gGap}등급 올리기</span> : null}
            </div>
            <div className="csat-row">
              <label>
                <small>목표 등급</small>
                <input className="st-input xs" inputMode="numeric" value={t.grade ?? ''} placeholder={d.settings.gradeGoals?.mock?.[name] ? String(d.settings.gradeGoals.mock[name]) : '—'} onChange={(e) => setSub(name, { grade: num(e.target.value, 1, 9) })} aria-label={`${name} 목표 등급`} />
              </label>
              <label>
                <small>목표 백분위</small>
                <input className="st-input xs" inputMode="decimal" value={t.percentile ?? ''} placeholder="—" onChange={(e) => setSub(name, { percentile: num(e.target.value, 0, 100) })} aria-label={`${name} 목표 백분위`} />
              </label>
              <label>
                <small>목표 원점수</small>
                <input className="st-input xs" inputMode="numeric" value={t.raw ?? ''} placeholder="—" onChange={(e) => setSub(name, { raw: num(e.target.value, 0, 200) })} aria-label={`${name} 목표 원점수`} />
              </label>
            </div>
            <small className="st-muted">
              {l
                ? `최근 ${l.r.name}: ${[l.s.grade !== undefined && `${l.s.grade}등급`, l.s.percentile !== undefined && `백분위 ${l.s.percentile}`, l.s.raw !== undefined && `${l.s.raw}점`].filter(Boolean).join(' · ') || '점수 없음'}${recent.length > 1 && rp !== null ? ` · 최근 ${recent.length}번 백분위 평균 ${rp}` : ''}`
                : '아직 모의고사 성적이 없어요'}
            </small>
          </section>
        );
      })}
    </div>
  );
}
