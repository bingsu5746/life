// 한 달 달력: 날마다 시험 · 수행 · 예습 · 할 일 · 개봉 · 결제 · 학교 일정 · 공휴일 · 기념일
import { useState } from 'react';
import { addDays, longDate, shortDate, weekday, WEEKDAYS } from '../study/dates';
import { useSchoolData } from '../study/SchoolPanel';
import { put, remove, useStudy } from '../study/store';
import { go, toast, useToday } from '../study/ui';
import { daysInMonth, monthLabel, shiftMonth } from './calc';
import { CAL_KIND, monthItems } from './calendar';
import { useSpecialDays } from './specialDays';
export { useSpecialDays };
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
          sel.map((x, i) =>
            x.tutorId ? (
              <div key={i} className={`cal-item cal-tutor ${x.cancelled ? 'off' : ''}`}>
                <span className={`cal-tag ${x.kind}`}>{CAL_KIND[x.kind]}</span>
                <span>{x.label}</span>
                <button className="st-link" onClick={() => toggleClass(x.tutorId!, pick, !x.cancelled)}>
                  {x.cancelled ? '되돌리기' : '이날 수업 없음'}
                </button>
              </div>
            ) : (
              <button key={i} className="cal-item" disabled={!x.to} onClick={() => x.to && go(x.to)}>
                <span className={`cal-tag ${x.kind}`}>{CAL_KIND[x.kind]}</span>
                <span>{x.label}</span>
              </button>
            ),
          )
        )}
      </section>
      {edit && <EventSheet date={pick} ev={edit.ev} on={edit.on} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** 그해 공휴일 · 기념일 (로그인했을 때만, 이 기기에 하루 기억) */
