// 메인 아침 루틴: 일어난 시각 · 아침 습관 체크 · 오늘 꼭 할 것 3개. 다 하면(또는 오후 2시가 지나면) 숨는다
import { useState } from 'react';
import { habitOn, toggleHabit } from '../study/habits';
import { alive, newId, type DayCondition, type Habit, type Todo } from '../study/model';
import { put, setSettings, useStudy } from '../study/store';
import { Sheet, toast } from '../study/ui';

const pad = (n: number) => String(n).padStart(2, '0');
const nowHHMM = () => `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;

export function MorningCard({ today }: { today: string }) {
  const d = useStudy();
  const [todo, setTodo] = useState('');
  const [edit, setEdit] = useState(false);
  if (d.settings.morningOff) return null;
  const c = d.conditions[today]?.deleted ? undefined : d.conditions[today];
  const habits = alive(d.habits).filter((h) => h.morning && !h.archived && habitOn(h, today));
  const stars = alive(d.todos).filter((t) => t.star && (t.due ?? today) === today && (!t.done || (t.doneAt ?? 0) > Date.now() - 18 * 3600_000));
  const allDone = !!c?.wake && habits.every((h) => h.checks.includes(today)) && stars.length >= 3;
  if (allDone || new Date().getHours() >= 14) return null;
  const addTodo = () => {
    if (!todo.trim()) return;
    put('todos', { id: newId(), title: todo.trim().slice(0, 100), due: today, done: false, star: true, created: Date.now() } as Todo);
    setTodo('');
  };
  return (
    <section className="mo">
      <div className="st-inline between">
        <small className="aw-label">아침</small>
        <button className="st-link" onClick={() => setEdit(true)}>
          고치기
        </button>
      </div>
      {!c?.wake ? (
        <button className="mo-row" onClick={() => (put('conditions', { ...(c ?? {}), id: today, wake: nowHHMM() } as DayCondition), toast(`${nowHHMM()}에 일어났어요`))}>
          <span className="mo-box" /> 일어났어요
        </button>
      ) : (
        <div className="mo-row done">
          <span className="mo-box on">✓</span> {c.wake} 기상
        </div>
      )}
      {habits.map((h) => (
        <button key={h.id} className={`mo-row ${h.checks.includes(today) ? 'done' : ''}`} onClick={() => put('habits', toggleHabit(h, today))}>
          <span className={`mo-box ${h.checks.includes(today) ? 'on' : ''}`}>{h.checks.includes(today) ? '✓' : ''}</span> {h.icon} {h.name}
        </button>
      ))}
      <div className="mo-todos">
        <small className="st-muted">오늘 꼭 할 것 {Math.min(stars.length, 3)}/3</small>
        {stars.map((t) => (
          <div key={t.id} className={`mo-todo ${t.done ? 'done' : ''}`}>
            ⭐ {t.title}
          </div>
        ))}
        {stars.length < 3 && (
          <div className="st-inline">
            <input className="st-input" value={todo} onChange={(e) => setTodo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTodo()} placeholder="오늘 꼭 할 것" aria-label="오늘 꼭 할 것" />
            <button className="btn btn-sm" disabled={!todo.trim()} onClick={addTodo}>
              넣기
            </button>
          </div>
        )}
      </div>
      {edit && <MorningSheet today={today} onClose={() => setEdit(false)} />}
    </section>
  );
}

/** 아침 루틴에 넣을 습관 고르기 · 새로 만들기 · 끄기 */
function MorningSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const d = useStudy();
  const [name, setName] = useState('');
  const habits = alive(d.habits).filter((h) => !h.archived);
  return (
    <Sheet title="아침 루틴" onClose={onClose}>
      <div className="st-form">
        {habits.map((h) => (
          <label key={h.id} className="st-inline">
            <input type="checkbox" checked={!!h.morning} onChange={(e) => put('habits', { ...h, morning: e.target.checked || undefined } as Habit)} /> {h.icon} {h.name}
          </label>
        ))}
        <div className="st-inline">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="새 아침 습관 (예: 아침 먹기)" aria-label="새 아침 습관" />
          <button
            className="btn btn-sm"
            disabled={!name.trim()}
            onClick={() => {
              put('habits', { id: newId(), name: name.trim().slice(0, 30), icon: '☀️', weekdays: [], checks: [], created: today, morning: true } as unknown as Habit);
              setName('');
            }}
          >
            넣기
          </button>
        </div>
        <button
          className="st-link"
          onClick={() => {
            setSettings({ morningOff: true });
            toast('아침 루틴을 껐어요. 설정 → 생활에서 다시 켤 수 있어요');
            onClose();
          }}
        >
          메인에서 아침 루틴 끄기
        </button>
      </div>
    </Sheet>
  );
}
