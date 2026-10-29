// 넣은 슛 합계: 경기 기록·드릴 기록에 적은 2점·3점·자유투를 오늘·이번 주·30일로
import { addDays, weekStart } from '../study/dates';
import { useStudy } from '../study/store';
import { useToday } from '../study/ui';
import { shotsBetween, type ShotLine } from './drills';

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
      <small className="st-muted">경기 기록과 드릴 기록에 적은 것만 세요.</small>
    </section>
  );
}
