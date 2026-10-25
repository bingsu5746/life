// 공부 타이머 · 기록 (설계 §10)
import { useState } from 'react';
import { addDays, daysBetween, shortDate, weekStart, WEEKDAYS } from './dates';
import { BarChart, TableView } from './charts';
import { bySubject, compare, daily, minutesByDate, studyStreak, weekdayAverage, weekly } from './timeStats';
import { alive, type StudySession } from './model';
import { addSession } from './actions';
import { getStudy, put, remove, useStudy } from './store';
import { askNotify, loadTimer, primeAudio, saveTimer } from './timerStore';
import { clock, finish, minutesText, nextPhase, pause, resume, start, view, type TimerState } from './timer';
import { Bar, confirmDelete, Field, go, Icon, NumInput, Sheet, SubjectDot, SubjectPicker, subjectsOf, tap, toast, useNow, useToday } from './ui';

/** sub: 'manual' 이면 공부 시간 직접 넣기 창 (「＋」에서 올 때) */
export function Time({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [timer, setTimer] = useState<TimerState | null>(loadTimer);
  const [subjectId, setSubjectId] = useState(timer?.subjectId ?? subjectsOf(d)[0]?.id ?? '');
  const [kind, setKind] = useState<TimerState['kind']>(timer?.kind ?? 'pomo');
  const [manual, setManual] = useState(sub === 'manual');
  const pomo = d.settings.pomo;
  const update = (t: TimerState | null) => {
    setTimer(t);
    saveTimer(t);
  };

  function begin() {
    if (!subjectId) return toast('과목을 골라 주세요');
    askNotify();
    update(start(kind, d.subjects[subjectId]?.name ?? '', Date.now(), subjectId));
  }
  function stop() {
    if (!timer) return;
    let min = finish(timer, Date.now(), pomo);
    // 끄는 것을 잊고 오래 켜 둔 스톱워치: 기록할 시간을 확인한다
    if (min > 180) {
      const ans = window.prompt(`타이머가 ${minutesText(min)} 동안 켜져 있었어요. 실제로 공부한 시간(분)을 확인해 주세요.`, String(min));
      if (ans === null) return;
      const n = Math.round(Number(ans.replace(/[^\d]/g, '')));
      if (!Number.isFinite(n)) return;
      min = Math.min(n, min);
    }
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
          <Icon name="plus" /> 공부 시간 넣기
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
                뽀모도로 {pomo.work}/{pomo.short}분
              </button>
              <button className={kind === 'watch' ? 'on' : ''} onClick={() => setKind('watch')}>
                스톱워치
              </button>
            </div>
            <button className="btn btn-primary btn-lg" onClick={begin}>
              공부 시작
            </button>
          </div>
        ) : (
          <RunningTimer timer={timer} update={update} onStop={stop} />
        )}
      </section>

      <Stats sessions={sessions} today={today} todayMin={todayMin} />
      {sessions.length > 0 && <Analysis sessions={sessions} today={today} />}
      {manual && (
        <ManualSheet
          today={today}
          onClose={() => {
            setManual(false);
            if (sub) go('/time');
          }}
        />
      )}
    </div>
  );
}

