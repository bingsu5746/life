// 지난 성적: 내신 · 모의고사 넣기, 과목별 흐름 그래프, 시험 전 공부 시간과 함께 보기
import { useState } from 'react';
import { shortDate } from './dates';
import { examEnd, examSubjectIds } from './exams';
import { ExamTabs } from './Exams';
import { parseWrongNums, wrongFrequency, change, changeText, findScore, METRIC_NAME, metricsFor, MOCK_SUBJECTS, readNum, prepBefore, recordAverage, recordsOf, scoreValue, series, studyBefore, subjectNames, type Metric } from './grades';
import { BarChart, LineChart, TableView } from './charts';
import { addDays } from './dates';
import { alive, newId, type GradeRecord, type GradeScore } from './model';
import { put, remove, setSettings, useStudy } from './store';
import { minutesText } from './timer';
import { confirmDelete, Empty, Field, go, Icon, Sheet, subjectsOf, tap, toast, useToday } from './ui';

const KIND_LABEL: Record<GradeRecord['kind'], string> = { school: '내신', mock: '모의고사' };
/** 그래프 세로축: 등급은 값 둘레의 정수 칸(1~9 안), 백분위는 0~100, 그 밖은 값에 맞춘다 */
function axis(m: Metric, ys: (number | null)[], goal?: number): { domain?: [number, number]; ticks?: number[] } {
  if (m === 'percentile') return { domain: [0, 100] };
  if (m !== 'grade') return {};
  const v = [...ys, goal ?? null].filter((x): x is number => x !== null);
  if (!v.length) return { domain: [1, 9] };
  const lo = Math.max(1, Math.floor(Math.min(...v)) - 1);
  const hi = Math.min(9, Math.ceil(Math.max(...v)) + 1);
  const step = hi - lo > 4 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

const fmt = (m: Metric) => (v: number) => (m === 'grade' ? (Number.isInteger(v) ? `${v}` : v.toFixed(1)) : `${Math.round(v * 10) / 10}`);

function readKind(): GradeRecord['kind'] {
  try {
    return localStorage.getItem('my-study.grades.kind') === 'mock' ? 'mock' : 'school';
  } catch {
    return 'school';
  }
}

/** sub: 'new' 이면 넣기 창, 'from-<시험 id>' 면 그 시험으로 채운 넣기 창, 성적 id 면 고치기 창 */
export function Grades({ sub }: { sub?: string }) {
  const d = useStudy();
  const [kind, setKindState] = useState<GradeRecord['kind']>(() => {
    const from = sub?.startsWith('from-') ? d.exams[sub.slice(5)] : undefined;
    if (from) return from.kind === 'mock' ? 'mock' : 'school';
    const rec = sub ? d.grades[sub] : undefined;
    return rec ? rec.kind : readKind();
  });
  const [metric, setMetric] = useState<Metric>('grade');
  const setKind = (k: GradeRecord['kind']) => {
    setKindState(k);
    if (!metricsFor(k).includes(metric)) setMetric('grade');
    try {
      localStorage.setItem('my-study.grades.kind', k);
    } catch {
      // 저장할 수 없는 환경
    }
  };
  const [level, setLevelState] = useState<'고1' | '고2' | '고3'>(() => {
    try {
      const v = localStorage.getItem('my-study.grades.level');
      return v === '고1' || v === '고3' ? v : '고2';
    } catch {
      return '고2';
    }
  });
  const setLevel = (v: '고1' | '고2' | '고3') => {
    setLevelState(v);
    try {
      localStorage.setItem('my-study.grades.level', v);
    } catch {
      /* 무시 */
    }
  };
  const allMock = recordsOf(d, 'mock');
  const levels = (['고1', '고2', '고3'] as const).filter((l) => l !== '고1' || allMock.some((r) => r.level === '고1'));
  const records = recordsOf(d, kind).filter((r) => kind !== 'mock' || (r.level ?? '고2') === level);
  const names = subjectNames(records);
  const editing = sub === 'new' || sub?.startsWith('from-') ? 'new' : sub && d.grades[sub] && !d.grades[sub].deleted ? d.grades[sub] : null;
  const fromExam = sub?.startsWith('from-') ? d.exams[sub.slice(5)] : undefined;

  const avg = records.map((r) => recordAverage(r, metric));
  const goals = d.settings.gradeGoals?.[kind] ?? {};
  const goalOf = (name: string) => goals[Object.keys(goals).find((k) => k.replace(/\s+/g, '') === name.replace(/\s+/g, '')) ?? ''];
  const [goalOpen, setGoalOpen] = useState(false);
  const last = records.length - 1;

  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>성적</h2>
        <button className="btn btn-sm btn-primary" onClick={() => go('/exams/grades/new')}>
          <Icon name="plus" /> 성적 넣기
        </button>
      </div>
      <ExamTabs on="grades" />

      <div className="st-inline wrap between">
        <div className="st-seg" aria-label="성적 종류">
          {(['school', 'mock'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]} {alive(d.grades).filter((g) => g.kind === k).length || ''}
            </button>
          ))}
        </div>
        {records.length > 0 && (
          <div className="st-seg" aria-label="볼 값">
            {metricsFor(kind).map((m) => (
              <button key={m} className={metric === m ? 'on' : ''} aria-pressed={metric === m} onClick={() => setMetric(m)}>
                {METRIC_NAME[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {kind === 'mock' && (
        <div className="st-seg sm" aria-label="학년">
          {levels.map((l) => (
            <button key={l} className={level === l ? 'on' : ''} aria-pressed={level === l} onClick={() => setLevel(l)}>
              {l === '고3' ? '고3·수능' : l} {allMock.filter((r) => (r.level ?? '고2') === l).length || ''}
            </button>
          ))}
        </div>
      )}

      {!records.length ? (
        <Empty title={`${kind === 'mock' ? `${level} 모의고사` : KIND_LABEL[kind]} 성적이 아직 없어요`}>
          <p>{kind === 'school' ? '학기별 중간·기말고사 점수와 등급을 넣으면' : '모의고사 원점수·백분위·등급을 넣으면'} 과목별로 오르내림을 그래프로 보여 드려요.</p>
          <button className="btn btn-primary" onClick={() => go('/exams/grades/new')}>
            성적 넣기
          </button>
        </Empty>
      ) : (
        <>
          <section className="st-card">
            <h3 className="st-h">과목 평균 {METRIC_NAME[metric]}</h3>
            <div className="gr-hero">
              <b>{avg[last] === null ? '—' : fmt(metric)(avg[last]!)}</b>
              <span>
                {records[last].name}
                {last > 0 && <small className={change(avg[last - 1], avg[last], metric)?.better ? 'up' : ''}> · 지난번보다 {changeText(change(avg[last - 1], avg[last], metric), metric) || '비교할 값이 없어요'}</small>}
              </span>
            </div>
            {records.length > 1 ? (
              <LineChart
                label={`${KIND_LABEL[kind]} 과목 평균 ${METRIC_NAME[metric]} 흐름`}
                points={records.map((r, i) => ({ label: shortDate(r.date).replace(/\(.\)/, ''), title: r.name, y: avg[i] }))}
                invert={metric === 'grade'}
                {...axis(metric, avg)}
                format={fmt(metric)}
              />
            ) : (
              <p className="st-hint">성적을 두 번 넣으면 흐름 그래프가 보여요.</p>
            )}
            {metric === 'grade' && <p className="st-hint">등급은 1등급이 맨 위예요.</p>}
          </section>

          <div className="gr-grid">
            {names.map((name) => {
              const ys = series(records, name, metric);
              const has = ys.filter((v) => v !== null);
              if (!has.length) return null;
              const lastV = [...ys].reverse().find((v) => v !== null) ?? null;
              const idx = ys.lastIndexOf(lastV);
              const prevV = [...ys.slice(0, idx)].reverse().find((v) => v !== null) ?? null;
              const c = change(prevV, lastV, metric);
              const goal = metric === 'grade' ? goalOf(name) : undefined;
              return (
                <section key={name} className="st-card gr-subject">
                  <div className="gr-subject-head">
                    <b>
                      {name}
                      {goal !== undefined && <small className="gr-goal"> 목표 {goal}등급{lastV !== null && (lastV <= goal ? ' · 달성' : ` · ${Math.round((lastV - goal) * 10) / 10}등급 남음`)}</small>}
                    </b>
                    <span>
                      <b>{lastV === null ? '—' : fmt(metric)(lastV)}</b>
                      {c && <small className={c.better ? 'up' : c.diff ? 'down' : ''}>{changeText(c, metric)}</small>}
                    </span>
                  </div>
                  {has.length > 1 && (
                    <LineChart
                      height={120}
                      label={`${name} ${METRIC_NAME[metric]} 흐름`}
                      points={records.map((r, i) => ({ label: shortDate(r.date).replace(/\(.\)/, ''), title: r.name, y: ys[i] }))}
                      invert={metric === 'grade'}
                      {...axis(metric, ys, goal)}
                      goal={goal}
                      format={fmt(metric)}
                    />
                  )}
                </section>
              );
            })}
          </div>

          <TableView
            head={['시험', ...names]}
            rows={records.map((r) => [
              r.name,
              ...names.map((n) => {
                const v = scoreValue(findScore(r, n), metric);
                return v === null ? '' : fmt(metric)(v);
              }),
            ])}
          />

          {metric === 'grade' && <GoalGap records={records} names={names} goalOf={goalOf} onEdit={() => setGoalOpen(true)} />}

          <WrongNumbers records={records} names={names} />

          <StudyVsScore records={records} metric={metric} />
          <PrepVsScore records={records} metric={metric} />

          <section className="st-card">
            <h3 className="st-h">넣은 성적</h3>
            {[...records].reverse().map((r) => (
              <div key={r.id} className="st-item st-tap" {...tap(() => go(`/exams/grades/${r.id}`))}>
                <div className="st-item-main">
                  <div className="st-item-title">{r.name}</div>
                  <div className="st-item-sub">
                    {shortDate(r.date)} · {r.scores.length}과목
                    {recordAverage(r, 'grade') !== null && ` · 평균 ${fmt('grade')(recordAverage(r, 'grade')!)}등급`}
                  </div>
                </div>
                <Icon name="chevron" />
              </div>
            ))}
          </section>
        </>
      )}

      {goalOpen && <GoalSheet kind={kind} names={names} onClose={() => setGoalOpen(false)} />}
      {editing && <GradeSheet record={editing === 'new' ? undefined : editing} kind={kind} level={level} fromExamId={fromExam?.id} onSaved={setKind} onClose={() => go('/exams/grades')} />}
    </div>
  );
}

/** 시험마다 시험 전 2주의 하루 공부 · 평균 잠과 평균 성적을 나란히 (어떤 준비가 잘 맞았는지) */
function PrepVsScore({ records, metric }: { records: GradeRecord[]; metric: Metric }) {
  const d = useStudy();
  const rows = records.slice(-6).map((r) => ({ r, p: prepBefore(d, r.date), avg: recordAverage(r, metric) }));
  if (rows.length < 2 || rows.every((x) => !x.p.studyPerDay && x.p.sleepAvg === null)) return null;
  const fmt = (v: number | null) => (v === null ? '—' : metric === 'grade' ? `${v}등급` : `${v}`);
  return (
    <section className="st-card">
      <h3 className="st-h">시험 전 2주 생활과 성적</h3>
      <table className="st-table">
        <thead>
          <tr>
            <th>시험</th>
            <th>하루 공부</th>
            <th>평균 잠</th>
            <th>평균 {METRIC_NAME[metric]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.r.id}>
              <td>{x.r.name}</td>
              <td>{minutesText(x.p.studyPerDay)}</td>
              <td>{x.p.sleepAvg === null ? '—' : minutesText(x.p.sleepAvg)}</td>
              <td>{fmt(x.avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="st-hint">「기록」의 공부 시간과 오늘 화면의 잠 기록으로 셌어요. 같이 보이는 것이지, 잠이나 공부 시간 때문에 성적이 달라졌다고 단정할 수는 없어요.</p>
    </section>
  );
}

/** 시험 전 4주 동안 그 과목을 공부한 시간과 성적 (바로 앞 시험과 비교) */
function StudyVsScore({ records, metric }: { records: GradeRecord[]; metric: Metric }) {
  const d = useStudy();
  if (records.length < 1) return null;
  const cur = records[records.length - 1];
  const prev = records.length > 1 ? records[records.length - 2] : null;
  const rows = cur.scores
    .map((s) => ({ name: s.subject, now: studyBefore(d, s.subject, cur.date), before: prev ? studyBefore(d, s.subject, prev.date) : null, c: prev ? change(scoreValue(findScore(prev, s.subject), metric), scoreValue(s, metric), metric) : null }))
    .filter((r) => r.now !== null);
  if (!rows.length || rows.every((r) => !r.now && !r.before)) return null;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.now ?? 0, r.before ?? 0)));
  return (
    <section className="st-card">
      <h3 className="st-h">시험 전 4주 공부 시간 · {cur.name}</h3>
      <div className="gr-study">
        {rows.map((r) => (
          <div key={r.name} className="gr-study-row">
            <span className="gr-study-name">{r.name}</span>
            <div className="gr-study-bars">
              <i style={{ width: `${((r.now ?? 0) / max) * 100}%` }} title={`이번 ${minutesText(r.now ?? 0)}`} />
              {prev && <i className="prev" style={{ width: `${((r.before ?? 0) / max) * 100}%` }} title={`지난번 ${minutesText(r.before ?? 0)}`} />}
            </div>
            <small>
              {minutesText(r.now ?? 0)}
              {prev && ` (지난번 ${minutesText(r.before ?? 0)})`}
              {r.c && r.c.diff !== 0 && ` · ${METRIC_NAME[metric]} ${changeText(r.c, metric)}`}
            </small>
          </div>
        ))}
      </div>
      <p className="st-hint">이 앱의 「기록」에 넣은 공부 시간을 이름이 같은 과목끼리 맞춰 셌어요.{prev && ' 위 막대가 이번, 아래 흐린 막대가 지난번 시험 전이에요.'}</p>
    </section>
  );
}

interface Row {
  id: string;
  subject: string;
  raw: string;
  full: string;
  grade: string;
  average: string;
  standard: string;
  percentile: string;
  wrong: string;
  at?: number;
}

const toRow = (s: GradeScore): Row => ({
  id: s.id,
  subject: s.subject,
  raw: s.raw?.toString() ?? '',
  full: s.full?.toString() ?? '',
  grade: s.grade?.toString() ?? '',
  average: s.average?.toString() ?? '',
  standard: s.standard?.toString() ?? '',
  percentile: s.percentile?.toString() ?? '',
  wrong: s.wrong?.join(', ') ?? '',
  at: s.at,
});
const emptyRow = (subject: string): Row => ({ id: newId(), subject, raw: '', full: '', grade: '', average: '', standard: '', percentile: '', wrong: '' });

function GradeSheet({ record, kind: kind0, level: level0, fromExamId, onSaved, onClose }: { record?: GradeRecord; kind: GradeRecord['kind']; level?: GradeRecord['level']; fromExamId?: string; onSaved: (k: GradeRecord['kind']) => void; onClose: () => void }) {
  const d = useStudy();
  const today = useToday();
  const exam = fromExamId ? d.exams[fromExamId] : undefined;
  const [kind, setKind] = useState<GradeRecord['kind']>(record?.kind ?? kind0);
  const [name, setName] = useState(record?.name ?? exam?.name ?? '');
  const [date, setDate] = useState(record?.date ?? (exam ? examEnd(exam) : today));
  const [memo, setMemo] = useState(record?.memo ?? '');
  const [lv, setLv] = useState<GradeRecord['level']>(record?.level ?? level0 ?? '고2');
  const startNames = (k: GradeRecord['kind']) => {
    if (exam) {
      const ids = examSubjectIds(exam);
      if (ids.length) return ids.map((id) => d.subjects[id]?.name ?? '과목');
    }
    return k === 'mock' ? MOCK_SUBJECTS : subjectsOf(d).map((s) => s.name);
  };
  const [rows, setRows] = useState<Row[]>(() => (record ? record.scores.map(toRow) : startNames(kind).map(emptyRow)));
  const [touched, setTouched] = useState(!!record);
  const [showWrong, setShowWrong] = useState(record ? record.scores.some((x) => x.wrong?.length) : kind0 === 'mock');
  const school = kind === 'school';
  const cols: { k: keyof Row; label: string; lo: number; hi: number }[] = school
    ? [
        { k: 'raw', label: '원점수', lo: 0, hi: 1000 },
        { k: 'average', label: '평균', lo: 0, hi: 1000 },
        { k: 'grade', label: '등급', lo: 1, hi: 9 },
      ]
    : [
        { k: 'raw', label: '원점수', lo: 0, hi: 1000 },
        { k: 'standard', label: '표준점수', lo: 0, hi: 300 },
        { k: 'percentile', label: '백분위', lo: 0, hi: 100 },
        { k: 'grade', label: '등급', lo: 1, hi: 9 },
      ];
  const bad = rows.flatMap((r) => cols.filter((c) => r[c.k] && readNum(r[c.k] as string, c.lo, c.hi) === undefined).map((c) => `${r.subject || '과목'} ${c.label}`));
  const filled = rows.filter((r) => r.subject.trim() && (cols.some((c) => (r[c.k] as string).trim()) || parseWrongNums(r.wrong).length));
  const set = (id: string, k: keyof Row, v: string) => {
    setTouched(true);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v, at: Date.now() } : r)));
  };

  function save() {
    if (!name.trim() || !date || bad.length || !filled.length) return;
    const now = Date.now();
    const scores: GradeScore[] = filled.map((r) => ({
      id: r.id,
      subject: r.subject.trim().slice(0, 20),
      raw: readNum(r.raw, 0, 1000),
      full: readNum(r.full, 1, 1000),
      grade: readNum(r.grade, 1, 9),
      average: school ? readNum(r.average, 0, 1000) : undefined,
      standard: school ? undefined : readNum(r.standard, 0, 300),
      percentile: school ? undefined : readNum(r.percentile, 0, 100),
      wrong: parseWrongNums(r.wrong).length ? parseWrongNums(r.wrong) : undefined,
      at: r.at ?? now,
    }));
    put('grades', { ...(record ?? {}), id: record?.id ?? newId(), kind, level: kind === 'mock' ? lv : undefined, name: name.trim().slice(0, 40), date, examId: record?.examId ?? exam?.id, scores, memo: memo.trim() || undefined });
    toast(record ? '성적을 고쳤어요' : '성적을 넣었어요');
    onSaved(kind);
    onClose();
  }

  return (
    <Sheet title={record ? '성적 고치기' : '성적 넣기'} onClose={onClose} wide>
      <div className="st-form">
        <div className="st-seg" aria-label="성적 종류">
          {(['school', 'mock'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? 'on' : ''}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                if (k === 'mock') setShowWrong(true);
                // 아직 아무것도 안 적었으면 과목도 그 종류에 맞게
                if (!touched) setRows(startNames(k).map(emptyRow));
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {!school && (
          <div className="st-seg sm" aria-label="학년">
            {(['고1', '고2', '고3'] as const).map((l) => (
              <button key={l} type="button" className={lv === l ? 'on' : ''} aria-pressed={lv === l} onClick={() => setLv(l)}>
                {l === '고3' ? '고3·수능' : l}
              </button>
            ))}
          </div>
        )}
        <div className="st-inline wrap">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={school ? '예: 1학년 2학기 기말고사' : `예: ${lv === '고3' ? '2026학년도 수능' : `${lv} 6월 모의고사`}`} aria-label="시험 이름" />
          <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="시험 날" />
        </div>

        <div className="gr-form" style={{ ['--cols' as string]: cols.length }}>
          <div className="gr-form-row head" aria-hidden>
            <span>과목</span>
            {cols.map((c) => (
              <span key={c.k}>{c.label}</span>
            ))}
            <span />
          </div>
          {rows.map((r) => (
            <div key={r.id} className="gr-form-row">
              <input className="st-input" value={r.subject} onChange={(e) => set(r.id, 'subject', e.target.value)} placeholder="과목" aria-label="과목 이름" />
              {cols.map((c) => (
                <input
                  key={c.k}
                  className={`st-input ${r[c.k] && readNum(r[c.k] as string, c.lo, c.hi) === undefined ? 'invalid' : ''}`}
                  inputMode="decimal"
                  value={r[c.k] as string}
                  onChange={(e) => set(r.id, c.k, e.target.value.replace(/[^\d.,]/g, ''))}
                  aria-label={`${r.subject || '과목'} ${c.label}`}
                />
              ))}
              <button type="button" className="st-x" aria-label={`${r.subject || '이 줄'} 빼기`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                ✕
              </button>
              {showWrong && <input className="st-input gr-wrong" value={r.wrong} onChange={(e) => set(r.id, 'wrong', e.target.value.replace(/[^\d,~\-\s]/g, ''))} placeholder="틀린 번호 (예: 3, 7, 21~23)" aria-label={`${r.subject || '과목'} 틀린 번호`} />}
            </div>
          ))}
          <div className="st-inline wrap between">
            <button type="button" className="st-link" onClick={() => setRows((rs) => [...rs, emptyRow('')])}>
              ＋ 과목 줄 더하기
            </button>
            <label className="st-toggle">
              <input type="checkbox" checked={showWrong} onChange={(e) => setShowWrong(e.target.checked)} /> 틀린 문항 번호도 넣기
            </label>
          </div>
        </div>
        <p className="st-hint">
          아는 칸만 채우면 돼요.{school ? ' 등급은 학교에서 받은 대로(5등급제·9등급제) 넣어요.' : ''}
        </p>
        {bad.length > 0 && <p className="bad">숫자를 확인해 주세요: {bad.slice(0, 3).join(', ')}</p>}
        <Field label="메모 (선택)">
          <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 수학 서술형에서 많이 깎임" />
        </Field>
        <div className="st-row end">
          {record && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`「${record.name}」 성적`)) return;
                remove('grades', record.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!name.trim() || !date || !!bad.length || !filled.length} onClick={save}>
            저장 ({filled.length}과목)
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 목표 등급과 지금 차이 · 최근 4주 공부 시간 */
function GoalGap({ records, names, goalOf, onEdit }: { records: GradeRecord[]; names: string[]; goalOf: (n: string) => number | undefined; onEdit: () => void }) {
  const d = useStudy();
  const today = useToday();
  const rows = names
    .map((n) => {
      const ys = series(records, n, 'grade');
      const now = [...ys].reverse().find((v) => v !== null) ?? null;
      const goal = goalOf(n);
      return { n, now, goal, gap: now !== null && goal !== undefined ? Math.round((now - goal) * 10) / 10 : null, min: studyBefore(d, n, addDays(today, 1)) };
    })
    .filter((r) => r.goal !== undefined);
  if (!rows.length)
    return (
      <button className="st-addline" onClick={onEdit}>
        <Icon name="plus" /> 과목별 목표 등급 정하기
      </button>
    );
  rows.sort((a, b) => (b.gap ?? -9) - (a.gap ?? -9));
  const behind = rows.filter((r) => (r.gap ?? 0) > 0);
  const avgMin = behind.length ? behind.reduce((a, r) => a + (r.min ?? 0), 0) / behind.length : 0;
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">목표까지</h3>
        <button className="st-link" onClick={onEdit}>
          목표 고치기
        </button>
      </div>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th>과목</th>
              <th>지금</th>
              <th>목표</th>
              <th>차이</th>
              <th>최근 4주 공부</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{r.now ?? '—'}</td>
                <td>{r.goal}</td>
                <td>{r.gap === null ? '—' : r.gap <= 0 ? '달성' : `${r.gap}등급`}</td>
                <td>
                  {r.min === null ? <span className="st-muted">과목 없음</span> : minutesText(r.min)}
                  {r.gap !== null && r.gap > 0 && r.min !== null && r.min < avgMin && <span className="st-pill bad"> 시간 더</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="st-hint">「시간 더」: 목표까지 남은 과목 중 최근 4주 공부 시간이 평균보다 적은 과목이에요. 공부 시간은 이 앱의 기록에서 이름이 같은 과목끼리 셌어요.</p>
    </section>
  );
}

function GoalSheet({ kind, names, onClose }: { kind: GradeRecord['kind']; names: string[]; onClose: () => void }) {
  const d = useStudy();
  const cur = d.settings.gradeGoals?.[kind] ?? {};
  const all = [...new Set([...names, ...Object.keys(cur)])];
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(all.map((n) => [n, cur[n]?.toString() ?? ''])));
  return (
    <Sheet title={`${KIND_LABEL[kind]} 목표 등급`} onClose={onClose}>
      <div className="st-form">
        {all.map((n) => (
          <div key={n} className="st-inline">
            <span className="st-goal-name">{n}</span>
            <input className="st-input xs" inputMode="numeric" value={vals[n] ?? ''} onChange={(e) => setVals({ ...vals, [n]: e.target.value.replace(/\D/g, '').slice(0, 1) })} placeholder="—" aria-label={`${n} 목표 등급`} />
            등급
          </div>
        ))}
        <p className="st-hint">비워 두면 목표가 없는 과목이에요.</p>
        <div className="st-row end">
          <button
            className="btn btn-primary"
            onClick={() => {
              const g = Object.fromEntries(Object.entries(vals).flatMap(([k, v]) => (Number(v) >= 1 && Number(v) <= 9 ? [[k, Number(v)]] : [])));
              setSettings({ gradeGoals: { ...d.settings.gradeGoals, [kind]: g } });
              toast('목표를 저장했어요');
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

/** 자주 틀리는 문항 번호 (틀린 번호를 넣은 성적에서) */
function WrongNumbers({ records, names }: { records: GradeRecord[]; names: string[] }) {
  const withWrong = names.filter((n) => wrongFrequency(records, n).records > 0);
  const [pick, setPick] = useState(withWrong[0] ?? '');
  if (!withWrong.length) return null;
  const name = withWrong.includes(pick) ? pick : withWrong[0];
  const f = wrongFrequency(records, name);
  const top = [...f.counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5);
  const groups: { label: string; n: number }[] = [];
  for (let a = 1; a <= f.max; a += 5) {
    let n = 0;
    for (let q = a; q < a + 5; q++) n += f.counts.get(q) ?? 0;
    groups.push({ label: `${a}~${a + 4}`, n });
  }
  return (
    <section className="st-card">
      <h3 className="st-h">자주 틀리는 문항</h3>
      <div className="st-chips">
        {withWrong.map((n) => (
          <button key={n} type="button" className={`st-chip ${n === name ? 'on' : ''}`} aria-pressed={n === name} onClick={() => setPick(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="st-sub">
        틀린 번호를 넣은 시험 {f.records}번 중 가장 많이 틀린 번호: {top.map(([q, c]) => `${q}번(${c}번)`).join(' · ')}
      </p>
      <BarChart label={`${name} 번호대별 틀린 수`} height={150} bars={groups.map((g) => ({ label: g.label, value: g.n }))} format={(v) => `${v}개`} />
      <TableView head={['번호', '틀린 횟수']} rows={[...f.counts.entries()].sort((a, b) => a[0] - b[0]).map(([q, c]) => [`${q}번`, `${c}번`])} />
    </section>
  );
}
