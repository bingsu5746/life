// 넣은 슛 합계: 경기 기록·드릴 기록에 적은 2점·3점·자유투를 오늘·이번 주·30일로
import { addDays, weekStart } from '../study/dates';
import { useState } from 'react';
import { setSettings, useStudy } from '../study/store';
import { Bar, useToday } from '../study/ui';
import { shotsBetween, shotsByCourt, type ShotLine } from './bb';

type Kind = 'fg' | 'tp' | 'ft';
const NAME: Record<Kind, string> = { fg: '2점', tp: '3점', ft: '자유투' };

const pct = (x: ShotLine) => (x.a ? `${Math.round((x.m / x.a) * 100)}%` : '—');
const line = (x: ShotLine) => (x.a ? `${x.m}/${x.a} · ${pct(x)}` : '—');

/** 오늘 · 이번 주 · 최근 30일 슛 (적은 기록에서) */
export function ShotSummary() {
  const d = useStudy();
  const today = useToday();
  const rows: [string, ReturnType<typeof shotsBetween>][] = [
    ['오늘', shotsBetween(d, today, today)],
    ['이번 주', shotsBetween(d, weekStart(today), today)],
    ['30일', shotsBetween(d, addDays(today, -29), today)],
    ['전체', shotsBetween(d, '0000-01-01', today)],
  ];
  const courts = shotsByCourt(d, addDays(today, -89), today).filter((c) => c.s.fg.a || c.s.tp.a || c.s.ft.a);
  if (rows.every(([, s]) => !s.fg.a && !s.tp.a && !s.ft.a)) return null;
  return (
    <section className="st-card">
      <h3 className="st-h">넣은 슛</h3>
      <div className="sc-table" role="table">
        <div role="row" className="sc-head">
          <span />
          {(Object.keys(NAME) as Kind[]).map((k) => (
            <small key={k}>{NAME[k]}</small>
          ))}
        </div>
        {rows.map(([label, s]) => (
          <div key={label} role="row">
            <small className="st-muted">{label}</small>
            {(Object.keys(NAME) as Kind[]).map((k) => (
              <b key={k}>{line(s[k])}</b>
            ))}
          </div>
        ))}
      </div>
      <small className="st-muted">경기 기록과 드릴 기록에 적은 것만 세요.</small>
      {courts.length > 1 && (
        <>
          <h4 className="st-group">코트별 · 90일</h4>
          <div className="sc-table" role="table">
            {courts.map((c) => (
              <div key={c.court} role="row">
                <small className="st-muted">
                  {c.court} · {c.times}번
                </small>
                {(Object.keys(NAME) as Kind[]).map((k) => (
                  <b key={k}>{line(c.s[k])}</b>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** 이번 달 성공률과 목표 (자유투·2점·3점) */
export function BbGoals() {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState(false);
  const goals = d.settings.bbGoals ?? {};
  const [draft, setDraft] = useState<Record<Kind, string>>({ ft: goals.ft?.toString() ?? '', fg: goals.fg?.toString() ?? '', tp: goals.tp?.toString() ?? '' });
  const month = shotsBetween(d, `${today.slice(0, 7)}-01`, today);
  const has = (Object.keys(NAME) as Kind[]).some((k) => goals[k]);
  if (!has && !edit)
    return (
      <button className="st-addline" onClick={() => setEdit(true)}>
        이번 달 성공률 목표 정하기 (예: 자유투 70%)
      </button>
    );
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">이번 달 목표</h3>
        {!edit && (
          <button className="st-link" onClick={() => setEdit(true)}>
            고치기
          </button>
        )}
      </div>
      {edit ? (
        <div className="st-form">
          <div className="st-inline wrap">
            {(Object.keys(NAME) as Kind[]).map((k) => (
              <label key={k} className="st-cond-time">
                {NAME[k]}
                <input className="st-input xs" inputMode="numeric" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="%" aria-label={`${NAME[k]} 목표 %`} />%
              </label>
            ))}
          </div>
          <div className="st-row end">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                const v = (s: string) => (Number(s) >= 1 && Number(s) <= 100 ? Number(s) : undefined);
                setSettings({ bbGoals: { ft: v(draft.ft), fg: v(draft.fg), tp: v(draft.tp) } });
                setEdit(false);
              }}
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        (Object.keys(NAME) as Kind[])
          .filter((k) => goals[k])
          .map((k) => {
            const p = month[k].a ? Math.round((month[k].m / month[k].a) * 100) : null;
            return (
              <div key={k} className="st-subj-row">
                <span>{NAME[k]}</span>
                <Bar value={Math.min(p ?? 0, goals[k]!)} max={goals[k]!} label={`${NAME[k]} 목표`} />
                <small>
                  {p === null ? '기록 없음' : `${p}%`} / {goals[k]}%{p !== null && p >= goals[k]! ? ' ✓' : ''}
                </small>
              </div>
            );
          })
      )}
    </section>
  );
}
