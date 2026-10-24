// 계획 만들기·고치기 (설계 §5.1). 문제집(페이지)과 단어장(Day)이 같이 쓴다.
import { useMemo, useState } from 'react';
import { addDays, shortDate } from './dates';
import { alive, newId, type Id, type Plan, type Range, type Unit } from './model';
import { compress, expand, rangeText } from './pages';
import { baselineOf, schedule } from './plan';
import { planCtx } from './select';
import { put, remove, useStudy } from './store';
import { Field, WeekdayPicker } from './ui';

interface Props {
  target: Plan['target'];
  targetId: Id;
  units: Unit[];
  done: Set<number>;
  reserved: Set<number>;
  existing?: Plan;
  today: string;
  onDone: () => void;
}

const unitWord = (t: Plan['target']) => (t === 'book' ? '쪽' : 'Day');

/** 「12-30, 45」 → 범위 */
function parseRanges(s: string): Range[] {
  const out: Range[] = [];
  for (const part of s.split(/[,\s]+/)) {
    const m = part.match(/^(\d+)(?:[-~](\d+))?$/);
    if (m) out.push([Number(m[1]), Number(m[2] ?? m[1])]);
  }
  return out;
}

export function PlanForm({ target, targetId, units, done, reserved, existing, today, onDone }: Props) {
  const d = useStudy();
  const exams = alive(d.exams)
    .filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const usable = units.filter((u) => !u.skip);
  const [picked, setPicked] = useState<Set<number>>(() => {
    if (!existing) return new Set(usable.map((_, i) => i));
    const inPlan = new Set(expand(existing.range));
    return new Set(usable.map((u, i) => (expand([[u.from, u.to]]).some((p) => inPlan.has(p)) ? i : -1)).filter((i) => i >= 0));
  });
  const [custom, setCustom] = useState('');
  const [mode, setMode] = useState<'exam' | 'date'>(existing ? (existing.examId ? 'exam' : 'date') : target === 'book' ? 'exam' : 'date');
  const [examId, setExamId] = useState(existing?.examId ?? exams[0]?.id ?? '');
  const [due, setDue] = useState(existing?.due ?? addDays(today, 14));
  const [includeDue, setIncludeDue] = useState(existing?.includeDue ?? false);
  const [start, setStart] = useState(existing?.start ?? today);
  const [ownRest, setOwnRest] = useState(!!existing?.restDays);
  const [rest, setRest] = useState<number[]>(existing?.restDays ?? d.settings.restDays);
  const [max, setMax] = useState(existing?.dailyMax ? String(existing.dailyMax) : '');
  const [newExam, setNewExam] = useState({ name: '', date: addDays(today, 30) });

  const range: Range[] = useMemo(() => {
    const c = parseRanges(custom);
    if (c.length) return c;
    return compress(usable.filter((_, i) => picked.has(i)).flatMap((u) => expand([[u.from, u.to]])));
  }, [custom, picked, usable]);

  const draft: Plan = {
    id: existing?.id ?? newId(),
    updatedAt: 0,
    target,
    targetId,
    range,
    start,
    examId: mode === 'exam' ? examId || undefined : undefined,
    due: mode === 'date' ? due : undefined,
    includeDue: mode === 'date' ? true : includeDue,
    restDays: ownRest ? rest : undefined,
    dailyMax: max ? Number(max) : null,
    baseline: 0,
  };
  const t = { units, done, reserved };
  const ctx = planCtx(d, today);
  const baseline = baselineOf(draft, t, ctx);
  const preview = schedule({ ...draft, baseline }, t, ctx);
  const left = preview.remaining.length;

  function addExam() {
    if (!newExam.name.trim()) return;
    const id = newId();
    put('exams', { id, name: newExam.name.trim(), date: newExam.date });
    setExamId(id);
    setNewExam({ name: '', date: newExam.date });
  }

  function save() {
    if (!range.length) return;
    put('plans', { ...draft, baseline, todayLock: undefined, carried: existing?.carried });
    onDone();
  }

  const u = unitWord(target);
  return (
    <div className="st-form">
      {usable.length > 1 && (
        <Field group label="범위" hint="시험 범위만 고르세요">
          <div className="st-unit-pick">
            <button type="button" className="st-link" onClick={() => setPicked(picked.size === usable.length ? new Set() : new Set(usable.map((_, i) => i)))}>
              {picked.size === usable.length ? '모두 해제' : '모두 고르기'}
            </button>
            {usable.map((unit, i) => (
              <label key={i} className={`st-unit ${picked.has(i) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={picked.has(i)}
                  onChange={() => {
                    const n = new Set(picked);
                    n.has(i) ? n.delete(i) : n.add(i);
                    setPicked(n);
                  }}
                />
                <span>{unit.name}</span>
                {target === 'book' && <small>p.{unit.from}~{unit.to}</small>}
              </label>
            ))}
          </div>
        </Field>
      )}
      <Field label={target === 'book' ? '또는 페이지 직접' : '또는 Day 직접'} hint={`예: ${target === 'book' ? '12-80, 95-110' : '1-10'} (쓰면 위 선택 대신 이것으로)`}>
        <input className="st-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={rangeText(range) || '12-80'} />
      </Field>

      <Field group label="마감">
        <div className="st-seg">
          <button type="button" className={mode === 'exam' ? 'on' : ''} onClick={() => setMode('exam')}>
            시험에 맞추기
          </button>
          <button type="button" className={mode === 'date' ? 'on' : ''} onClick={() => setMode('date')}>
            날짜 직접
          </button>
        </div>
      </Field>
      {mode === 'exam' ? (
        <>
          {exams.length > 0 && (
            <div className="st-chips">
              {exams.map((e) => (
                <button key={e.id} type="button" className={`st-chip ${examId === e.id ? 'on' : ''}`} onClick={() => setExamId(e.id)}>
                  {e.name} · {shortDate(e.date)}
                </button>
              ))}
            </div>
          )}
          <div className="st-inline wrap">
            <input className="st-input sm" placeholder="새 시험 이름 (예: 2학기 기말)" value={newExam.name} onChange={(e) => setNewExam({ ...newExam, name: e.target.value })} />
            <input className="st-input sm" type="date" value={newExam.date} min={today} onChange={(e) => setNewExam({ ...newExam, date: e.target.value })} />
            <button type="button" className="btn btn-sm" onClick={addExam}>
              시험 추가
            </button>
          </div>
          <label className="st-toggle">
            <input type="checkbox" checked={includeDue} onChange={(e) => setIncludeDue(e.target.checked)} /> 시험 날도 공부하는 날에 넣기 (기본: 전날까지)
          </label>
        </>
      ) : (
        <input className="st-input" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="마감 날짜 (그날까지)" />
      )}

      <details className="st-more">
        <summary>더 정하기 (시작일 · 쉬는 요일 · 하루 최대)</summary>
        <Field label="시작일">
          <input className="st-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <label className="st-toggle">
          <input type="checkbox" checked={ownRest} onChange={(e) => setOwnRest(e.target.checked)} /> 이 계획만 쉬는 요일 따로 정하기
        </label>
        {ownRest && <WeekdayPicker value={rest} onChange={setRest} label="쉬는 요일" />}
        <Field label={`하루 최대 (${u})`} hint="넘으면 알려 드려요">
          <input className="st-input xs" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} placeholder="없음" />
        </Field>
      </details>

      <div className="st-preview">
        {!range.length ? (
          '범위를 골라 주세요'
        ) : left === 0 ? (
          '이 범위는 이미 다 했어요'
        ) : preview.warning?.kind === 'overdue' || preview.warning?.kind === 'nodays' ? (
          <span className="bad">마감까지 공부하는 날이 없어요. 날짜를 바꿔 주세요</span>
        ) : (
          <>
            남은 <b>{left}{u === 'Day' ? '개 Day' : '쪽'}</b> → 하루 약 <b>{baseline}{u === 'Day' ? '개 Day' : '쪽'}</b>
            {preview.end && ` · ${shortDate(preview.end)}까지`}
            {preview.today.length > 0 && (
              <div className="st-muted">
                오늘: {target === 'book' ? 'p.' : 'Day '}
                {rangeText(preview.today)}
              </div>
            )}
          </>
        )}
      </div>
      <div className="st-row end">
        {existing && (
          <button
            type="button"
            className="btn btn-sm st-danger"
            onClick={() => {
              if (!window.confirm('이 계획을 지울까요? (진도는 남아요)')) return;
              remove('plans', existing.id);
              onDone();
            }}
          >
            계획 지우기
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={!range.length || (mode === 'exam' && !examId)} onClick={save}>
          {existing ? '계획 고치기' : '계획 만들기'}
        </button>
      </div>
    </div>
  );
}
