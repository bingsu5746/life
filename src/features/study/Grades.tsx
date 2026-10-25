// 지난 성적: 내신 · 모의고사 넣기, 과목별 흐름 그래프, 시험 전 공부 시간과 함께 보기
import { useState } from 'react';
import { shortDate } from './dates';
import { examEnd, examSubjectIds } from './exams';
import { ExamTabs } from './Exams';
import { change, changeText, findScore, METRIC_NAME, metricsFor, MOCK_SUBJECTS, readNum, recordAverage, recordsOf, scoreValue, series, studyBefore, subjectNames, type Metric } from './grades';
import { LineChart, TableView } from './charts';
import { alive, newId, type GradeRecord, type GradeScore } from './model';
import { put, remove, useStudy } from './store';
import { minutesText } from './timer';
import { confirmDelete, Empty, Field, go, Icon, Sheet, subjectsOf, tap, toast, useToday } from './ui';

const KIND_LABEL: Record<GradeRecord['kind'], string> = { school: '내신', mock: '모의고사' };
/** 그래프 세로축: 등급은 값 둘레의 정수 칸(1~9 안), 백분위는 0~100, 그 밖은 값에 맞춘다 */
function axis(m: Metric, ys: (number | null)[]): { domain?: [number, number]; ticks?: number[] } {
  if (m === 'percentile') return { domain: [0, 100] };
  if (m !== 'grade') return {};
  const v = ys.filter((x): x is number => x !== null);
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
  const records = recordsOf(d, kind);
  const names = subjectNames(records);
  const editing = sub === 'new' || sub?.startsWith('from-') ? 'new' : sub && d.grades[sub] && !d.grades[sub].deleted ? d.grades[sub] : null;
  const fromExam = sub?.startsWith('from-') ? d.exams[sub.slice(5)] : undefined;

  const avg = records.map((r) => recordAverage(r, metric));
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

      {!records.length ? (
        <Empty title={`${KIND_LABEL[kind]} 성적이 아직 없어요`}>
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
              return (
                <section key={name} className="st-card gr-subject">
                  <div className="gr-subject-head">
                    <b>{name}</b>
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
                      {...axis(metric, ys)}
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

          <StudyVsScore records={records} metric={metric} />

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

      {editing && <GradeSheet record={editing === 'new' ? undefined : editing} kind={kind} fromExamId={fromExam?.id} onSaved={setKind} onClose={() => go('/exams/grades')} />}
    </div>
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
  at: s.at,
});
const emptyRow = (subject: string): Row => ({ id: newId(), subject, raw: '', full: '', grade: '', average: '', standard: '', percentile: '' });

function GradeSheet({ record, kind: kind0, fromExamId, onSaved, onClose }: { record?: GradeRecord; kind: GradeRecord['kind']; fromExamId?: string; onSaved: (k: GradeRecord['kind']) => void; onClose: () => void }) {
  const d = useStudy();
  const today = useToday();
  const exam = fromExamId ? d.exams[fromExamId] : undefined;
  const [kind, setKind] = useState<GradeRecord['kind']>(record?.kind ?? kind0);
  const [name, setName] = useState(record?.name ?? exam?.name ?? '');
  const [date, setDate] = useState(record?.date ?? (exam ? examEnd(exam) : today));
  const [memo, setMemo] = useState(record?.memo ?? '');
  const startNames = (k: GradeRecord['kind']) => {
    if (exam) {
      const ids = examSubjectIds(exam);
      if (ids.length) return ids.map((id) => d.subjects[id]?.name ?? '과목');
    }
    return k === 'mock' ? MOCK_SUBJECTS : subjectsOf(d).map((s) => s.name);
  };
  const [rows, setRows] = useState<Row[]>(() => (record ? record.scores.map(toRow) : startNames(kind).map(emptyRow)));
  const [touched, setTouched] = useState(!!record);
  const school = kind === 'school';
  const cols: { k: keyof Row; label: string; lo: number; hi: number }[] = school
    ? [
        { k: 'raw', label: '원점수', lo: 0, hi: 1000 },
        { k: 'average', label: '평균', lo: 0, hi: 1000 },
        { k: 'grade', label: '등급', lo: 1, hi: 9 },
      ]
    : [
        { k: 'raw', label: '원점수', lo: 0, hi: 1000 },
        { k: 'standard', label: '표준', lo: 0, hi: 300 },
        { k: 'percentile', label: '백분위', lo: 0, hi: 100 },
        { k: 'grade', label: '등급', lo: 1, hi: 9 },
      ];
  const bad = rows.flatMap((r) => cols.filter((c) => r[c.k] && readNum(r[c.k] as string, c.lo, c.hi) === undefined).map((c) => `${r.subject || '과목'} ${c.label}`));
  const filled = rows.filter((r) => r.subject.trim() && cols.some((c) => (r[c.k] as string).trim()));
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
      at: r.at ?? now,
    }));
    put('grades', { ...(record ?? {}), id: record?.id ?? newId(), kind, name: name.trim().slice(0, 40), date, examId: record?.examId ?? exam?.id, scores, memo: memo.trim() || undefined });
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
                // 아직 아무것도 안 적었으면 과목도 그 종류에 맞게
                if (!touched) setRows(startNames(k).map(emptyRow));
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="st-inline wrap">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={school ? '예: 1학년 2학기 기말고사' : '예: 고2 6월 모의고사'} aria-label="시험 이름" />
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
            </div>
          ))}
          <button type="button" className="st-link" onClick={() => setRows((rs) => [...rs, emptyRow('')])}>
            ＋ 과목 줄 더하기
          </button>
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
