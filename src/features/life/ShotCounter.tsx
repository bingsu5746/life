// 슛 세기: 연습하면서 들어갈 때마다·놓칠 때마다 누르면 오늘 2점·3점·자유투가 쌓인다.
// 앱이 슛을 저절로 알 수는 없어서 (카메라로 세는 앱은 따로 있음) 누른 것만 센다.
import { useState } from 'react';
import { addDays, weekStart } from '../study/dates';
import { newId, type BasketballStat, type Workout } from '../study/model';
import { put, useStudy } from '../study/store';
import { toast, useToday } from '../study/ui';
import { shotsBetween, type ShotLine } from './drills';

type Kind = 'fg' | 'tp' | 'ft';
const NAME: Record<Kind, string> = { fg: '2점', tp: '3점', ft: '자유투' };
type Tally = Record<Kind, ShotLine>;
const EMPTY: Tally = { fg: { m: 0, a: 0 }, tp: { m: 0, a: 0 }, ft: { m: 0, a: 0 } };
const KEY = 'my-study.shot-tally';

const pct = (x: ShotLine) => (x.a ? `${Math.round((x.m / x.a) * 100)}%` : '—');
const line = (x: ShotLine) => (x.a ? `${x.m}/${x.a} · ${pct(x)}` : '—');

type Step = { k: Kind; made: boolean };

function load(today: string): { tally: Tally; log: Step[] } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { date: string; tally: Tally } | null;
    if (v?.date === today) return { tally: v.tally, log: [] };
  } catch {
    /* 무시 */
  }
  return { tally: EMPTY, log: [] };
}

/** 오늘 · 이번 주 · 최근 30일 슛 (적은 기록에서) */
export function ShotSummary() {
  const d = useStudy();
  const today = useToday();
  const rows: [string, ReturnType<typeof shotsBetween>][] = [
    ['오늘', shotsBetween(d, today, today)],
    ['이번 주', shotsBetween(d, weekStart(today), today)],
    ['30일', shotsBetween(d, addDays(today, -29), today)],
  ];
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
      <small className="st-muted">경기 기록과 연습(슛 세기·드릴)에 적은 것만 세요.</small>
    </section>
  );
}

export function ShotCounter() {
  const today = useToday();
  const [{ tally, log }, set] = useState(() => load(today));
  const save = (t: Tally, l: Step[]) => {
    set({ tally: t, log: l });
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: today, tally: t }));
    } catch {
      /* 무시 */
    }
  };
  const hit = (k: Kind, made: boolean) => save({ ...tally, [k]: { m: tally[k].m + (made ? 1 : 0), a: tally[k].a + 1 } }, [...log, { k, made }]);
  const undo = () => {
    const last = log[log.length - 1];
    if (!last) return;
    const { k, made } = last;
    save({ ...tally, [k]: { m: tally[k].m - (made ? 1 : 0), a: tally[k].a - 1 } }, log.slice(0, -1));
  };
  const any = tally.fg.a + tally.tp.a + tally.ft.a > 0;
  function commit() {
    const bb: BasketballStat = { mode: 'practice', fgm: tally.fg.m, fga: tally.fg.a, tpm: tally.tp.m, tpa: tally.tp.a, ftm: tally.ft.m, fta: tally.ft.a };
    put('workouts', { id: newId(), date: today, kind: '농구', memo: '슛 세기', bb, created: Date.now() } as Workout);
    save(EMPTY, []);
    toast('오늘 슛 기록에 넣었어요');
  }
  return (
    <section className="st-card sc">
      <div className="st-inline between">
        <h3 className="st-h">슛 세기</h3>
        {log.length > 0 && (
          <button className="st-link" onClick={undo}>
            되돌리기
          </button>
        )}
      </div>
      {(Object.keys(NAME) as Kind[]).map((k) => (
        <div key={k} className="sc-row">
          <span className="sc-name">{NAME[k]}</span>
          <button className="sc-btn in" onClick={() => hit(k, true)} aria-label={`${NAME[k]} 들어감`}>
            들어감
          </button>
          <button className="sc-btn out" onClick={() => hit(k, false)} aria-label={`${NAME[k]} 놓침`}>
            놓침
          </button>
          <b className="sc-count">{line(tally[k])}</b>
        </div>
      ))}
      {any ? (
        <div className="st-row end">
          <button className="btn btn-primary btn-sm" onClick={commit}>
            오늘 기록에 넣기
          </button>
        </div>
      ) : (
        <small className="st-muted">던질 때마다 눌러 주세요. 다 하면 「오늘 기록에 넣기」로 저장돼요. (앱을 닫아도 오늘 센 건 남아요)</small>
      )}
    </section>
  );
}
