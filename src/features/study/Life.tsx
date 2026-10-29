// 할 일 · 습관 (4단계)
import { useState } from 'react';
import { addDays, shortDate, WEEKDAYS } from './dates';
import { bestStreak, habitOn, streak, toggleHabit } from './habits';
import { alive, newId, type Habit, type Todo } from './model';
import { resplit } from './splitHomework';
import { getStudy, put, remove, useStudy } from './store';
import { Check, confirmDelete, Empty, Field, Icon, Sheet, toast, useToday, WeekdayPicker, tap } from './ui';

const ICONS = ['📖', '🏃', '💧', '😴', '🧘', '✍️', '🎧', '🥗', '🧹', '💊', '📵', '🌅'];

/** sub: 'new-habit' 이면 습관 만들기 창 (「＋」에서 올 때) */
export function Life({ sub }: { sub?: string }) {
  const today = useToday();
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>할 일 · 습관</h2>
      </div>
      <div className="st-two">
        <Todos today={today} />
        <Habits today={today} adding={sub === 'new-habit'} />
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
        <input className="st-input" placeholder="할 일 추가 · Enter" value={title} onChange={(e) => setTitle(e.target.value)} />
        {/* 마감 고르기는 글을 쓰기 시작해야 나타난다 */}
        {title.trim() && (
          <select className="st-input xs" value={due} onChange={(e) => setDue(e.target.value)} aria-label="마감">
            <option value="">언제든</option>
            <option value={today}>오늘</option>
            <option value={addDays(today, 1)}>내일</option>
            <option value={addDays(today, 7)}>일주일 뒤</option>
          </select>
        )}
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
                  <div className="st-item-main" {...tap(() => setEdit(t))}>
                    <div className="st-item-title">{t.title}</div>
                    {t.due && <div className="st-item-sub">{t.due === today ? '오늘' : shortDate(t.due)}</div>}
                  </div>
                  <button className={`st-star ${t.star ? 'on' : 'quiet'}`} aria-pressed={!!t.star} aria-label="오늘 꼭 할 것" onClick={() => put('todos', { ...t, star: !t.star })}>
                    ★
                  </button>
                </div>
              ))}
            </div>
          ),
      )}
      {done.length > 0 && (
        <button className="st-fold" onClick={() => setShowDone(!showDone)}>
          한 일 {done.length} <span className={`st-fold-icon ${showDone ? 'open' : ''}`}><Icon name="chevron" /></span>
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
  const [star, setStar] = useState(!!t.star);
  const d = useStudy();
  const today = useToday();
  // 같은 숙제에서 나온 할 일들
  const mates = t.group ? alive(d.todos).filter((x) => x.group === t.group) : [];
  const left = mates.filter((x) => !x.done && x.split);
  const [more, setMore] = useState(false);
  const [end, setEnd] = useState(mates.map((x) => x.due ?? '').sort().pop() || addDays(today, 3));
  const [incl, setIncl] = useState(false);
  const base = t.split?.base ?? '';
  const unit = t.split?.unit ?? '쪽';
  function again() {
    const nums = left.flatMap((x) => Array.from({ length: x.split!.to - x.split!.from + 1 }, (_, k) => x.split!.from + k));
    const parts = resplit(nums, today, end, incl, getStudy().settings.offDates);
    if (!parts.length) return;
    left.forEach((x) => remove('todos', x.id));
    const now = Date.now();
    parts.forEach((p, i) => put('todos', { id: newId(), title: `${base} · ${p.from === p.to ? p.from : `${p.from}~${p.to}`}${unit}`, due: p.date, done: false, group: t.group, split: { base, unit, from: p.from, to: p.to }, created: now + i }));
    toast(`남은 ${nums.length}${unit}을 ${parts.length}일에 다시 나눴어요`);
    onClose();
  }
  return (
    <Sheet title="할 일 고치기" onClose={onClose}>
      <div className="st-form">
        <Field label="할 일">
          <input className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="마감 (선택)">
          <input className="st-input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <label className="st-toggle">
          <input type="checkbox" checked={star} onChange={(e) => setStar(e.target.checked)} /> 오늘 꼭 할 것 ★
        </label>
        {t.split && left.length > 0 && (
          <div className="st-sub-panel">
            {!more ? (
              <button className="st-link" onClick={() => setMore(true)}>
                「{base}」 남은 {left.length}번을 다시 나누기
              </button>
            ) : (
              <>
                <label className="st-cond-time">
                  새 마감
                  <input className="st-input sm" type="date" value={end} min={today} onChange={(e) => setEnd(e.target.value)} />
                </label>
                <label className="st-toggle">
                  <input type="checkbox" checked={incl} onChange={(e) => setIncl(e.target.checked)} /> 마감 날에도 넣기
                </label>
                <div className="st-row end">
                  <button className="btn btn-sm st-danger" onClick={() => (mates.forEach((x) => remove('todos', x.id)), onClose())}>
                    이 숙제 전부 지우기
                  </button>
                  <button className="btn btn-sm btn-primary" disabled={end < today} onClick={again}>
                    다시 나누기
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="st-row end">
          <button className="btn btn-sm st-danger" onClick={() => (remove('todos', t.id), onClose())}>
            지우기
          </button>
          <button className="btn btn-primary" onClick={() => (put('todos', { ...t, title: title.trim() || t.title, due: due || undefined, star: star || undefined }), onClose())}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function Habits({ today, adding }: { today: string; adding?: boolean }) {
  const d = useStudy();
  const [edit, setEdit] = useState<Habit | 'new' | null>(adding ? 'new' : null);
  const habits = alive(d.habits).filter((h) => !h.archived);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">습관</h3>
        <button className="st-iconbtn" aria-label="습관 만들기" onClick={() => setEdit('new')}>
          <Icon name="plus" />
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
                    onClick={() => put('habits', toggleHabit(h, x))}
                  >
                    {on ? '✓' : ''}
                  </button>
                );
              })}
              <span className="st-streak" title={`최고 ${bestStreak(h, today)}일`}>
                {streak(h, today)}일
              </span>
            </div>
          ))}
        </div>
      )}
      {edit && (
        <HabitSheet
          h={edit === 'new' ? undefined : edit}
          today={today}
          onClose={() => {
            setEdit(null);
            if (adding) window.location.hash = '/life';
          }}
        />
      )}
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
