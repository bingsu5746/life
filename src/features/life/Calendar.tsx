// 달력: 달 · 주 · 일정 목록. 날마다 내 일정 + 시험 · 수행 · 예습 · 할 일 · 개봉 · 결제 · 학교 일정 · 공휴일 · 기념일 · 24절기
// 일요일 · 공휴일은 빨강, 토요일은 파랑
import { useRef, useState } from 'react';
import { addDays, daysBetween, diffDays, longDate, shortDate, weekday, WEEKDAYS } from '../study/dates';
import { useSchoolData } from '../study/SchoolPanel';
import { put, remove, useStudy } from '../study/store';
import { go, toast, useToday } from '../study/ui';
import { daysInMonth, monthLabel, shiftMonth } from './calc';
import { CAL_KIND, monthItems, type CalItem } from './calendar';
import { useSpecialDays } from './specialDays';
export { useSpecialDays };
import { EventSheet } from './EventSheet';
import { colorOf, eventsBetween, repeatText, timeText } from './events';
import { parseQuick } from './quickEvent';
import type { CalEvent, DateStr } from '../study/model';
import type { SpecialDay } from '../auth/api';

type Edit = { ev?: CalEvent; on?: string; init?: Partial<CalEvent>; date?: string } | null;

/** 날짜 색: 일요일 · 공휴일 빨강, 토요일 파랑 */
const dayTone = (date: DateStr, special: SpecialDay[]) => (weekday(date) === 0 || special.some((x) => x.holiday && x.date === date) ? 'sun' : weekday(date) === 6 ? 'sat' : '');
const monthsOf = (from: DateStr, to: DateStr) => {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = shiftMonth(m, 1)) out.push(m);
  return out;
};

/** from~to 의 날마다: 공휴일 · 기념일 · 절기 + 내 일정 + 그 밖 것들 */
function useDays(from: DateStr, to: DateStr) {
  const d = useStudy();
  const school = useSchoolData(from, to, ['events'])?.events ?? [];
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const s1 = useSpecialDays(y1);
  const s2 = useSpecialDays(y2);
  const special = y1 === y2 ? s1 : [...s1, ...s2];
  const items = new Map<DateStr, CalItem[]>();
  for (const m of monthsOf(from, to))
    for (const [k, v] of monthItems(
      d,
      m,
      school,
      special.filter((x) => !x.term),
    ))
      if (k >= from && k <= to) items.set(k, v);
  const evs = eventsBetween(d, from, to);
  return { d, special, items, evs };
}

export function CalendarPage({ sub }: { sub?: string }) {
  const [edit, setEdit] = useState<Edit>(null);
  const today = useToday();
  const [pick, setPick] = useState(today);
  return (
    <>
      {sub === 'week' ? <WeekView pick={pick} setPick={setPick} setEdit={setEdit} /> : sub === 'list' ? <ListView setEdit={setEdit} /> : <MonthView pick={pick} setPick={setPick} setEdit={setEdit} />}
      {edit && <EventSheet date={edit.date ?? pick} ev={edit.ev} on={edit.on} init={edit.init} onClose={() => setEdit(null)} />}
    </>
  );
}

/** 한 줄로 일정 넣기: 읽은 값으로 일정 창을 연다 */
function QuickAdd({ setEdit, base }: { setEdit: (e: Edit) => void; base: DateStr }) {
  const today = useToday();
  const [text, setText] = useState('');
  const q = text.trim() ? parseQuick(text, today) : null;
  return (
    <form
      className="cal-quick"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return setEdit({ date: base });
        if (!q) return toast('무엇을 하는지 적어 주세요');
        setEdit({ date: q.date, init: { title: q.title, date: q.date, allDay: q.allDay, start: q.start, end: q.end } });
        setText('');
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="내일 오후 3시 치과" aria-label="한 줄로 일정 넣기" enterKeyHint="done" />
      {q && (
        <small className="cal-quick-hint">
          {shortDate(q.date)} · {q.allDay ? '하루 종일' : `${q.start}~${q.end}`} · {q.title}
        </small>
      )}
      <button className="btn btn-sm btn-primary" type="submit">
        + 일정
      </button>
    </form>
  );
}

