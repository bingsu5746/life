// 오늘 화면: 어젯밤 잠 · 오늘 컨디션 (하루 한 번 눌러서)
import { useState } from 'react';
import { sleepMinutes } from './condition';
import type { DayCondition } from './model';
import { put, useStudy } from './store';
import { minutesText } from './timer';

const MOOD = ['', '나쁨', '별로', '보통', '좋음', '최고'];

export function ConditionCard({ today }: { today: string }) {
  const d = useStudy();
  const c = d.conditions[today]?.deleted ? undefined : d.conditions[today];
  const [open, setOpen] = useState(false);
  const save = (patch: Partial<DayCondition>) => put('conditions', { ...(c ?? {}), ...patch, id: today } as DayCondition);
  const slept = sleepMinutes(c);
  const filled = !!(c?.mood && c.sleep && c.wake);
  if (filled && !open)
    return (
      <button className="st-cond-done" onClick={() => setOpen(true)}>
        잠 {slept !== null ? minutesText(slept) : '—'} · 컨디션 {MOOD[c!.mood!]}
      </button>
    );
  return (
    <section className="st-card st-cond">
      <h3 className="st-h">어젯밤 잠 · 오늘 컨디션</h3>
      <div className="st-inline wrap">
        <label className="st-cond-time">
          잠든 시각
          <input className="st-input sm" type="time" value={c?.sleep ?? ''} onChange={(e) => save({ sleep: e.target.value || undefined })} />
        </label>
        <label className="st-cond-time">
          일어난 시각
          <input className="st-input sm" type="time" value={c?.wake ?? ''} onChange={(e) => save({ wake: e.target.value || undefined })} />
        </label>
        {slept !== null && <span className="st-muted">{minutesText(slept)} 잤어요</span>}
      </div>
      <div className="st-seg" role="radiogroup" aria-label="오늘 컨디션">
        {[1, 2, 3, 4, 5].map((m) => (
          <button key={m} role="radio" aria-checked={c?.mood === m} className={c?.mood === m ? 'on' : ''} onClick={() => (save({ mood: m }), c?.sleep && c?.wake && setOpen(false))}>
            {MOOD[m]}
          </button>
        ))}
      </div>
    </section>
  );
}

/** 메인 맨 위: 잔 시각 · 일어난 시각 · 아침 컨디션을 다 채울 때까지 크게 (다 채우면 사라진다) */
export function ConditionPrompt({ today }: { today: string }) {
  const d = useStudy();
  const c = d.conditions[today]?.deleted ? undefined : d.conditions[today];
  if (c?.sleep && c.wake && c.mood) return null;
  const save = (patch: Partial<DayCondition>) => put('conditions', { ...(c ?? {}), ...patch, id: today } as DayCondition);
  const slept = sleepMinutes(c);
  return (
    <section className="cp">
      <h3 className="cp-title">어젯밤 잠 · 오늘 아침 컨디션</h3>
      <div className="cp-times">
        <label className={`cp-time ${c?.sleep ? 'on' : ''}`}>
          <span>잔 시각</span>
          <input type="time" value={c?.sleep ?? ''} onChange={(e) => save({ sleep: e.target.value || undefined })} aria-label="잔 시각" />
        </label>
        <div className={`cp-time ${c?.wake ? 'on' : ''}`}>
          <span className="cp-time-head">
            <span>일어난 시각</span>
            {!c?.wake && (
              <button type="button" className="st-link" onClick={() => save({ wake: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}` })}>
                지금
              </button>
            )}
          </span>
          <input type="time" value={c?.wake ?? ''} onChange={(e) => save({ wake: e.target.value || undefined })} aria-label="일어난 시각" />
        </div>
      </div>
      {slept !== null && <p className="cp-slept">{minutesText(slept)} 잤어요</p>}
      <div className="cp-moods" role="radiogroup" aria-label="아침 컨디션">
        {[1, 2, 3, 4, 5].map((m) => (
          <button key={m} role="radio" aria-checked={c?.mood === m} className={c?.mood === m ? 'on' : ''} onClick={() => save({ mood: m })}>
            <i className={`dy-mood m${m}`} aria-hidden />
            {MOOD[m]}
          </button>
        ))}
      </div>
    </section>
  );
}
