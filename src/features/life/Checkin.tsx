// 하루 마감 체크인: 기분 · 공부 어땠는지 · 운동 → 일기(기분·하루 마감 칸)와 운동·습관에 같이 남는다
import { useState } from 'react';
import { habitOn, toggleHabit } from '../study/habits';
import { alive, newId, type DiaryEntry, type Workout } from '../study/model';
import { enableNotify, localTimes } from '../study/notify';
import { put, setSettings, useStudy } from '../study/store';
import { go, toast, useToday } from '../study/ui';
import { daySummary } from './diaryForm';

const MOOD = ['', '나쁨', '별로', '보통', '좋음', '최고'];
const FEEL = ['아쉬워요', '보통', '뿌듯해요'];
const KINDS = ['안 했어요', '걷기', '달리기', '헬스', '홈트', '농구', '그 밖'];

export function CheckinPage() {
  const d = useStudy();
  const today = useToday();
  const cur = d.diary[today] && !d.diary[today].deleted ? d.diary[today] : undefined;
  const [mood, setMood] = useState(cur?.mood ?? 0);
  const [feel, setFeel] = useState('');
  const [kind, setKind] = useState('');
  const [min, setMin] = useState('30');
  const [line, setLine] = useState('');
  const lines = daySummary(d, today);
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
      <CheckinTime />
    </div>
  );
}

/** 매일 정해진 시각에 체크인 알림 */
function CheckinTime() {
  const d = useStudy();
  const cur = d.settings.checkinTime;
  const [t, setT] = useState(cur ?? '22:00');
  const [msg, setMsg] = useState('');
  async function apply(next: string | undefined) {
    setSettings({ checkinTime: next });
    const times = localTimes();
    if (!times) {
      setMsg(next ? '이 기기에서 알림이 꺼져 있어요. 설정 → 알림에서 먼저 켜 주세요.' : '');
      return;
    }
    const others = times.filter((x) => x !== cur);
    const want = next ? [...new Set([...others, next])].sort() : others;
    if (want.length > 3) {
      setMsg('알림 시각은 3개까지예요. 설정 → 알림에서 하나를 지운 뒤 다시 해 주세요.');
      setSettings({ checkinTime: cur });
      return;
    }
    try {
      await enableNotify(want);
      setMsg(next ? `매일 ${next}에 알려 드려요` : '체크인 알림을 껐어요');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '알림을 바꾸지 못했어요');
    }
  }
  return (
    <details className="ck-time">
      <summary>{cur ? `매일 ${cur}에 알림` : '매일 정해진 시각에 알림 받기'}</summary>
      <div className="st-inline">
        <input className="st-input sm" type="time" value={t} onChange={(e) => setT(e.target.value)} aria-label="체크인 알림 시각" />
        <button className="btn btn-sm btn-primary" onClick={() => void apply(t)}>
          저장
        </button>
        {cur && (
          <button className="st-link" onClick={() => void apply(undefined)}>
            끄기
          </button>
        )}
      </div>
      {msg && <p className="st-hint">{msg}</p>}
    </details>
  );
}
