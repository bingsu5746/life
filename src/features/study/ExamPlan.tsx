// 시험 공부 자동 계획 화면 + 오늘 화면에 붙는 오늘 할 것
import { useState } from 'react';
import { dday, shortDate } from './dates';
import { buildExamPlan, DEFAULT_PLAN, reviewExamPlan, suggestedMinutes, todayExamItems, toggleItem, type PlanDay } from './examPlan';
import { alive, type Exam, type ExamPlanSettings } from './model';
import { put, setSettings, useStudy } from './store';
import { examEnd } from './exams';
import { Bar, Check, Empty, Field, go, SubjectDot, toast, useToday } from './ui';

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
const KIND_LABEL = { learn: '공부', notes: '오답', review: '복습', skim: '훑어보기' } as const;

/** 시험 하나의 계획 화면. /exams/<시험 id>/plan */
export function ExamPlanPage({ id }: { id: string }) {
  const d = useStudy();
  const today = useToday();
  const exam = d.exams[id];
  const [all, setAll] = useState(false);
  if (!exam || exam.deleted)
    return (
      <Empty title="시험을 찾을 수 없어요">
        <button className="btn" onClick={() => go('/exams')}>
          시험 목록
        </button>
      </Empty>
    );
  const scopes = (exam.scopes ?? []).filter((s) => s.lines.length);
  const plan = exam.plan;
  const result = buildExamPlan(d, exam, today);
  const base: ExamPlanSettings = { on: false, ...DEFAULT_PLAN, ...(d.settings.examPlanDefaults ?? {}) };
  const save = (p: Partial<ExamPlanSettings>) => put('exams', { ...exam, plan: { ...(exam.plan ?? base), ...(p.on && !exam.plan?.started ? { started: today } : {}), ...p } });
  const ended = examEnd(exam) < today;
  const sug = suggestedMinutes(d, today);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go(`/exams/${id}`)} aria-label="시험으로">
          ‹
        </button>
        <h2>공부 계획 · {exam.name}</h2>
      </div>

      {ended && plan ? (
        <PlanReviewCard exam={exam} />
      ) : !scopes.length ? (
        <Empty title="먼저 시험 범위를 넣어 주세요">
          <p>과목마다 시험 범위(단원·쪽수 한 줄씩)를 넣으면, 시험 날까지 날마다 나눠 줘요.</p>
          <button className="btn btn-primary" onClick={() => go(`/exams/${id}`)}>
            범위 넣으러 가기
          </button>
        </Empty>
      ) : !plan?.on || !result ? (
        <section className="st-card st-form">
          <h3 className="st-h">하루에 쓸 수 있는 시간</h3>
          <p className="st-sub">시험 범위의 줄마다 처음 공부할 날을 정하고, 마감 전에는 복습과 시험 전날 훑어보기를 넣어 드려요. 못 한 건 남은 날에 다시 나눠요.</p>
          <TimeInputs value={plan ?? base} onChange={save} />
          {(sug.weekday !== (plan?.weekday ?? DEFAULT_PLAN.weekday) || sug.weekend !== (plan?.weekend ?? DEFAULT_PLAN.weekend)) && (
            <button className="st-link" onClick={() => save(sug)}>
              평소 공부한 시간으로 (평일 {hm(sug.weekday)} · 주말 {hm(sug.weekend)})
            </button>
          )}
          <button className="btn btn-primary" onClick={() => save({ on: true })}>
            계획 만들기
          </button>
        </section>
      ) : (
        <>
          <Summary exam={exam} result={result} today={today} />
          <section className="st-card">
            <h3 className="st-h">과목</h3>
            {result.subjects.map((s) => (
              <div key={s.subjectId} className="xp-subj">
                <div className="st-inline between">
                  <span>
                    <SubjectDot id={s.subjectId} d={d} /> <b>{d.subjects[s.subjectId]?.name ?? '과목'}</b> <small className="st-muted">{dday(today, s.examDate)}</small>
                  </span>
                  <small className="st-muted">남은 {hm(s.need)}</small>
                </div>
                <div className="st-seg xp-mult" role="group" aria-label="이 과목에 쓸 시간">
                  {[
                    ['적게', 0.8],
                    ['보통', 1],
                    ['많이', 1.25],
                  ].map(([label, v]) => (
                    <button key={label as string} className={(plan.weights?.[s.subjectId] ?? 1) === v ? 'on' : ''} onClick={() => save({ weights: { ...(plan.weights ?? {}), [s.subjectId]: v as number } })}>
                      {label}
                    </button>
                  ))}
                </div>
                <small className="st-muted">{s.why}</small>
                {(() => {
                  const n = alive(d.notes).filter((x) => x.subjectId === s.subjectId && !x.learned).length;
                  return n > 0 ? (
                    <button className="st-link" onClick={() => go(`/review/redo?subject=${s.subjectId}`)}>
                      이 과목 오답 {n}개 다시 풀기
                    </button>
                  ) : null;
                })()}
              </div>
            ))}
          </section>
          <Days days={result.days} exam={exam} today={today} all={all} setAll={setAll} />
          <details className="st-card xp-settings">
            <summary>계획 설정</summary>
            <div className="st-form">
              <TimeInputs value={plan} onChange={save} />
              {(sug.weekday !== plan.weekday || sug.weekend !== plan.weekend) && (
                <button className="st-link" onClick={() => save(sug)}>
                  평소 공부한 시간으로 (평일 {hm(sug.weekday)} · 주말 {hm(sug.weekend)})
                </button>
              )}
              <button className="btn btn-sm st-danger" onClick={() => save({ on: false })}>
                계획 끄기
              </button>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function TimeInputs({ value, onChange }: { value: ExamPlanSettings; onChange: (p: Partial<ExamPlanSettings>) => void }) {
  const num = (s: string, a: number, b: number) => Math.min(b, Math.max(a, Number(s.replace(/\D/g, '')) || 0));
  return (
    <div className="xp-time">
      <Field label="평일 (분)">
        <input className="st-input xs" inputMode="numeric" value={value.weekday} onChange={(e) => onChange({ weekday: num(e.target.value, 0, 900) })} aria-label="평일 공부 시간" />
      </Field>
      <Field label="주말 (분)">
        <input className="st-input xs" inputMode="numeric" value={value.weekend} onChange={(e) => onChange({ weekend: num(e.target.value, 0, 900) })} aria-label="주말 공부 시간" />
      </Field>
      <Field label="범위 한 줄 (분)">
        <input className="st-input xs" inputMode="numeric" value={value.perLine} onChange={(e) => onChange({ perLine: num(e.target.value, 5, 300) })} aria-label="한 줄 공부 시간" />
      </Field>
      <Field label="복습 양">
        <div className="st-chips">
          {[
            ['적게', 0.2],
            ['보통', 0.35],
            ['많이', 0.55],
          ].map(([l, v]) => (
            <button key={l as string} type="button" className={`st-chip ${Math.abs(value.review - (v as number)) < 0.01 ? 'on' : ''}`} onClick={() => onChange({ review: v as number })}>
              {l}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function Summary({ exam, result, today }: { exam: Exam; result: NonNullable<ReturnType<typeof buildExamPlan>>; today: string }) {
  const tight = result.capacityTotal > 0 && result.needTotal / result.capacityTotal > 0.8;
  const late = result.short > 0;
  const days = result.days.filter((x) => x.capacity > 0).length;
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">{late ? '시간이 모자라요' : tight ? '빠듯해요' : '여유 있어요'}</h3>
        <small className="st-muted">{dday(today, exam.date)}</small>
      </div>
      <Bar value={Math.min(result.needTotal, result.capacityTotal)} max={Math.max(result.capacityTotal, 1)} label="남은 공부 시간" />
      <p className={`st-hint ${late ? 'bad' : ''}`}>
        남은 공부 {hm(result.needTotal)} / 쓸 수 있는 시간 {hm(result.capacityTotal)} ({days}일)
        {late && ` · 공부하는 날마다 ${result.extraPerDay}분씩 더 하거나, 범위를 줄이거나, 하루 시간을 늘려 보세요`}
      </p>
    </section>
  );
}

function Days({ days, exam, today, all, setAll }: { days: PlanDay[]; exam: Exam; today: string; all: boolean; setAll: (v: boolean) => void }) {
  const d = useStudy();
  const list = all ? days : days.slice(0, 8);
  return (
    <section className="st-card">
      <h3 className="st-h">날짜별 계획</h3>
      {list.map((day) => (
        <div key={day.date} className={`xp-day ${day.date === today ? 'today' : ''}`}>
          <div className="st-inline between">
            <b>
              {shortDate(day.date)} {day.date === today && <small className="st-muted">오늘</small>}
            </b>
            <small className="st-muted">{day.capacity ? (day.minutes ? `${hm(day.minutes)}` : '쉬어요') : '쉬는 날'}</small>
          </div>
          {day.items.map((it) => (
            <div key={it.id} className="st-item">
              <Check on={it.done} label={`${it.text} 했어요`} onClick={() => put('exams', toggleItem(exam, it.id, today))} />
              <div className="st-item-main">
                <div className={`st-item-title ${it.done ? 'done' : ''}`}>
                  <SubjectDot id={it.subjectId} d={d} /> {it.text}
                </div>
                <div className="st-item-sub">
                  {KIND_LABEL[it.kind]} · {it.minutes}분
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {days.length > 8 && (
        <button className="st-link" onClick={() => setAll(!all)}>
          {all ? '접기' : `나머지 ${days.length - 8}일 보기`}
        </button>
      )}
    </section>
  );
}

/** 오늘 화면: 켜 둔 시험의 오늘 할 것 */
export function ExamToday({ today }: { today: string }) {
  const d = useStudy();
  const list = todayExamItems(d, today).filter((x) => x.items.length > 0 || x.result.short > 0);
  if (!list.length) return null;
  return (
    <section className="st-card">
      {list.map(({ exam, items, result }) => {
        const left = items.filter((i) => !i.done).length;
        return (
          <div key={exam.id}>
            <div className="st-inline between">
              <h3 className="st-h">
                {exam.name} 공부 <small className="st-muted">{dday(today, exam.date)}</small>
              </h3>
              <button className="st-link" onClick={() => go(`/exams/${exam.id}/plan`)}>
                계획
              </button>
            </div>
            {items.map((it) => (
              <div key={it.id} className="st-item">
                <Check on={it.done} label={`${it.text} 했어요`} onClick={() => put('exams', toggleItem(exam, it.id, today))} />
                <div className={`st-item-main ${it.kind === 'notes' ? 'st-tap' : ''}`} onClick={it.kind === 'notes' ? () => go(`/review/redo?subject=${it.subjectId}`) : undefined}>
                  <div className={`st-item-title ${it.done ? 'done' : ''}`}>
                    <SubjectDot id={it.subjectId} d={d} /> {it.text}
                  </div>
                  <div className="st-item-sub">
                    {KIND_LABEL[it.kind]} · {it.minutes}분{it.kind === 'notes' ? ' · 눌러서 풀기' : ''}
                  </div>
                </div>
              </div>
            ))}
            {!items.length && <p className="st-hint">오늘은 쉬는 날이에요</p>}
            {result.short > 0 && (
              <p className="st-hint bad">
                시간이 {hm(result.short)} 모자라요 · 하루 {result.extraPerDay}분 더 필요해요
              </p>
            )}
            {left === 0 && items.length > 0 && <p className="st-hint">오늘 시험 공부 끝!</p>}
          </div>
        );
      })}
    </section>
  );
}

/** 끝난 시험: 계획대로 한 정도 · 실제 공부 시간 · 점수, 다음 계획에 쓸 값 */
function PlanReviewCard({ exam }: { exam: Exam }) {
  const d = useStudy();
  const r = reviewExamPlan(d, exam);
  if (!r) return <p className="st-hint">돌아볼 계획이 없어요.</p>;
  const next = { weekday: r.weekday ?? exam.plan!.weekday, weekend: r.weekend ?? exam.plan!.weekend, perLine: r.perLine ?? exam.plan!.perLine };
  const hasScore = r.subjects.some((s) => s.score !== null);
  return (
    <>
      <section className="st-card">
        <h3 className="st-h">시험 돌아보기</h3>
        <Bar value={Math.round(r.doneRate * 100)} max={100} label="범위 끝낸 비율" />
        <p className="st-hint">
          시험 범위 {Math.round(r.doneRate * 100)}%를 시험 전에 끝냈어요 ({shortDate(r.from)} ~ {shortDate(r.to)})
        </p>
        {r.subjects.map((s) => (
          <div key={s.subjectId} className="xp-subj">
            <div className="st-inline between">
              <span>
                <SubjectDot id={s.subjectId} d={d} /> <b>{d.subjects[s.subjectId]?.name ?? '과목'}</b>
              </span>
              <small className="st-muted">{s.score !== null ? `${s.score}점` : '점수 없음'}</small>
            </div>
            <small className="st-muted">
              범위 {s.done}/{s.lines} · 공부 시간 {hm(s.actual)} / 계획 {hm(s.planned)}
              {s.actual === 0 ? ' (이 과목으로 적은 공부 시간이 없어요)' : ''}
            </small>
          </div>
        ))}
        {!hasScore && (
          <button className="st-link" onClick={() => go(`/exams/grades/from-${exam.id}`)}>
            이 시험 성적 넣기 (점수와 나란히 볼 수 있어요)
          </button>
        )}
      </section>
      <section className="st-card">
        <h3 className="st-h">다음 시험 계획에</h3>
        <p className="st-sub">
          이번에 실제로는 평일 {r.weekday !== null ? hm(r.weekday) : '—'} · 주말 {r.weekend !== null ? hm(r.weekend) : '—'}씩 공부했고, 범위 한 줄에 {r.perLine !== null ? `${r.perLine}분` : '— (자료가 모자라요)'}쯤 걸렸어요. (공부 시간은 기록 칸에 과목을 골라 적은 것만 세요)
        </p>
        <button
          className="btn btn-sm"
          onClick={() => {
            setSettings({ examPlanDefaults: next });
            toast('다음에 만드는 시험 계획부터 이 값으로 시작해요');
          }}
        >
          다음 계획 기본값으로: 평일 {hm(next.weekday)} · 주말 {hm(next.weekend)} · 한 줄 {next.perLine}분
        </button>
      </section>
    </>
  );
}
