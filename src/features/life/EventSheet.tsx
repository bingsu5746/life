// 달력 일정 만들기 · 고치기: 색 · 하루 종일/시간 · 반복 · 알림 · 장소 · 메모
import { useState } from 'react';
import { addDays, weekday, WEEKDAYS } from '../study/dates';
import { newId, type CalEvent, type DateStr } from '../study/model';
import { put, remove } from '../study/store';
import { Field, Sheet, toast } from '../study/ui';
import { EVENT_COLORS, REMIND_OPTS } from './events';
import { localTimes } from '../study/notify';
import { isLoggedIn } from '../auth/api';

type Freq = '' | 'daily' | 'weekly' | 'monthly' | 'yearly';
const FREQS: [Freq, string][] = [
  ['', '안 함'],
  ['daily', '매일'],
  ['weekly', '매주'],
  ['monthly', '매달'],
  ['yearly', '매년'],
];
const UNIT: Record<Exclude<Freq, ''>, string> = {
  daily: '일',
  weekly: '주',
  monthly: '달',
  yearly: '년',
};

export function EventSheet({ date, ev, on, onClose }: { date: DateStr; ev?: CalEvent; on?: DateStr; onClose: () => void }) {
  const [title, setTitle] = useState(ev?.title ?? '');
  const [color, setColor] = useState(ev?.color ?? 'blue');
  const [start, setStart] = useState<DateStr>(ev?.date ?? date);
  const [endDate, setEndDate] = useState<DateStr>(ev?.endDate ?? ev?.date ?? date);
  const [allDay, setAllDay] = useState(ev?.allDay ?? true);
  const [t1, setT1] = useState(ev?.start ?? '09:00');
  const [t2, setT2] = useState(ev?.end ?? '10:00');
  const [freq, setFreq] = useState<Freq>(ev?.repeat?.freq ?? '');
  const [every, setEvery] = useState(ev?.repeat?.every ?? 1);
  const [days, setDays] = useState<number[]>(ev?.repeat?.weekdays ?? []);
  const [until, setUntil] = useState(ev?.repeat?.until ?? '');
  const [remind, setRemind] = useState<number | undefined>(ev ? ev.remind : 10);
  const [place, setPlace] = useState(ev?.place ?? '');
  const [memo, setMemo] = useState(ev?.memo ?? '');

  const save = () => {
    if (!title.trim()) return toast('제목을 적어 주세요');
    if (!allDay && t2 && t2 <= t1 && endDate === start) return toast('끝 시각이 시작보다 늦어야 해요');
    put('events', {
      id: ev?.id ?? newId(),
      title: title.trim().slice(0, 60),
      date: start,
      endDate: endDate > start ? endDate : undefined,
      allDay,
      start: allDay ? undefined : t1,
      end: allDay ? undefined : t2 || undefined,
      color,
      repeat: freq
        ? {
            freq,
            every: Math.max(1, Math.min(99, every || 1)),
            weekdays: freq === 'weekly' && days.length ? [...days].sort() : undefined,
            until: until && until >= start ? until : undefined,
          }
        : undefined,
      skip: freq ? ev?.skip : undefined,
      remind,
      place: place.trim() || undefined,
      memo: memo.trim() || undefined,
      created: ev?.created ?? Date.now(),
    });
    onClose();
  };
  const del = (only: boolean) => {
    if (!ev) return;
    if (only && on) put('events', { ...ev, skip: [...(ev.skip ?? []), on] });
    else if (window.confirm(`「${ev.title}」 일정을 지울까요?`)) remove('events', ev.id);
    else return;
    onClose();
  };

  return (
    <Sheet title={ev ? '일정 고치기' : '새 일정'} onClose={onClose}>
      <div className="ev-form">
        <input className="st-input ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" aria-label="제목" autoFocus />
        <div className="ev-colors" role="group" aria-label="색">
          {Object.entries(EVENT_COLORS).map(([k, v]) => (
            <button key={k} type="button" className={`ev-color ${color === k ? 'on' : ''}`} style={{ background: v.c }} aria-label={v.label} aria-pressed={color === k} onClick={() => setColor(k)} />
          ))}
        </div>
        <label className="ev-row">
          <span>하루 종일</span>
          <input type="checkbox" className="ev-switch" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        </label>
        <div className="ev-row">
          <span>시작</span>
          <div className="ev-when">
            <input
              type="date"
              className="st-input"
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setStart(v);
                if (endDate < v) setEndDate(v);
              }}
              aria-label="시작 날짜"
            />
            {!allDay && <input type="time" className="st-input" value={t1} onChange={(e) => setT1(e.target.value)} aria-label="시작 시각" />}
          </div>
        </div>
        <div className="ev-row">
          <span>종료</span>
          <div className="ev-when">
            <input type="date" className="st-input" value={endDate} min={start} onChange={(e) => e.target.value && setEndDate(e.target.value)} aria-label="끝 날짜" />
            {!allDay && <input type="time" className="st-input" value={t2} onChange={(e) => setT2(e.target.value)} aria-label="끝 시각" />}
          </div>
        </div>
        <Field label="반복" group>
          <div className="st-chips">
            {FREQS.map(([k, l]) => (
              <button key={k || 'none'} type="button" className={`st-chip ${freq === k ? 'on' : ''}`} aria-pressed={freq === k} onClick={() => setFreq(k)}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        {freq && (
          <div className="ev-repeat">
            <div className="st-inline">
              <input className="st-input xs" inputMode="numeric" value={every} onChange={(e) => setEvery(Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || 0)} aria-label="몇 번째마다" />
              <span>{UNIT[freq]}마다</span>
            </div>
            {freq === 'weekly' && (
              <div className="ev-days" role="group" aria-label="요일">
                {WEEKDAYS.map((w, i) => {
                  const onDay = days.length ? days.includes(i) : i === weekday(start);
                  return (
                    <button key={w} type="button" className={`ev-day ${onDay ? 'on' : ''}`} aria-pressed={onDay} onClick={() => setDays((p) => ((p.length ? p : [weekday(start)]).includes(i) ? (p.length ? p : [weekday(start)]).filter((x) => x !== i) : [...(p.length ? p : [weekday(start)]), i]))}>
                      {w}
                    </button>
                  );
                })}
              </div>
            )}
            <label className="st-inline">
              <span>끝나는 날</span>
              <input type="date" className="st-input" value={until} min={addDays(start, 1)} onChange={(e) => setUntil(e.target.value)} aria-label="반복 끝나는 날" />
              {until && (
                <button type="button" className="btn btn-sm" onClick={() => setUntil('')}>
                  계속
                </button>
              )}
            </label>
          </div>
        )}
        <Field label="알림">
          <select className="st-input" value={remind === undefined ? '' : String(remind)} onChange={(e) => setRemind(e.target.value === '' ? undefined : Number(e.target.value))}>
            {REMIND_OPTS.map(([v, l]) => (
              <option key={l} value={v === undefined ? '' : String(v)}>
                {allDay && v !== undefined && v < 1440 ? (v === 0 ? '당일 오전 9시' : `오전 9시 ${l}`) : allDay && v === 1440 ? '전날 오전 9시' : l}
              </option>
            ))}
          </select>
        </Field>
        {remind !== undefined && (!isLoggedIn() || !localTimes()) && <small className="st-hint">{isLoggedIn() ? '설정에서 이 기기 알림을 켜야 휴대폰으로 와요' : '로그인하고 알림을 켜야 휴대폰으로 와요'}</small>}
        <input className="st-input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="장소" aria-label="장소" />
        <textarea className="st-input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" aria-label="메모" />
        <button className="btn btn-primary" onClick={save}>
          저장
        </button>
        {ev && (
          <div className="ev-del">
            {ev.repeat && on && (
              <button className="btn" onClick={() => del(true)}>
                이 날만 지우기
              </button>
            )}
            <button className="btn ev-danger" onClick={() => del(false)}>
              {ev.repeat ? '반복 모두 지우기' : '지우기'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