/** 돌고 있는 타이머 (이 부품만 0.5초마다 다시 그린다) */
function RunningTimer({ timer, update, onStop }: { timer: TimerState; update: (t: TimerState | null) => void; onStop: () => void }) {
  const d = useStudy();
  const now = useNow(500);
  const pomo = d.settings.pomo;
  const v = view(timer, now, pomo);
  return (
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
                <button className="btn btn-primary btn-lg" onClick={() => (primeAudio(), update(nextPhase(timer, Date.now(), pomo).state))}>
                  {timer.phase === 'work' ? '휴식 시작' : '다음 공부 시작'}
                </button>
              )}
              {!v!.finished &&
                (timer.runningSince === null ? (
                  <button className="btn btn-lg" onClick={() => (primeAudio(), update(resume(timer, Date.now())))}>
                    계속
                  </button>
                ) : (
                  <button className="btn btn-lg" onClick={() => update(pause(timer, Date.now()))}>
                    멈춤
                  </button>
                ))}
              <button className="btn btn-lg" onClick={onStop}>
                끝내고 기록
              </button>
            </div>
            <p className="st-hint center">폰에서 다른 앱에 가 있으면 알림음이 늦게 날 수 있어요. 돌아오면 시간은 맞게 보여요.</p>
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
  const [edit, setEdit] = useState<StudySession | null>(null);
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
              <Bar value={min} max={s.weeklyGoal || Math.max(...bySubject.map((x) => x.min), 1)} label={`${s.name} 이번 주 공부 시간`} />
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
              <div className="st-item-main" {...tap(() => setEdit(s))} title="기록 고치기">
                <div className="st-item-title">
                  {d.subjects[s.subjectId ?? '']?.name ?? '공부'} · {minutesText(s.minutes)}
                </div>
                <div className="st-item-sub">
                  {shortDate(s.date)} {new Date(s.start).toTimeString().slice(0, 5)} · {s.kind === 'pomo' ? '뽀모도로' : s.kind === 'watch' ? '스톱워치' : '직접 넣음'}
                </div>
              </div>
            </div>
          ))}
          <p className="st-hint">기록을 누르면 시간을 고치거나 지울 수 있어요.</p>
        </section>
      )}
      <WeeklyGoals />
      {edit && <ManualSheet today={today} session={edit} onClose={() => setEdit(null)} />}
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
          <NumInput
            className="st-input xs"
            value={s.weeklyGoal ? Math.round((s.weeklyGoal / 60) * 10) / 10 : null}
            min={0}
            max={100}
            allowEmpty
            placeholder="없음"
            aria-label={`${s.name} 주간 목표 (시간)`}
            onCommit={(h) => put('subjects', { ...getStudy().subjects[s.id], weeklyGoal: h && h > 0 ? Math.round(h * 60) : undefined })}
          />
          시간
        </div>
      ))}
    </details>
  );
}

