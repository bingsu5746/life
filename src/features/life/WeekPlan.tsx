// 한 주 계획: 그 주 일정 · 문제집 할 양 · 요일별 공부 시간 목표 (지난주 실제와 비교)
import { useState } from 'react';
import { addDays, shortDate, weekStart, weekday, WEEKDAYS } from '../study/dates';
import { alive } from '../study/model';
import { planViews } from '../study/select';
import { setSettings, useStudy, useWords } from '../study/store';
import { minutesText } from '../study/timer';
import { go, toast, useToday } from '../study/ui';
import { weekLoad } from '../study/weekLoad';
import { CAL_KIND, monthItems, type CalItem } from './calendar';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
/** 좁은 칸용: 1:20 */
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export function WeekPlanPage() {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const thisWeek = weekStart(today);
  const [next, setNext] = useState(weekday(today) === 0 || weekday(today) === 6);
  const start = next ? addDays(thisWeek, 7) : thisWeek;
  const dates = DAYS.map((_, i) => addDays(start, i));
  // 그 주 일정 (달이 걸치면 두 달 것)
  const items = new Map<string, CalItem[]>();
  for (const m of new Set(dates.map((x) => x.slice(0, 7)))) for (const [k, v] of monthItems(d, m)) items.set(k, v);
  const load = weekLoad(
    planViews(d, words, today)
      .filter((v) => v.plan.target === 'book')
      .map((v) => ({ name: v.name, today: v.sched.today, days: v.sched.days })),
    start,
    today,
  );
  // 지난주 실제 공부 시간 (요일별)
  const sessions = alive(d.sessions);
  const minsOn = (date: string) => sessions.filter((s) => s.date === date).reduce((a, s) => a + s.minutes, 0);
  const lastWeek = dates.map((x) => minsOn(addDays(x, -7)));
  const actual = dates.map((x) => (x <= today ? minsOn(x) : 0));
  const saved = d.settings.weekTargets?.[start];
  const prevTargets = d.settings.weekTargets?.[addDays(start, -7)];
  const [hours, setHours] = useState<string[]>(() => (saved ?? prevTargets ?? [0, 0, 0, 0, 0, 0, 0]).map((m) => (m ? String(Math.round((m / 60) * 10) / 10) : '')));
  const targets = hours.map((h) => Math.round((Number(h) || 0) * 60));
  const total = targets.reduce((a, b) => a + b, 0);
  const lastTotal = lastWeek.reduce((a, b) => a + b, 0);
  const isThis = start === thisWeek;
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>한 주 계획</h2>
        <div className="st-seg sm">
          <button
            className={!next ? 'on' : ''}
            onClick={() => {
              setNext(false);
              setHours((d.settings.weekTargets?.[thisWeek] ?? d.settings.weekTargets?.[addDays(thisWeek, -7)] ?? [0, 0, 0, 0, 0, 0, 0]).map((m) => (m ? String(Math.round((m / 60) * 10) / 10) : '')));
            }}
          >
            이번 주
          </button>
          <button
            className={next ? 'on' : ''}
            onClick={() => {
              setNext(true);
              setHours((d.settings.weekTargets?.[addDays(thisWeek, 7)] ?? d.settings.weekTargets?.[thisWeek] ?? [0, 0, 0, 0, 0, 0, 0]).map((m) => (m ? String(Math.round((m / 60) * 10) / 10) : '')));
            }}
          >
            다음 주
          </button>
        </div>
      </div>
      <small className="st-muted">
        {shortDate(start)} ~ {shortDate(addDays(start, 6))}
      </small>

      <section className="st-card">
        <div className="st-inline between">
          <h3 className="st-h">요일별 공부 목표 (시간)</h3>
          <small className="st-muted">
            합계 {minutesText(total)} · 지난주 {minutesText(lastTotal)}
          </small>
        </div>
        <div className="wp-grid">
          {dates.map((date, i) => (
            <label key={date} className={`wp-day ${date === today ? 'today' : ''}`}>
              <b>{WEEKDAYS[weekday(date)]}</b>
              <input className="st-input" inputMode="decimal" value={hours[i]} placeholder="시간" onChange={(e) => setHours(hours.map((h, j) => (j === i ? e.target.value.replace(/[^\d.]/g, '').slice(0, 4) : h)))} aria-label={`${WEEKDAYS[weekday(date)]}요일 목표 시간`} />
              <small className="st-muted">지난 {hm(lastWeek[i])}</small>
              {isThis && date <= today && <small className={targets[i] && actual[i] >= targets[i] ? 'wp-ok' : 'st-muted'}>한 {hm(actual[i])}</small>}
            </label>
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setSettings({ weekTargets: { ...(d.settings.weekTargets ?? {}), [start]: targets } });
            toast('목표를 저장했어요');
          }}
        >
          저장
        </button>
      </section>

      <section className="st-card">
        <h3 className="st-h">이 주 일정</h3>
        {dates.every((x) => !(items.get(x) ?? []).length && !load.find((l) => l.date === x)?.total) ? (
          <p className="st-muted">정해진 일정이 없어요.</p>
        ) : (
          dates.map((date) => {
            const its = items.get(date) ?? [];
            const l = load.find((x) => x.date === date);
            if (!its.length && !l?.total) return null;
            return (
              <div key={date} className="wp-row">
                <b className={date === today ? 'wp-today' : ''}>{shortDate(date)}</b>
                <div>
                  {its.map((x, i) => (
                    <button key={i} className="cal-item" disabled={!x.to} onClick={() => x.to && go(x.to)}>
                      <span className={`cal-tag ${x.kind}`}>{CAL_KIND[x.kind]}</span>
                      <span>{x.label}</span>
                    </button>
                  ))}
                  {l && l.total > 0 && (
                    <div className="cal-item">
                      <span className={`cal-tag ${l.heavy ? 'exam' : ''}`}>문제집</span>
                      <span>{l.parts.map((p) => `${p.name} ${p.n}쪽`).join(' · ')}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
