// 공부 타이머 · 기록 (설계 §10)
import { useEffect, useRef, useState } from 'react';
import { addDays, daysBetween, shortDate, weekStart, WEEKDAYS } from './dates';
import { alive, type StudySession } from './model';
import { addSession } from './actions';
import { put, remove, useStudy } from './store';
import { clock, finish, minutesText, nextPhase, pause, resume, start, view, type TimerState } from './timer';
import { Bar, Field, Sheet, SubjectDot, SubjectPicker, subjectsOf, toast, useNow, useToday } from './ui';

const TIMER_KEY = 'my-study.study.timer.v1';

function loadTimer(): TimerState | null {
  try {
    return JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function saveTimer(t: TimerState | null) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch {
    /* 무시 */
  }
}

/** 짧은 알림음 (화면이 켜져 있을 때만) */
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.start();
    o.stop(ctx.currentTime + 0.65);
    setTimeout(() => void ctx.close(), 1000);
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* 소리를 낼 수 없는 환경 */
  }
}

export function Time() {
  const d = useStudy();
  const today = useToday();
  const now = useNow(500);
  const [timer, setTimer] = useState<TimerState | null>(loadTimer);
  const [subjectId, setSubjectId] = useState(timer?.subjectId ?? subjectsOf(d)[0]?.id ?? '');
  const [kind, setKind] = useState<TimerState['kind']>(timer?.kind ?? 'pomo');
  const [manual, setManual] = useState(false);
  const pomo = d.settings.pomo;
  const v = timer ? view(timer, now, pomo) : null;
  const rang = useRef(false);
  const update = (t: TimerState | null) => {
    setTimer(t);
    saveTimer(t);
  };

  useEffect(() => {
    if (v?.finished && !rang.current) {
      rang.current = true;
      if (v.overMs < 5000) beep();
    }
    if (!v?.finished) rang.current = false;
  }, [v?.finished, v?.overMs]);

  useEffect(() => {
    document.title = v && timer ? `${clock(v.shownMs)} ${timer.phase === 'work' ? '공부' : '휴식'} · 공부` : document.title;
  });

  function begin() {
    if (!subjectId) return toast('과목을 골라 주세요');
    update(start(kind, d.subjects[subjectId]?.name ?? '', Date.now(), subjectId));
  }
  function stop() {
    if (!timer) return;
    const min = finish(timer, Date.now(), pomo);
    if (min > 0) {
      addSession({ subjectId: timer.subjectId, bookId: timer.bookId, start: timer.startedAt, end: Date.now(), minutes: min, date: today, kind: timer.kind });
      toast(`${minutesText(min)} 기록했어요`);
    } else toast('1분이 안 돼서 기록하지 않았어요');
    update(null);
  }

  const sessions = alive(d.sessions);
  const todayMin = sessions.filter((s) => s.date === today).reduce((a, s) => a + s.minutes, 0);

  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>공부 기록</h2>
        <button className="btn btn-sm" onClick={() => setManual(true)}>
          ＋ 직접 넣기
        </button>
      </div>
      <section className={`st-card st-timer ${timer ? (timer.phase === 'work' ? 'work' : 'rest') : ''}`}>
        {!timer ? (
          <div className="st-form">
            <Field group label="과목">
              <SubjectPicker value={subjectId} onChange={setSubjectId} />
            </Field>
            <div className="st-seg">
              <button className={kind === 'pomo' ? 'on' : ''} onClick={() => setKind('pomo')}>
                🍅 뽀모도로 {pomo.work}/{pomo.short}분
              </button>
              <button className={kind === 'watch' ? 'on' : ''} onClick={() => setKind('watch')}>
                ⏱ 스톱워치
              </button>
            </div>
            <button className="btn btn-primary btn-lg" onClick={begin}>
              공부 시작
            </button>
          </div>
        ) : (
          <div className="st-timer-run">
            <Ring progress={v!.progress} phase={timer.kind === 'watch' ? 'work' : timer.phase}>
              <span className="st-timer-label">
                <SubjectDot id={timer.subjectId} d={d} /> {timer.label}
              </span>
              <b className="st-clock">{clock(v!.shownMs)}</b>
              <span className="st-muted">{timer.kind === 'watch' ? '스톱워치' : timer.phase === 'work' ? `공부 ${timer.round}번째` : timer.phase === 'long' ? '긴 휴식' : '휴식'}</span>
            </Ring>
            {v!.finished && (
              <p className="st-alert" role="alert">
                {timer.phase === 'work' ? `${pomo.work}분 공부 끝!` : '휴식 끝!'}
                {v!.overMs > 60_000 && ` (${Math.floor(v!.overMs / 60_000)}분 전)`}
              </p>
            )}
            <div className="st-row center">
              {timer.kind === 'pomo' && (v!.finished || timer.phase !== 'work') && (
                <button className="btn btn-primary btn-lg" onClick={() => update(nextPhase(timer, Date.now(), pomo).state)}>
                  {timer.phase === 'work' ? '휴식 시작' : '다음 공부 시작'}
                </button>
              )}
              {!v!.finished &&
                (timer.runningSince === null ? (
                  <button className="btn btn-lg" onClick={() => update(resume(timer, Date.now()))}>
                    ▶ 계속
                  </button>
                ) : (
                  <button className="btn btn-lg" onClick={() => update(pause(timer, Date.now()))}>
                    ⏸ 멈춤
                  </button>
                ))}
              <button className="btn btn-lg" onClick={stop}>
                ■ 끝내고 기록
              </button>
            </div>
            <p className="st-hint center">폰에서 다른 앱에 가 있으면 알림음이 늦게 날 수 있어요. 돌아오면 시간은 맞게 보여요.</p>
          </div>
        )}
      </section>

      <Stats sessions={sessions} today={today} todayMin={todayMin} />
      {manual && <ManualSheet today={today} onClose={() => setManual(false)} />}
    </div>
  );
}

