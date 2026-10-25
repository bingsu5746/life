// 운동: 기록 · 이번 주 목표 · 연속 운동 · 주별 그래프 · 종류별 · 몸무게
import { useState } from 'react';
import { BarChart, LineChart } from '../study/charts';
import { addDays, shortDate, weekStart } from '../study/dates';
import { alive, newId, type Workout } from '../study/model';
import { put, remove, setSettings, useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { Bar, confirmDelete, Empty, Field, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { weeklyMinutes, weekWorkouts, workoutStreak } from './calc';

const KINDS = ['달리기', '걷기', '헬스', '홈트', '자전거', '수영', '구기', '요가·스트레칭'];
const CARDIO = ['달리기', '걷기', '자전거', '수영'];
const EFFORT = ['', '가볍게', '보통', '힘들게'];
const md = (x: string) => shortDate(x).replace(/\(.\)/, '');

/** sub: 'new' 이면 넣기 창 */
export function Fitness({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState<Workout | 'new' | null>(sub === 'new' ? 'new' : null);
  const [goalOpen, setGoalOpen] = useState(false);
  const all = alive(d.workouts).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const ws = weekStart(today);
  const week = weekWorkouts(d, ws);
  const weekDays = new Set(week.map((w) => w.date)).size;
  const weekMin = week.reduce((a, w) => a + (w.minutes ?? 0), 0);
  const goal = d.settings.fitnessGoal ?? {};
  const weeks = weeklyMinutes(all, today, 12);
  const from30 = addDays(today, -29);
  const kinds = new Map<string, { n: number; min: number }>();
  for (const w of all.filter((x) => x.date >= from30)) {
    const k = kinds.get(w.kind) ?? { n: 0, min: 0 };
    kinds.set(w.kind, { n: k.n + 1, min: k.min + (w.minutes ?? 0) });
  }
  const kindRows = [...kinds.entries()].sort((a, b) => b[1].min - a[1].min || b[1].n - a[1].n);
  const kindMax = Math.max(1, ...kindRows.map(([, v]) => v.min));
  const close = () => {
    setEdit(null);
    if (sub) go('/fitness');
  };
  const h = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}시간` : `${m}분`);

  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>운동</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
          <Icon name="plus" /> 운동 넣기
        </button>
      </div>

      <section className="st-card">
        <div className="st-inline between">
          <h3 className="st-h">이번 주</h3>
          <button className="st-link" onClick={() => setGoalOpen(true)}>
            {goal.perWeek || goal.minutes ? '목표 고치기' : '목표 정하기'}
          </button>
        </div>
        <div className="st-stat-row">
          <div>
            <small>운동한 날</small>
            <b>
              {weekDays}
              {goal.perWeek ? `/${goal.perWeek}` : ''}일
            </b>
          </div>
          <div>
            <small>운동 시간</small>
            <b>{minutesText(weekMin)}</b>
          </div>
          <div>
            <small>연속</small>
            <b>{workoutStreak(all, today)}일</b>
          </div>
        </div>
        {goal.perWeek ? <Bar value={weekDays} max={goal.perWeek} label="이번 주 운동 횟수 목표" /> : null}
        {goal.minutes ? (
          <p className="st-hint">
            시간 목표 {minutesText(goal.minutes)} 중 {Math.min(100, Math.round((weekMin / goal.minutes) * 100))}%
          </p>
        ) : null}
      </section>

      {!all.length ? (
        <Empty icon="🏃" title="운동 기록을 넣어 보세요">
          <p>달리기·헬스·홈트 등 한 운동과 시간을 넣으면 이번 주 몇 번 했는지, 몇 주째 꾸준한지 보여 드려요.</p>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            운동 넣기
          </button>
        </Empty>
      ) : (
        <>
          <section className="st-card">
            <h3 className="st-h">주별 운동 시간 (최근 12주)</h3>
            <BarChart label="주별 운동 시간" height={150} bars={weeks.map((w, i) => ({ label: md(w.start), title: `${shortDate(w.start)} 주 · ${w.count}일`, value: w.min, strong: i === weeks.length - 1 }))} format={h} tickUnit={Math.max(...weeks.map((w) => w.min)) >= 120 ? 60 : 1} />
            {kindRows.length > 0 && (
              <>
                <h4 className="ta-h">종류별 (최근 30일)</h4>
                {kindRows.map(([k, v]) => (
                  <div key={k} className="st-subj-row">
                    <span>{k}</span>
                    <Bar value={v.min} max={kindMax} label={`${k} 운동 시간`} />
                    <small>
                      {v.n}번 · {minutesText(v.min)}
                    </small>
                  </div>
                ))}
              </>
            )}
          </section>

          <section className="st-card">
            <h3 className="st-h">기록</h3>
            {all.slice(0, 30).map((w) => (
              <div key={w.id} className="st-item st-tap" {...tap(() => setEdit(w))}>
                <small className="st-muted nowrap">{shortDate(w.date)}</small>
                <div className="st-item-main">
                  <div className="st-item-title">
                    {w.kind}
                    {w.minutes ? ` · ${minutesText(w.minutes)}` : ''}
                    {w.distance ? ` · ${w.distance}km` : ''}
                  </div>
                  {(w.detail || w.memo || w.effort) && <div className="st-item-sub">{[w.effort ? EFFORT[w.effort] : '', w.detail, w.memo].filter(Boolean).join(' · ')}</div>}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <WeightCard today={today} />

      {edit && <WorkoutSheet item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
      {goalOpen && <GoalSheet onClose={() => setGoalOpen(false)} />}
    </div>
  );
}

function WeightCard({ today }: { today: string }) {
  const d = useStudy();
  const logs = alive(d.bodyLogs).sort((a, b) => a.id.localeCompare(b.id));
  const todayLog = d.bodyLogs[today]?.deleted ? undefined : d.bodyLogs[today];
  const [v, setV] = useState(todayLog?.weight?.toString() ?? '');
  const last = logs.slice(-30);
  const save = () => {
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n < 10 || n > 400) return toast('몸무게를 확인해 주세요');
    put('bodyLogs', { id: today, weight: Math.round(n * 10) / 10 } as never);
    toast('오늘 몸무게를 적었어요');
  };
  return (
    <details className="st-card st-more">
      <summary>몸무게 (선택)</summary>
      <div className="st-inline">
        <input className="st-input xs" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="kg" aria-label="오늘 몸무게 (kg)" onKeyDown={(e) => e.key === 'Enter' && save()} />
        kg
        <button className="btn btn-sm" onClick={save}>
          오늘 적기
        </button>
      </div>
      {last.length > 1 && <LineChart label="몸무게 흐름" height={150} points={last.map((l) => ({ label: md(l.id), title: shortDate(l.id), y: l.weight }))} format={(x) => `${Math.round(x * 10) / 10}`} />}
      <p className="st-hint">이 기기와 내 계정에만 저장돼요.</p>
    </details>
  );
}

function GoalSheet({ onClose }: { onClose: () => void }) {
  const d = useStudy();
  const g = d.settings.fitnessGoal ?? {};
  const [per, setPer] = useState(g.perWeek?.toString() ?? '');
  const [min, setMin] = useState(g.minutes ? String(Math.round(g.minutes / 60)) : '');
  return (
    <Sheet title="운동 목표" onClose={onClose}>
      <div className="st-form">
        <div className="st-inline">
          일주일에
          <input className="st-input xs" inputMode="numeric" value={per} onChange={(e) => setPer(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="일주일 운동 횟수" />일
        </div>
        <div className="st-inline">
          일주일에
          <input className="st-input xs" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="일주일 운동 시간 (시간)" />
          시간 (선택)
        </div>
        <div className="st-row end">
          <button
            className="btn btn-primary"
            onClick={() => {
              const p = Number(per);
              const m = Number(min);
              setSettings({ fitnessGoal: { perWeek: p >= 1 && p <= 14 ? p : undefined, minutes: m >= 1 ? m * 60 : undefined } });
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

function WorkoutSheet({ item, today, onClose }: { item?: Workout; today: string; onClose: () => void }) {
  const [date, setDate] = useState(item?.date ?? today);
  const [kind, setKind] = useState(item?.kind ?? '달리기');
  const [custom, setCustom] = useState(item && !KINDS.includes(item.kind) ? item.kind : '');
  const [minutes, setMinutes] = useState(item?.minutes?.toString() ?? '30');
  const [distance, setDistance] = useState(item?.distance?.toString() ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [effort, setEffort] = useState(item?.effort ?? 2);
  const [memo, setMemo] = useState(item?.memo ?? '');
  const k = custom.trim() || kind;
  const dist = Number(distance.replace(',', '.'));
  function save() {
    if (!k || !date) return;
    const m = Number(minutes);
    put('workouts', {
      ...(item ?? { created: Date.now() }),
      id: item?.id ?? newId(),
      date,
      kind: k.slice(0, 20),
      minutes: m > 0 && m <= 1440 ? Math.round(m) : undefined,
      distance: distance && dist > 0 && dist <= 1000 ? Math.round(dist * 100) / 100 : undefined,
      detail: detail.trim() || undefined,
      effort,
      memo: memo.trim() || undefined,
    } as Workout);
    toast(item ? '고쳤어요' : '운동을 기록했어요');
    onClose();
  }
  return (
    <Sheet title={item ? '운동 고치기' : '운동 넣기'} onClose={onClose}>
      <div className="st-form">
        <Field group label="종류">
          <div className="st-chips">
            {KINDS.map((x) => (
              <button key={x} type="button" className={`st-chip ${!custom && kind === x ? 'on' : ''}`} aria-pressed={!custom && kind === x} onClick={() => (setKind(x), setCustom(''))}>
                {x}
              </button>
            ))}
          </div>
          <input className="st-input sm" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="그 밖 (예: 줄넘기)" aria-label="다른 운동" />
        </Field>
        <div className="st-inline wrap">
          <label className="st-cond-time">
            날짜
            <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="st-cond-time">
            시간(분)
            <input className="st-input xs" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          {CARDIO.includes(k) && (
            <label className="st-cond-time">
              거리(km)
              <input className="st-input xs" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />
            </label>
          )}
        </div>
        {!CARDIO.includes(k) && (
          <Field label="한 것 (선택)">
            <input className="st-input" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="예: 스쿼트 3×10 40kg, 팔굽혀펴기 3×15" />
          </Field>
        )}
        <div className="st-seg" aria-label="힘든 정도">
          {[1, 2, 3].map((e) => (
            <button key={e} type="button" className={effort === e ? 'on' : ''} aria-pressed={effort === e} onClick={() => setEffort(e)}>
              {EFFORT[e]}
            </button>
          ))}
        </div>
        <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" aria-label="메모" />
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete('이 운동 기록')) return;
                remove('workouts', item.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!k || !date} onClick={save}>
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
