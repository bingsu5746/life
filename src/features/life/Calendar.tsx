// 한 달 달력: 날마다 시험 · 수행 · 예습 · 할 일 · 개봉 · 결제 · 학교 일정 · 공휴일 · 기념일
import { useEffect, useState } from 'react';
import { isLoggedIn, specialDays, type SpecialDay } from '../auth/api';
import { addDays, longDate, weekday, WEEKDAYS } from '../study/dates';
import { useSchoolData } from '../study/SchoolPanel';
import { useStudy } from '../study/store';
import { go, useToday } from '../study/ui';
import { daysInMonth, monthLabel, shiftMonth } from './calc';
import { CAL_KIND, monthItems } from './calendar';
import { EventSheet } from './EventSheet';
import { colorOf, eventsBetween, repeatText, timeText } from './events';
import type { CalEvent } from '../study/model';

export function CalendarPage() {
  const d = useStudy();
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [pick, setPick] = useState(today);
  const from = `${month}-01`;
  const n = daysInMonth(month);
  const school = useSchoolData(from, `${month}-${String(n).padStart(2, '0')}`, ['events'])?.events ?? [];
  const special = useSpecialDays(Number(month.slice(0, 4)));
  const items = monthItems(d, month, school, special);
  const isHoliday = (date: string) => special.some((x) => x.holiday && x.date === date);
  const lead = weekday(from);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addDays(from, i))];
  const sel = items.get(pick) ?? [];
  const evs = eventsBetween(d, from, `${month}-${String(n).padStart(2, '0')}`);
  const selEv = evs.get(pick) ?? [];
  const [edit, setEdit] = useState<{ ev?: CalEvent; on?: string } | null>(null);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{monthLabel(month)}</h2>
        <div className="st-inline">
          <button className="btn btn-sm" aria-label="지난달" onClick={() => setMonth(shiftMonth(month, -1))}>
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
          <button className="btn btn-sm" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>
            ›
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setEdit({})}>
            + 일정
          </button>
        </div>
      </div>
      <div className="cal">
        {WEEKDAYS.map((w) => (
          <small key={w} className="cal-w">
            {w}
          </small>
        ))}
        {cells.map((date, i) =>
          date ? (
            <button key={date} className={`cal-d ${date === today ? 'today' : ''} ${date === pick ? 'on' : ''} ${weekday(date) === 0 || isHoliday(date) ? 'sun' : ''}`} onClick={() => setPick(date)}>
              <b>{Number(date.slice(8))}</b>
              {(evs.get(date) ?? []).slice(0, 2).map(({ e, first }) => (
                <span key={e.id} className={`cal-ev ${first ? '' : 'cont'}`} style={{ background: colorOf(e) }}>
                  {e.title}
                </span>
              ))}
              {(evs.get(date)?.length ?? 0) > 2 && <small className="cal-more">+{(evs.get(date)?.length ?? 0) - 2}</small>}
              <span className="cal-dots">
                {[...new Set((items.get(date) ?? []).map((x) => x.kind))].slice(0, 4).map((k) => (
                  <i key={k} className={`cal-k ${k}`} />
                ))}
              </span>
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
      <section className="st-card">
        <h3 className="st-h">{longDate(pick)}</h3>
        {selEv.map(({ e, on }) => (
          <button key={e.id} className="cal-item" onClick={() => setEdit({ ev: e, on })}>
            <i className="cal-bar" style={{ background: colorOf(e) }} />
            <span className="cal-evt">
              <b>{e.title}</b>
              <small className="st-muted">
                {[timeText(e), e.endDate && e.endDate > e.date ? `~${Number(e.endDate.slice(5, 7))}/${Number(e.endDate.slice(8))}` : '', repeatText(e), e.place].filter(Boolean).join(' · ')}
                {e.remind !== undefined ? ' · 🔔' : ''}
              </small>
              {e.memo && <small className="cal-memo">{e.memo}</small>}
            </span>
          </button>
        ))}
        {!sel.length && !selEv.length ? (
          <p className="st-muted">일정이 없어요.</p>
        ) : (
          sel.map((x, i) => (
            <button key={i} className="cal-item" disabled={!x.to} onClick={() => x.to && go(x.to)}>
              <span className={`cal-tag ${x.kind}`}>{CAL_KIND[x.kind]}</span>
              <span>{x.label}</span>
            </button>
          ))
        )}
      </section>
      {edit && <EventSheet date={pick} ev={edit.ev} on={edit.on} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** 그해 공휴일 · 기념일 (로그인했을 때만, 이 기기에 하루 기억) */
export function useSpecialDays(year: number): SpecialDay[] {
  const ck = `my-study.special.${year}`;
  const read = (): { at: number; days: SpecialDay[] } | null => {
    try {
      return JSON.parse(localStorage.getItem(ck) ?? 'null');
    } catch {
      return null;
    }
  };
  const [days, setDays] = useState<SpecialDay[]>(() => read()?.days ?? []);
  useEffect(() => {
    const c = read();
    setDays(c?.days ?? []);
    if (!isLoggedIn() || (c && Date.now() - c.at < 86_400_000)) return;
    let live = true;
    specialDays(year)
      .then((r) => {
        if (!live) return;
        setDays(r.days);
        try {
          localStorage.setItem(ck, JSON.stringify({ at: Date.now(), days: r.days }));
        } catch {
          /* 무시 */
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  return days;
}