function Ring({ progress, phase, children }: { progress: number; phase: string; children: React.ReactNode }) {
  const r = 92;
  const c = 2 * Math.PI * r;
  return (
    <div className="st-ring">
      <svg viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r={r} className="track" />
        <circle cx="100" cy="100" r={r} className={`fill ${phase}`} strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 100 100)" />
      </svg>
      <div className="st-ring-in">{children}</div>
    </div>
  );
}

function Stats({ sessions, today, todayMin }: { sessions: StudySession[]; today: string; todayMin: number }) {
  const d = useStudy();
  const ws = weekStart(today);
  const week = daysBetween(ws, addDays(ws, 6));
  const weekS = sessions.filter((s) => s.date >= ws && s.date <= addDays(ws, 6));
  const perDay = week.map((x) => weekS.filter((s) => s.date === x).reduce((a, s) => a + s.minutes, 0));
  const maxDay = Math.max(60, ...perDay);
  const subjects = subjectsOf(d);
  const bySubject = subjects.map((s) => ({ s, min: weekS.filter((x) => x.subjectId === s.id).reduce((a, x) => a + x.minutes, 0) })).filter((x) => x.min || x.s.weeklyGoal);
  // 최근 4주 잔디
  const from = addDays(ws, -21);
  const grid = daysBetween(from, addDays(ws, 6));
  const dayMin = new Map<string, number>();
  for (const s of sessions) if (s.date >= from) dayMin.set(s.date, (dayMin.get(s.date) ?? 0) + s.minutes);
  const recent = [...sessions].sort((a, b) => b.start - a.start).slice(0, 12);
  return (
    <>
      <section className="st-card">
        <div className="st-stat-row">
          <div>
            <small>오늘</small>
            <b>{minutesText(todayMin)}</b>
          </div>
          <div>
            <small>이번 주</small>
            <b>{minutesText(perDay.reduce((a, b) => a + b, 0))}</b>
          </div>
          <div>
            <small>최근 4주 공부한 날</small>
            <b>{[...dayMin.values()].filter((m) => m > 0).length}일</b>
          </div>
        </div>
        <div className="st-week-bars" aria-label="이번 주 날짜별 공부 시간">
          {week.map((x, i) => (
            <div key={x} className={`st-wbar ${x === today ? 'today' : ''}`}>
              <i style={{ height: `${(perDay[i] / maxDay) * 100}%` }} title={minutesText(perDay[i])} />
              <small>{WEEKDAYS[(i + 1) % 7]}</small>
            </div>
          ))}
        </div>
      </section>
      {bySubject.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">이번 주 과목별</h3>
          {bySubject.map(({ s, min }) => (
            <div key={s.id} className="st-subj-row">
              <span>
                <SubjectDot id={s.id} d={d} /> {s.name}
              </span>
              <Bar value={min} max={s.weeklyGoal || Math.max(...bySubject.map((x) => x.min), 1)} color={s.color} />
              <small>
                {minutesText(min)}
                {s.weeklyGoal ? ` / 목표 ${minutesText(s.weeklyGoal)}` : ''}
              </small>
            </div>
          ))}
        </section>
      )}
      <section className="st-card">
        <h3 className="st-h">최근 4주</h3>
        <div className="st-grass">
          {grid.map((x) => {
            const m = dayMin.get(x) ?? 0;
            const lv = m === 0 ? 0 : m < 30 ? 1 : m < 90 ? 2 : m < 180 ? 3 : 4;
            return <i key={x} className={`lv${lv} ${x === today ? 'today' : ''} ${x > today ? 'future' : ''}`} title={`${shortDate(x)} ${minutesText(m)}`} />;
          })}
        </div>
      </section>
      {recent.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">최근 기록</h3>
          {recent.map((s) => (
            <div key={s.id} className="st-item">
              <SubjectDot id={s.subjectId} d={d} />
              <div className="st-item-main">
                <div className="st-item-title">
                  {d.subjects[s.subjectId ?? '']?.name ?? '공부'} · {minutesText(s.minutes)}
                </div>
                <div className="st-item-sub">
                  {shortDate(s.date)} {new Date(s.start).toTimeString().slice(0, 5)} · {s.kind === 'pomo' ? '뽀모도로' : s.kind === 'watch' ? '스톱워치' : '직접 넣음'}
                </div>
              </div>
              <button className="st-x" aria-label="기록 지우기" onClick={() => window.confirm('이 기록을 지울까요?') && remove('sessions', s.id)}>
                ✕
              </button>
            </div>
          ))}
        </section>
      )}
      <WeeklyGoals />
    </>
  );
}

