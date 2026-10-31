// 하루 마감 체크인: 기분 · 공부 어땠는지 · 운동 → 일기(기분·하루 마감 칸)와 운동·습관에 같이 남는다
import { useState } from 'react';
import { habitOn, toggleHabit } from '../study/habits';
import { alive, newId, type DiaryEntry, type Workout } from '../study/model';
import { put, useStudy } from '../study/store';
import { go, toast, useToday } from '../study/ui';
import { daySummary, studySummary } from './diaryForm';
import { NotifyTime } from './NotifyTime';

const MOOD = ['', '나쁨', '별로', '보통', '좋음', '최고'];
const FEEL = ['아쉬워요', '보통', '뿌듯해요'];
const KINDS = ['안 했어요', '걷기', '달리기', '헬스', '홈트', '농구', '기타'];

export function CheckinPage() {
  const d = useStudy();
  const today = useToday();
  const cur = d.diary[today] && !d.diary[today].deleted ? d.diary[today] : undefined;
  const [mood, setMood] = useState(cur?.mood ?? 0);
  const [feel, setFeel] = useState('');
  const [kind, setKind] = useState('');
  const [min, setMin] = useState('30');
  const [line, setLine] = useState('');
  const lines = [...studySummary(d, today).map((x, i) => (i === 0 ? `공부 ${x.replace(/^모두 /, '')}` : x)), ...daySummary(d, today)];
  const workedOut = alive(d.workouts).some((w) => w.date === today);
  const habits = alive(d.habits).filter((h) => !h.archived && habitOn(h, today));
  function save() {
    const parts = { ...(cur?.parts ?? {}) };
    const bits = [feel && `공부 ${feel}`, kind && kind !== '안 했어요' && `운동 ${kind} ${min}분`, kind === '안 했어요' && '운동 안 함', line.trim()].filter(Boolean);
    if (bits.length) parts.checkin = bits.join(' · ');
    if (!parts.done?.trim() && lines.length) parts.done = lines.join('\n');
    put('diary', { ...(cur ?? { id: today, text: '' }), id: today, mood: mood || cur?.mood, parts } as DiaryEntry);
    if (kind && kind !== '안 했어요' && Number(min) > 0) put('workouts', { id: newId(), date: today, kind, minutes: Math.min(600, Number(min)), created: Date.now() } as Workout);
    toast('오늘을 마감했어요');
    go(`/diary/${today}`);
  }
  return (
    <div className="st-page narrow ck">
      <div className="st-page-head">
        <h2>오늘 어땠어요?</h2>
      </div>
      <section className="st-card ck-q">
        <small className="aw-label">기분</small>
        <div className="ck-opts">
          {[1, 2, 3, 4, 5].map((m) => (
            <button key={m} className={mood === m ? 'on' : ''} aria-pressed={mood === m} onClick={() => setMood(m)}>
              <i className={`dy-mood m${m}`} aria-hidden /> {MOOD[m]}
            </button>
          ))}
        </div>
      </section>
      <section className="st-card ck-q">
        <small className="aw-label">오늘 공부</small>
        {lines.length > 0 && <p className="st-hint">오늘 기록: {lines.join(' · ')}</p>}
        <div className="ck-opts">
          {FEEL.map((f) => (
            <button key={f} className={feel === f ? 'on' : ''} aria-pressed={feel === f} onClick={() => setFeel(feel === f ? '' : f)}>
              {f}
            </button>
          ))}
        </div>
      </section>
      {!workedOut && (
        <section className="st-card ck-q">
          <small className="aw-label">운동</small>
          <div className="ck-opts wrap">
            {KINDS.map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>
                {k}
              </button>
            ))}
          </div>
          {kind && kind !== '안 했어요' && (
            <label className="st-cond-time">
              <input className="st-input xs" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="운동 시간 (분)" />분
            </label>
          )}
        </section>
      )}
      {habits.length > 0 && (
        <section className="st-card ck-q">
          <small className="aw-label">오늘 습관</small>
          <div className="ck-opts wrap">
            {habits.map((h) => {
              const on = h.checks.includes(today);
              return (
                <button key={h.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => put('habits', toggleHabit(h, today))}>
                  {h.icon} {h.name}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <input className="st-input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="한 줄 남기기 (선택)" aria-label="한 줄" />
      <button className="btn btn-primary btn-lg" disabled={!mood && !feel && !kind && !line.trim()} onClick={save}>
        하루 마감
      </button>
      <NotifyTime k="checkinTime" label="하루 마감 알림" fallback="22:00" />
    </div>
  );
}