function MonthView({ pick, setPick, setEdit }: { pick: DateStr; setPick: (d: DateStr) => void; setEdit: (e: Edit) => void }) {
  const today = useToday();
  const [month, setMonth] = useState(pick.slice(0, 7));
  const from = `${month}-01`;
  const n = daysInMonth(month);
  const to = `${month}-${String(n).padStart(2, '0')}`;
  const data = useDays(from, to);
  const { special, items, evs } = data;
  const lead = weekday(from);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addDays(from, i))];
  const move = (k: number) => {
    const m = shiftMonth(month, k);
    setMonth(m);
    setPick(m === today.slice(0, 7) ? today : `${m}-01`);
  };
  // 옆으로 밀어 달 넘기기
  const touch = useRef<{ x: number; y: number } | null>(null);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{monthLabel(month)}</h2>
        <div className="st-inline">
          <button className="btn btn-sm" aria-label="지난달" onClick={() => move(-1)}>
            ‹
          </button>
          {month !== today.slice(0, 7) && (
            <button
              className="btn btn-sm"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setPick(today);
              }}
            >
              오늘
            </button>
          )}
          <button className="btn btn-sm" aria-label="다음 달" onClick={() => move(1)}>
            ›
          </button>
        </div>
      </div>
      <QuickAdd setEdit={setEdit} base={pick} />
      <div
        className="cal"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
        }}
      >
        {WEEKDAYS.map((w, i) => (
          <small key={w} className={`cal-w ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
            {w}
          </small>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const hol = special.find((x) => x.date === date && x.holiday) ?? special.find((x) => x.date === date && x.term);
          const list = evs.get(date) ?? [];
          return (
            <button key={date} className={`cal-d ${dayTone(date, special)} ${date === today ? 'today' : ''} ${date === pick ? 'on' : ''} ${date < today ? 'past' : ''}`} onClick={() => (date === pick ? setEdit({ date }) : setPick(date))}>
              <b>{Number(date.slice(8))}</b>
              {hol && <small className={`cal-hol ${hol.holiday ? 'red' : ''}`}>{hol.name}</small>}
              {list.slice(0, 3).map(({ e, first }) => (
                <span key={e.id} className={`cal-ev ${first ? '' : 'cont'}`} style={{ background: colorOf(e) }}>
                  {e.title}
                </span>
              ))}
              {list.length > 3 && <small className="cal-more">+{list.length - 3}</small>}
              <span className="cal-dots">
                {[...new Set((items.get(date) ?? []).filter((x) => x.kind !== 'holiday').map((x) => x.kind))].slice(0, 4).map((k) => (
                  <i key={k} className={`cal-k ${k}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <DayPanel date={pick} data={data} setEdit={setEdit} />
    </div>
  );
}

/** 고른 날: 공휴일 · 절기, 내 일정, 그 밖 것들 */
function DayPanel({ date, data, setEdit }: { date: DateStr; data: ReturnType<typeof useDays>; setEdit: (e: Edit) => void }) {
  const today = useToday();
  const { d, special, items, evs } = data;
  const sel = items.get(date) ?? [];
  const selEv = evs.get(date) ?? [];
  const terms = special.filter((x) => x.date === date && x.term);
  const gap = diffDays(today, date);
  /** 과외 그날만 쉬기 (휴강) · 되돌리기. 쉬면 그날 저절로 들어간 공부 기록도 뺀다 */
  const toggleClass = (tutorId: string, day: string, off: boolean) => {
    const t = d.tutors[tutorId];
    if (!t) return;
    put('tutors', { ...t, cancelled: off ? [...new Set([...t.cancelled, day])] : t.cancelled.filter((x) => x !== day) });
    const sid = `tut-${t.id}-${day}`;
    if (off && d.sessions[sid] && !d.sessions[sid].deleted) remove('sessions', sid);
    toast(off ? `${shortDate(day)} ${t.name} 수업을 뺐어요` : '수업을 되돌렸어요');
  };
  return (
    <section className="st-card">
      <div className="cal-day-head">
        <h3 className={`st-h ${dayTone(date, special)}`}>{longDate(date)}</h3>
        <small className="st-muted">{gap === 0 ? '오늘' : gap > 0 ? `${gap}일 뒤` : `${-gap}일 전`}</small>
        <button className="st-link" onClick={() => setEdit({ date })}>
          + 이날 일정
        </button>
      </div>
      {selEv.map(({ e, on }) => (
        <EvRow key={e.id} e={e} onClick={() => setEdit({ ev: e, on })} />
      ))}
      {terms.map((x) => (
        <div key={x.name} className="cal-item">
          <span className="cal-tag anniv">절기</span>
          <span>{x.name}</span>
        </div>
      ))}
      {!sel.length && !selEv.length && !terms.length ? (
        <p className="st-muted">일정이 없어요.</p>
      ) : (
        sel.map((x, i) =>
          x.tutorId ? (
            <div key={i} className={`cal-item cal-tutor ${x.cancelled ? 'off' : ''}`}>
              <span className={`cal-tag ${x.kind}`}>{CAL_KIND[x.kind]}</span>
              <span>{x.label}</span>
              <button className="st-link" onClick={() => toggleClass(x.tutorId!, date, !x.cancelled)}>
                {x.cancelled ? '되돌리기' : '이날 수업 없음'}
              </button>
            </div>
          ) : (
            <ItemRow key={i} x={x} />
          ),
        )
      )}
    </section>
  );
}

function EvRow({ e, onClick }: { e: CalEvent; onClick: () => void }) {
  return (
    <button className="cal-item" onClick={onClick}>
      <i className="cal-bar" style={{ background: colorOf(e) }} />
      <span className="cal-evt">
        <b>{e.title}</b>
        <small className="st-muted">
          {[timeText(e), e.endDate && e.endDate > e.date ? `~${Number(e.endDate.slice(5, 7))}/${Number(e.endDate.slice(8))}` : '', repeatText(e), e.place].filter(Boolean).join(' · ')}
          {e.remind !== undefined ? ' · 알림' : ''}
        </small>
        {e.memo && <small className="cal-memo">{e.memo}</small>}
      </span>
    </button>
  );
}
function ItemRow({ x }: { x: CalItem }) {
  return (
    <button className="cal-item" disabled={!x.to} onClick={() => x.to && go(x.to)}>
      <span className={`cal-tag ${x.kind}`}>{CAL_KIND[x.kind]}</span>
      <span>{x.label}</span>
    </button>
  );
}

/** 주: 일요일부터 7일, 날마다 한 칸 */
function WeekView({ pick, setPick, setEdit }: { pick: DateStr; setPick: (d: DateStr) => void; setEdit: (e: Edit) => void }) {
  const today = useToday();
  const sun = addDays(pick, -weekday(pick));
  const sat = addDays(sun, 6);
  const { special, items, evs } = useDays(sun, sat);
  const thisWeek = sun === addDays(today, -weekday(today));
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>
          {Number(sun.slice(5, 7))}월 {Number(sun.slice(8))}일 ~ {sun.slice(5, 7) === sat.slice(5, 7) ? '' : `${Number(sat.slice(5, 7))}월 `}
          {Number(sat.slice(8))}일
        </h2>
        <div className="st-inline">
          <button className="btn btn-sm" aria-label="지난주" onClick={() => setPick(addDays(pick, -7))}>
            ‹
          </button>
          {!thisWeek && (
            <button className="btn btn-sm" onClick={() => setPick(today)}>
              오늘
            </button>
          )}
          <button className="btn btn-sm" aria-label="다음 주" onClick={() => setPick(addDays(pick, 7))}>
            ›
          </button>
        </div>
      </div>
      <QuickAdd setEdit={setEdit} base={pick} />
      <div className="cal-week">
        {daysBetween(sun, sat).map((date) => {
          const hol = special.filter((x) => x.date === date && (x.holiday || x.term));
          const list = evs.get(date) ?? [];
          const other = (items.get(date) ?? []).filter((x) => x.kind !== 'holiday');
          return (
            <section key={date} className={`cal-wday ${date === today ? 'today' : ''}`}>
              <button className={`cal-wday-head ${dayTone(date, special)}`} onClick={() => setEdit({ date })} aria-label={`${longDate(date)} 일정 넣기`}>
                <small>{WEEKDAYS[weekday(date)]}</small>
                <b>{Number(date.slice(8))}</b>
              </button>
              <div className="cal-wday-body">
                {hol.map((x) => (
                  <small key={x.name} className={`cal-hol ${x.holiday ? 'red' : ''}`}>
                    {x.name}
                  </small>
                ))}
                {list.map(({ e, on }) => (
                  <EvRow key={e.id} e={e} onClick={() => setEdit({ ev: e, on })} />
                ))}
                {other.map((x, i) => (
                  <ItemRow key={i} x={x} />
                ))}
                {!hol.length && !list.length && !other.length && <span className="cal-empty" />}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** 일정 목록: 오늘부터 90일, 찾기 */
function ListView({ setEdit }: { setEdit: (e: Edit) => void }) {
  const today = useToday();
  const [q, setQ] = useState('');
  const to = addDays(today, 89);
  const { special, items, evs } = useDays(today, to);
  const k = q.trim().toLowerCase();
  const hit = (t: string) => !k || t.toLowerCase().includes(k);
  const days = daysBetween(today, to)
    .map((date) => ({
      date,
      hol: special.filter((x) => x.date === date && x.holiday && hit(x.name)),
      list: (evs.get(date) ?? []).filter(({ e, first }) => first && hit(`${e.title} ${e.place ?? ''} ${e.memo ?? ''}`)),
      other: (items.get(date) ?? []).filter((x) => x.kind !== 'holiday' && x.kind !== 'anniv' && hit(x.label)),
    }))
    .filter((x) => x.hol.length || x.list.length || x.other.length);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>일정</h2>
      </div>
      <QuickAdd setEdit={setEdit} base={today} />
      <input className="cal-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="일정 찾기" aria-label="일정 찾기" type="search" />
      {!days.length && <p className="st-muted">{k ? '찾는 일정이 없어요.' : '앞으로 90일 동안 일정이 없어요.'}</p>}
      <div className="cal-agenda">
        {days.map(({ date, hol, list, other }) => {
          const gap = diffDays(today, date);
          return (
            <section key={date} className="cal-aday">
              <div className={`cal-aday-head ${dayTone(date, special)}`}>
                <b>{shortDate(date)}</b>
                <small>{gap === 0 ? '오늘' : gap === 1 ? '내일' : `D-${gap}`}</small>
              </div>
              {hol.map((x) => (
                <div key={x.name} className="cal-item">
                  <span className="cal-tag holiday">공휴일</span>
                  <span>{x.name}</span>
                </div>
              ))}
              {list.map(({ e, on }) => (
                <EvRow key={e.id} e={e} onClick={() => setEdit({ ev: e, on })} />
              ))}
              {other.map((x, i) => (
                <ItemRow key={i} x={x} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