function WeeklyGoals() {
  const d = useStudy();
  const subjects = subjectsOf(d);
  if (!subjects.length) return null;
  return (
    <details className="st-card st-more">
      <summary>과목별 주간 목표 시간 (선택)</summary>
      {subjects.map((s) => (
        <div key={s.id} className="st-inline">
          <span className="st-goal-name">
            <SubjectDot id={s.id} d={d} /> {s.name}
          </span>
          <input
            className="st-input xs"
            inputMode="numeric"
            defaultValue={s.weeklyGoal ? String(s.weeklyGoal / 60) : ''}
            placeholder="없음"
            aria-label={`${s.name} 주간 목표 (시간)`}
            onBlur={(e) => {
              const h = Number(e.target.value);
              put('subjects', { ...s, weeklyGoal: h > 0 ? Math.round(h * 60) : undefined });
            }}
          />
          시간
        </div>
      ))}
    </details>
  );
}

function ManualSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const d = useStudy();
  const [subjectId, setSubjectId] = useState(subjectsOf(d)[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [min, setMin] = useState('60');
  return (
    <Sheet title="공부 시간 직접 넣기" onClose={onClose}>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
        </Field>
        <div className="st-inline">
          <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
          <input className="st-input xs" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} aria-label="분" />분
        </div>
        <div className="st-row end">
          <button
            className="btn btn-primary"
            disabled={!subjectId || !Number(min)}
            onClick={() => {
              const now = Date.now();
              addSession({ subjectId, start: now - Number(min) * 60_000, end: now, minutes: Number(min), date, kind: 'manual' });
              onClose();
            }}
          >
            넣기
          </button>
        </div>
      </div>
    </Sheet>
  );
}
