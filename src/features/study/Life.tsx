// 할 일 · 습관 (4단계)
import { useState } from 'react';
import { addDays, shortDate, WEEKDAYS } from './dates';
import { bestStreak, habitOn, streak } from './habits';
import { alive, newId, type Habit, type Todo } from './model';
import { put, remove, useStudy } from './store';
import { Check, confirmDelete, Empty, Field, Sheet, useToday, WeekdayPicker } from './ui';

const ICONS = ['📖', '🏃', '💧', '😴', '🧘', '✍️', '🎧', '🥗', '🧹', '💊', '📵', '🌅'];

export function Life() {
  const today = useToday();
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>할 일 · 습관</h2>
      </div>
      <div className="st-two">
        <Todos today={today} />
        <Habits today={today} />
      </div>
    </div>
  );
}

function Todos({ today }: { today: string }) {
  const d = useStudy();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [edit, setEdit] = useState<Todo | null>(null);
  const all = alive(d.todos);
  const open = all.filter((t) => !t.done).sort((a, b) => Number(!!b.star) - Number(!!a.star) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.created - b.created);
  const done = all.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const groups: [string, Todo[]][] = [
    ['마감 지남', open.filter((t) => t.due && t.due < today)],
    ['오늘', open.filter((t) => t.due === today || (t.star && (!t.due || t.due > today)))],
    ['다음', open.filter((t) => t.due && t.due > today && !t.star)],
    ['날짜 없음', open.filter((t) => !t.due && !t.star)],
  ];
  function add() {
    if (!title.trim()) return;
    put('todos', { id: newId(), title: title.trim(), due: due || undefined, done: false, created: Date.now() });
    setTitle('');
  }
  return (
    <section className="st-card">
      <h3 className="st-h">할 일</h3>
      <form
        className="st-inline"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="st-input" placeholder="할 일 (예: 수행평가 보고서)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="st-input xs" value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감">
          <option value="">언제든</option>
          <option value={today}>오늘</option>
          <option value={addDays(today, 1)}>내일</option>
          <option value={addDays(today, 7)}>일주일 뒤</option>
        </select>
        <button className="btn btn-primary">추가</button>
      </form>
      {!all.length && <Empty icon="📝" title="할 일이 없어요" />}
      {groups.map(
        ([label, ts]) =>
          ts.length > 0 && (
            <div key={label}>
              <h4 className={`st-group ${label === '마감 지남' ? 'bad' : ''}`}>{label}</h4>
              {ts.map((t) => (
                <div key={t.id} className="st-item">
                  <Check on={false} label="했어요" onClick={() => put('todos', { ...t, done: true, doneAt: Date.now() })} />
                  <div className="st-item-main" onClick={() => setEdit(t)} role="button" tabIndex={0}>
                    <div className="st-item-title">{t.title}</div>
                    {t.due && <div className="st-item-sub">{t.due === today ? '오늘' : shortDate(t.due)}</div>}
                  </div>
                  <button className={`st-star ${t.star ? 'on' : ''}`} aria-pressed={!!t.star} aria-label="오늘 꼭 할 것" onClick={() => put('todos', { ...t, star: !t.star })}>
                    ★
                  </button>
                </div>
              ))}
            </div>
          ),
      )}
      {done.length > 0 && (
        <button className="st-fold" onClick={() => setShowDone(!showDone)}>
          한 일 {done.length} {showDone ? '▲' : '▼'}
        </button>
      )}
      {showDone &&
        done.slice(0, 30).map((t) => (
          <div key={t.id} className="st-item">
            <Check on label="안 한 것으로" onClick={() => put('todos', { ...t, done: false, doneAt: undefined })} />
            <div className="st-item-main">
              <div className="st-item-title done">{t.title}</div>
            </div>
            <button className="st-x" aria-label="지우기" onClick={() => remove('todos', t.id)}>
              ✕
            </button>
          </div>
        ))}
      {edit && <TodoSheet t={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function TodoSheet({ t, onClose }: { t: Todo; onClose: () => void }) {
  const [title, setTitle] = useState(t.title);
  const [due, setDue] = useState(t.due ?? '');
  return (
    <Sheet title="할 일 고치기" onClose={onClose}>
      <div className="st-form">
        <Field label="할 일">
          <input className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="마감 (선택)">
          <input className="st-input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="st-row end">
          <button className="btn btn-sm st-danger" onClick={() => (remove('todos', t.id), onClose())}>
            지우기
          </button>
          <button className="btn btn-primary" onClick={() => (put('todos', { ...t, title: title.trim() || t.title, due: due || undefined }), onClose())}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function Habits({ today }: { today: string }) {
  const d = useStudy();
  const [edit, setEdit] = useState<Habit | 'new' | null>(null);
  const habits = alive(d.habits).filter((h) => !h.archived);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">습관</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
          ＋ 습관
        </button>
      </div>
      {!habits.length && (
        <Empty icon="🌱" title="매일(또는 정한 요일) 할 습관을 넣어 보세요">
          <p>연속 일수를 세어 드려요. 하지 않는 요일은 건너뛰어요.</p>
        </Empty>
      )}
      {habits.length > 0 && (
        <div className="st-habits">
          <div className="st-habit-row head">
            <span />
            {days.map((x) => (
              <small key={x} className={x === today ? 'today' : ''}>
                {WEEKDAYS[new Date(x + 'T00:00:00Z').getUTCDay()]}
              </small>
            ))}
            <span />
          </div>
          {habits.map((h) => (
            <div key={h.id} className="st-habit-row">
              <button className="st-habit-name" onClick={() => setEdit(h)}>
                <span>{h.icon}</span> {h.name}
              </button>
              {days.map((x) => {
                const on = h.checks.includes(x);
                const active = habitOn(h, x) && x >= h.created;
                return (
                  <button
                    key={x}
                    className={`st-hcell ${on ? 'on' : ''} ${active ? '' : 'off'} ${x === today ? 'today' : ''}`}
                    aria-pressed={on}
                    aria-label={`${h.name} ${shortDate(x)}`}
                    onClick={() => put('habits', { ...h, checks: on ? h.checks.filter((c) => c !== x) : [...h.checks, x].sort().slice(-400) })}
                  >
                    {on ? '✓' : ''}
                  </button>
                );
              })}
              <span className="st-streak" title={`최고 ${bestStreak(h, today)}일`}>
                🔥{streak(h, today)}
              </span>
            </div>
          ))}
        </div>
      )}
      {edit && <HabitSheet h={edit === 'new' ? undefined : edit} today={today} onClose={() => setEdit(null)} />}
    </section>
  );
}

function HabitSheet({ h, today, onClose }: { h?: Habit; today: string; onClose: () => void }) {
  const [name, setName] = useState(h?.name ?? '');
  const [icon, setIcon] = useState(h?.icon ?? ICONS[0]);
  const [weekdays, setWeekdays] = useState<number[]>(h?.weekdays ?? []);
  return (
    <Sheet title={h ? '습관 고치기' : '습관 만들기'} onClose={onClose}>
      <div className="st-form">
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 영어 듣기 20분" />
        </Field>
        <Field group label="아이콘">
          <div className="st-chips">
            {ICONS.map((i) => (
              <button key={i} type="button" className={`st-chip ${icon === i ? 'on' : ''}`} onClick={() => setIcon(i)}>
                {i}
              </button>
            ))}
          </div>
        </Field>
        <Field group label="하는 요일" hint="아무것도 안 고르면 매일">
          <WeekdayPicker value={weekdays} onChange={setWeekdays} label="하는 요일" />
        </Field>
        {h && <p className="st-hint">지금 {streak(h, today)}일 연속 · 최고 {bestStreak(h, today)}일 · 전체 {h.checks.length}번</p>}
        <div className="st-row end">
          {h && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`「${h.name}」`)) return;
                remove('habits', h.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              put('habits', { ...(h ?? { id: newId(), checks: [], created: today }), name: name.trim(), icon, weekdays });
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
