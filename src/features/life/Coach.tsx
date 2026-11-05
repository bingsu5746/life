// AI 코치: 열면 저절로 지난 7일 기록을 보내 다음 주 계획을 받는다 (주마다 한 번, 이 기기에 기억)
import { useEffect, useRef, useState } from 'react';
import { coachPlan, isLoggedIn, type CoachPlan } from '../auth/api';
import { busyDays, coachRecord, coachWeek, fitToBusy } from '../study/coach';
import { addDays, shortDate, weekday, WEEKDAYS } from '../study/dates';
import { setSettings, useStudy } from '../study/store';
import { go, toast, useToday } from '../study/ui';

const KEY = 'my-study.coach.v1';
type Saved = { week: string; at: number; plan: CoachPlan };
const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
const h = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

export function Coach() {
  const d = useStudy();
  const today = useToday();
  // 금 · 토 · 일에는 다음 주, 아니면 이번 주를 계획한다
  const week = coachWeek(today);
  const busyWeek = busyDays(d, week);
  const [saved, setSaved] = useState<Saved | null>(load);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const started = useRef(false);
  const run = () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    coachPlan(coachRecord(d, today))
      .then((plan) => {
        const s = { week, at: Date.now(), plan };
        setSaved(s);
        try {
          localStorage.setItem(KEY, JSON.stringify(s));
        } catch {
          /* 무시 */
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '받지 못했어요'))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    // 이번 주 계획이 없으면 저절로
    if (started.current || !isLoggedIn() || saved?.week === week) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  if (!isLoggedIn()) return <p className="st-muted">로그인하면 AI 코치가 기록을 보고 다음 주 계획을 짜 줘요.</p>;
  const p = saved?.plan;
  // 일정 · 시험이 겹친 날은 공부 시간을 알아서 줄인다 (AI 가 덜 줄였어도)
  const plan = p ? fitToBusy(p.plan, saved?.week === week ? busyWeek : busyDays(d, saved?.week ?? week)) : [];
  const planWeek = saved?.week ?? week;
  const dayIdx = (day: string) => (WEEKDAYS.indexOf(day) + 6) % 7;
  const inserted = !!d.settings.weekItems?.[planWeek];
  const toWeekPlan = () => {
    const targets = [0, 0, 0, 0, 0, 0, 0];
    const items: { subject: string; what: string; minutes: number }[][] = [[], [], [], [], [], [], []];
    for (const day of plan) {
      const i = dayIdx(day.day);
      if (i < 0) continue;
      targets[i] = total(day.items);
      items[i] = day.items.map((x) => ({ subject: x.subject, what: x.what, minutes: x.minutes }));
    }
    setSettings({ weekTargets: { ...(d.settings.weekTargets ?? {}), [planWeek]: targets }, weekItems: { ...(d.settings.weekItems ?? {}), [planWeek]: items } });
    toast(`${shortDate(planWeek)} 주 계획에 넣었어요`);
  };
  const total = (items: { minutes: number }[]) => items.reduce((a, x) => a + x.minutes, 0);
  return (
    <>
      <div className="co-head">
        <small className="st-muted">{busy ? '기록을 보고 계획을 짜는 중…' : saved ? `${new Date(saved.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 기준` : ''}</small>
        <button className="btn btn-sm" disabled={busy} onClick={run}>
          {busy ? '받는 중…' : '다시 받기'}
        </button>
      </div>
      {err && <p className="st-muted">{err}</p>}
      {busy && !p && <div className="co-skel" aria-hidden />}
      {p && (
        <>
          <div className="co-two">
            {p.good && (
              <section className="st-card co-note good">
                <small>잘한 점</small>
                <p>{p.good}</p>
              </section>
            )}
            {p.fix && (
              <section className="st-card co-note fix">
                <small>고칠 점</small>
                <p>{p.fix}</p>
              </section>
            )}
          </div>
          {p.focus.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">먼저 할 것</h3>
              <ol className="co-focus">
                {p.focus.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
            </section>
          )}
          {plan.length > 0 && (
            <section className="st-card">
              <div className="st-inline between">
                <h3 className="st-h">
                  {shortDate(planWeek)} ~ {shortDate(addDays(planWeek, 6))} 계획
                </h3>
                <div className="st-inline">
                  {inserted && (
                    <button className="st-link" onClick={() => go('/plan')}>
                      주간 계획 보기
                    </button>
                  )}
                  <button className="btn btn-sm btn-primary" onClick={toWeekPlan}>
                    {inserted ? '다시 넣기' : '주간 계획에 넣기'}
                  </button>
                </div>
              </div>
              <div className="co-plan">
                {plan.map((day) => {
                  const b = (planWeek === week ? busyWeek : busyDays(d, planWeek)).find((x) => WEEKDAYS[weekday(x.date)] === day.day);
                  return (
                  <div key={day.day} className="co-day">
                    <b className={day.day === '토' || day.day === '일' ? 'we' : ''}>{day.day}</b>
                    <div className="co-items">
                      {b && b.labels.length > 0 && (
                        <small className="co-busy">
                          📅 {b.labels.join(' · ')}
                          {day.cut ? ` → ${h(day.cut)} 줄였어요` : ''}
                        </small>
                      )}
                      {day.items.length ? (
                        day.items.map((x, i) => (
                          <span key={i} className="co-item">
                            <span className="co-sub">{x.subject}</span>
                            <span className="co-what">{x.what}</span>
                            {x.minutes > 0 && <small className="st-muted">{h(x.minutes)}</small>}
                          </span>
                        ))
                      ) : (
                        <small className="st-muted">쉬는 날</small>
                      )}
                    </div>
                    <small className="co-total">{total(day.items) ? h(total(day.items)) : ''}</small>
                  </div>
                  );
                })}
              </div>
            </section>
          )}
          {p.tip && <p className="co-tip">💡 {p.tip}</p>}
        </>
      )}
    </>
  );
}
