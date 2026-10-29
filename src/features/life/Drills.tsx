// 농구 혼자 연습: 오늘의 연습(약한 부분 위주) · 드릴 설명 · 슛 기록
import { useState } from 'react';
import { addDays, shortDate } from '../study/dates';
import { alive, newId, type BasketballStat, type Workout } from '../study/model';
import { putMany, useStudy } from '../study/store';
import { Check, Empty, go, toast, useToday } from '../study/ui';
import { ShotCounter, ShotSummary } from './ShotCounter';
import { AREA_NAME, buildSession, DRILLS, recentStats, totalMinutes, weaknesses, type Drill, type Need } from './drills';

const MIN = [20, 30, 45, 60];
const HAVE: [Need, string][] = [
  ['hoop', '골대 있어요'],
  ['wall', '벽만 있어요'],
  ['any', '공만 있어요'],
];
const LEVEL = ['', '쉬움', '보통', '어려움'];

function saved<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`my-study.drill.${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function keep(key: string, v: unknown) {
  try {
    localStorage.setItem(`my-study.drill.${key}`, JSON.stringify(v));
  } catch {
    /* 무시 */
  }
}

export function DrillsPage() {
  const d = useStudy();
  const today = useToday();
  const [minutes, setMinutes] = useState<number>(() => saved('minutes', 30));
  const [have, setHave] = useState<Need>(() => saved('have', 'hoop'));
  const [level, setLevel] = useState<1 | 2 | 3>(() => saved('level', 2));
  const [salt, setSalt] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [made, setMade] = useState<Record<string, string>>({});
  const stats = recentStats(d, today);
  const weak = weaknesses(stats);
  const day = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
  const logs = alive(d.drillLogs).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const recent = [...new Set(logs.filter((l) => l.date >= addDays(today, -3)).map((l) => l.drillId))];
  const plan = buildSession({ minutes, have, weak, salt: day * 7 + salt + minutes, maxLevel: level, recent });

  function finish() {
    const done = plan.filter((x) => checked.has(x.id));
    if (!done.length) return;
    const bb: BasketballStat = { mode: 'practice' };
    const now = Date.now();
    const entries = done.map((x, i) => {
      const m = made[x.id] !== undefined && made[x.id] !== '' ? Math.min(Number(made[x.id]), x.shots ?? 0) : undefined;
      if (x.shots && m !== undefined) {
        const [mk, ak] = x.shotKind === 'ft' ? (['ftm', 'fta'] as const) : x.shotKind === 'tp' ? (['tpm', 'tpa'] as const) : (['fgm', 'fga'] as const);
        bb[mk] = (bb[mk] ?? 0) + m;
        bb[ak] = (bb[ak] ?? 0) + x.shots;
      }
      return { id: newId(), date: today, drillId: x.id, made: m, shots: x.shots && m !== undefined ? x.shots : undefined, minutes: x.minutes, created: now + i };
    });
    const workout: Workout = { id: newId(), date: today, kind: '농구', minutes: totalMinutes(done), memo: `혼자 연습: ${done.map((x) => x.name).join(', ')}`, bb, created: now } as Workout;
    putMany([...entries.map((e) => ({ c: 'drillLogs' as const, item: e as never })), { c: 'workouts' as const, item: workout as never }]);
    toast(`${totalMinutes(done)}분 연습을 기록했어요`);
    setChecked(new Set());
    setMade({});
  }

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>농구 연습</h2>
      </div>
      <ShotCounter />
      <ShotSummary />
      <section className="st-card dr-opts">
        <div className="st-chips" aria-label="시간">
          {MIN.map((m) => (
            <button key={m} className={`st-chip ${minutes === m ? 'on' : ''}`} aria-pressed={minutes === m} onClick={() => (setMinutes(m), keep('minutes', m))}>
              {m}분
            </button>
          ))}
        </div>
        <div className="st-chips" aria-label="장소">
          {HAVE.map(([k, l]) => (
            <button key={k} className={`st-chip ${have === k ? 'on' : ''}`} aria-pressed={have === k} onClick={() => (setHave(k), keep('have', k))}>
              {l}
            </button>
          ))}
        </div>
        <div className="st-chips" aria-label="난이도">
          {([1, 2, 3] as const).map((l) => (
            <button key={l} className={`st-chip ${level === l ? 'on' : ''}`} aria-pressed={level === l} onClick={() => (setLevel(l), keep('level', l))}>
              {LEVEL[l]}까지
            </button>
          ))}
        </div>
      </section>

      {weak.length > 0 ? (
        <p className="st-hint">
          최근 30일 기록으로 보니{' '}
          {weak
            .slice(0, 3)
            .map((w) => w.why)
            .join(' · ')}{' '}
          →{' '}
          {weak
            .slice(0, 2)
            .map((w) => AREA_NAME[w.area])
            .join('·')}{' '}
          위주로 짰어요.
        </p>
      ) : (
        <p className="st-hint">{stats.sessions ? '약한 부분을 찾으려면 슛 기록(넣은 수·던진 수)이 조금 더 필요해요. 고르게 짰어요.' : '농구 기록이 쌓이면 약한 부분 위주로 짜 드려요. 지금은 고르게 짰어요.'}</p>
      )}

      <section className="st-card">
        <div className="st-inline between">
          <h3 className="st-h">
            오늘의 연습 <small className="st-muted">{totalMinutes(plan)}분</small>
          </h3>
          <button className="st-link" onClick={() => (setSalt(salt + 1), setChecked(new Set()), setOpen(null))}>
            다시 뽑기
          </button>
        </div>
        {!plan.length && <p className="st-hint">이 조건에 맞는 연습이 없어요. 시간을 늘리거나 난이도를 올려 보세요.</p>}
        {plan.map((x) => (
          <DrillRow
            key={x.id}
            x={x}
            on={checked.has(x.id)}
            open={open === x.id}
            made={made[x.id] ?? ''}
            onToggle={() => setChecked((c) => (c.has(x.id) ? new Set([...c].filter((i) => i !== x.id)) : new Set([...c, x.id])))}
            onOpen={() => setOpen(open === x.id ? null : x.id)}
            onMade={(v) => setMade({ ...made, [x.id]: v })}
          />
        ))}
        {checked.size > 0 && (
          <div className="st-row end">
            <button className="btn btn-primary" onClick={finish}>
              연습 끝내기 · {totalMinutes(plan.filter((x) => checked.has(x.id)))}분 기록
            </button>
          </div>
        )}
      </section>

      <details className="st-card dr-lib">
        <summary>드릴 전체 보기 ({DRILLS.length}개)</summary>
        {(Object.keys(AREA_NAME) as (keyof typeof AREA_NAME)[])
          .filter((a) => DRILLS.some((x) => x.area === a))
          .map((a) => (
            <div key={a}>
              <h4 className="st-group">{AREA_NAME[a]}</h4>
              {DRILLS.filter((x) => x.area === a).map((x) => (
                <details key={x.id} className="dr-one">
                  <summary>
                    {x.name}{' '}
                    <small className="st-muted">
                      {x.minutes}분 · {LEVEL[x.level]} · {x.need === 'hoop' ? '골대' : x.need === 'wall' ? '벽' : '공만'}
                    </small>
                  </summary>
                  <Steps x={x} />
                </details>
              ))}
            </div>
          ))}
      </details>

      {logs.length > 0 ? (
        <section className="st-card">
          <h3 className="st-h">최근 연습</h3>
          {logs.slice(0, 10).map((l) => {
            const x = DRILLS.find((y) => y.id === l.drillId);
            return (
              <div key={l.id} className="st-item">
                <small className="st-muted nowrap">{shortDate(l.date)}</small>
                <div className="st-item-main">
                  <div className="st-item-title">
                    {x?.name ?? l.drillId}
                    {l.shots ? ` · ${l.made}/${l.shots} (${Math.round(((l.made ?? 0) / l.shots) * 100)}%)` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <Empty title="연습을 끝내면 여기에 쌓여요">
          <button className="st-link" onClick={() => go('/fitness/basketball')}>
            농구 기록 보기
          </button>
        </Empty>
      )}
    </div>
  );
}

function Steps({ x }: { x: Drill }) {
  return (
    <>
      <ol className="dr-steps">
        {x.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {x.from && x.src && (
        <a className="dr-src" href={x.src} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
          {x.from}의 연습에서 따옴 · 자료 보기
        </a>
      )}
    </>
  );
}

function DrillRow({ x, on, open, made, onToggle, onOpen, onMade }: { x: Drill; on: boolean; open: boolean; made: string; onToggle: () => void; onOpen: () => void; onMade: (v: string) => void }) {
  return (
    <div className="st-item dr-row">
      <Check on={on} label={`${x.name} 했어요`} onClick={onToggle} />
      <div className="st-item-main st-tap" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}>
        <div className={`st-item-title ${on ? 'done' : ''}`}>
          {x.name}
          {x.from && <small className="dr-from"> · {x.from}</small>}
        </div>
        <div className="st-item-sub">
          {AREA_NAME[x.area]} · {x.minutes}분 · {x.reps}
        </div>
        {open && <Steps x={x} />}
      </div>
      {x.shots && open && (
        <label className="dr-made" onClick={(e) => e.stopPropagation()}>
          <input className="st-input xs" inputMode="numeric" value={made} onChange={(e) => onMade(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`${x.name} 넣은 개수`} />/{x.shots}
        </label>
      )}
    </div>
  );
}
