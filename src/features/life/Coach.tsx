// AI 코치: 열면 저절로 지난 7일 기록을 보내 다음 주 계획을 받는다 (주마다 한 번, 이 기기에 기억)
import { useEffect, useRef, useState } from 'react';
import { coachPlan, isLoggedIn, type CoachPlan } from '../auth/api';
import { coachRecord } from '../study/coach';
import { weekStart } from '../study/dates';
import { useStudy } from '../study/store';
import { useToday } from '../study/ui';

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
  const week = weekStart(today);
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
          {p.plan.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">다음 주 계획</h3>
              <div className="co-plan">
                {p.plan.map((day) => (
                  <div key={day.day} className="co-day">
                    <b className={day.day === '토' || day.day === '일' ? 'we' : ''}>{day.day}</b>
                    <div className="co-items">
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
                ))}
              </div>
            </section>
          )}
          {p.tip && <p className="co-tip">💡 {p.tip}</p>}
        </>
      )}
    </>
  );
}