/** 공부 시간 분석: 기간을 골라 날짜별·주별·요일별·과목별로 */
function Analysis({ sessions, today }: { sessions: StudySession[]; today: string }) {
  const d = useStudy();
  const [range, setRange] = useState<14 | 30 | 90>(30);
  const byDate = minutesByDate(sessions);
  const days = daily(byDate, today, range);
  const total = days.reduce((a, x) => a + x.min, 0);
  const studied = days.filter((x) => x.min > 0);
  const best = studied.reduce<{ date: string; min: number } | null>((b, x) => (!b || x.min > b.min ? x : b), null);
  const week = compare(byDate, today, 7);
  const month = compare(byDate, today, 30);
  const weeks = weekly(byDate, today, 12);
  const wd = weekdayAverage(byDate, today, range);
  const subj = bySubject(sessions, addDays(today, -(range - 1)), today);
  const subjMax = Math.max(1, ...subj.map((x) => x.min));
  const h = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}시간` : `${m}분`);
  // 2시간이 넘는 그래프는 눈금을 시간 단위로
  const unit = (vals: number[]) => (Math.max(0, ...vals) >= 120 ? 60 : 1);
  const cmpText = (c: { now: number; before: number; pct: number | null }) =>
    c.pct === null ? (c.now ? '앞 기간 기록이 없어요' : '') : c.pct === 0 ? '앞 기간과 같아요' : `앞 기간보다 ${Math.abs(c.pct)}% ${c.pct > 0 ? '많아요' : '적어요'}`;
  const md = (x: string) => shortDate(x).replace(/\(.\)/, '');
  return (
    <section className="st-card ta">
      <div className="st-inline wrap between">
        <h3 className="st-h">공부 시간 분석</h3>
        <div className="st-seg" aria-label="기간">
          {([14, 30, 90] as const).map((r) => (
            <button key={r} className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>
              {r === 14 ? '2주' : r === 30 ? '30일' : '90일'}
            </button>
          ))}
        </div>
      </div>
      <div className="st-stat-row">
        <div>
          <small>하루 평균</small>
          <b>{minutesText(Math.round(total / range))}</b>
        </div>
        <div>
          <small>공부한 날</small>
          <b>
            {studied.length}/{range}일
          </b>
        </div>
        <div>
          <small>연속</small>
          <b>{studyStreak(byDate, today)}일</b>
        </div>
        <div>
          <small>가장 많이 한 날</small>
          <b>{best ? `${md(best.date)} ${h(best.min)}` : '—'}</b>
        </div>
      </div>
      <BarChart label={`최근 ${range}일 날짜별 공부 시간`} bars={days.map((x) => ({ label: md(x.date), title: shortDate(x.date), value: x.min, strong: x.date === today }))} avg={Math.round(total / range)} format={h} tickUnit={unit(days.map((x) => x.min))} />

      <div className="ta-compare">
        <div>
          <small>최근 7일</small>
          <b>{minutesText(week.now)}</b>
          <small>{cmpText(week)}</small>
        </div>
        <div>
          <small>최근 30일</small>
          <b>{minutesText(month.now)}</b>
          <small>{cmpText(month)}</small>
        </div>
      </div>

      <h4 className="ta-h">주별 (최근 12주)</h4>
      <BarChart label="최근 12주 주별 공부 시간" height={150} bars={weeks.map((w, i) => ({ label: md(w.start), title: `${shortDate(w.start)} 주`, value: w.min, strong: i === weeks.length - 1 }))} format={h} tickUnit={unit(weeks.map((w) => w.min))} />

      <h4 className="ta-h">요일별 평균 (최근 {range}일)</h4>
      <BarChart label="요일별 평균 공부 시간" height={140} bars={wd.map((m, i) => ({ label: WEEKDAYS[(i + 1) % 7], value: m }))} format={h} tickUnit={unit(wd)} />

      {subj.length > 0 && (
        <>
          <h4 className="ta-h">과목별 (최근 {range}일)</h4>
          {subj.map((x) => (
            <div key={x.subjectId || 'none'} className="st-subj-row">
              <span>
                {x.subjectId && <SubjectDot id={x.subjectId} d={d} />} {d.subjects[x.subjectId]?.name ?? '과목 없음'}
              </span>
              <Bar value={x.min} max={subjMax} label={`${d.subjects[x.subjectId]?.name ?? '과목 없음'} 공부 시간`} />
              <small>
                {minutesText(x.min)} · {total ? Math.round((x.min / total) * 100) : 0}%
              </small>
            </div>
          ))}
        </>
      )}
      <TableView head={['날짜', '공부 시간']} rows={[...days].reverse().map((x) => [shortDate(x.date), minutesText(x.min)])} />
    </section>
  );
}

/** 공부 시간 직접 넣기 · 기록 고치기 (session 이 있으면) */
function ManualSheet({ today, session, onClose }: { today: string; session?: StudySession; onClose: () => void }) {
  const d = useStudy();
  const [subjectId, setSubjectId] = useState(session ? (session.subjectId ?? '') : (subjectsOf(d)[0]?.id ?? ''));
  const [date, setDate] = useState(session?.date ?? today);
  const start0 = session?.minutes ?? 60;
  const [hours, setHours] = useState(String(Math.floor(start0 / 60)));
  const [mins, setMins] = useState(String(start0 % 60));
  const n = (Number(hours) || 0) * 60 + (Number(mins) || 0);
  return (
    <Sheet title={session ? '공부 기록 고치기' : '공부 시간 직접 넣기'} onClose={onClose}>
      <div className="st-form">
        <Field group label="과목">
          <SubjectPicker value={subjectId} onChange={setSubjectId} />
          <button type="button" className={`st-chip ${subjectId === '' ? 'on' : ''}`} aria-pressed={subjectId === ''} onClick={() => setSubjectId('')}>
            과목 없이 (하루 합계)
          </button>
        </Field>
        <div className="st-inline wrap">
          <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
          <input className="st-input xs" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="시간" />시간
          <input className="st-input xs" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="분" />분
        </div>
        {n > 720 && <p className="bad">하루에 {minutesText(n)}은 너무 길어요. 다시 확인해 주세요.</p>}
        <div className="st-row end">
          {session && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete('이 기록')) return;
                remove('sessions', session.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!n || n > 720}
            onClick={() => {
              if (session) {
                // 날짜를 바꾸면 그날 낮 12시에 한 것으로 (시작 시각을 알 수 없으므로)
                const start = date === session.date ? session.start : new Date(`${date}T12:00:00`).getTime();
                put('sessions', { ...session, subjectId: subjectId || undefined, date, minutes: n, start, end: start + n * 60_000 });
              } else {
                // 오늘이면 지금 끝난 것으로, 지난 날이면 그날 낮 12시부터 한 것으로
                const end = date === today ? Date.now() : new Date(`${date}T12:00:00`).getTime() + n * 60_000;
                addSession({ subjectId: subjectId || undefined, start: end - n * 60_000, end, minutes: n, date, kind: 'manual' });
              }
              onClose();
            }}
          >
            {session ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
