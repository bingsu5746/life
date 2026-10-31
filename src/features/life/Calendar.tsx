// 한 달 달력: 날마다 시험 · 수행 · 예습 · 할 일 · 개봉 · 결제 · 학교 일정 · 공휴일 · 기념일
import { useEffect, useState } from 'react';
import { isLoggedIn, specialDays, type SpecialDay } from '../auth/api';
import { addDays, longDate, weekday, WEEKDAYS } from '../study/dates';
import { useSchoolData } from '../study/SchoolPanel';
import { useStudy } from '../study/store';
import { go, useToday } from '../study/ui';
import { daysInMonth, monthLabel, shiftMonth } from './calc';
import { CAL_KIND, monthItems } from './calendar';

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
        {!sel.length ? (
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
