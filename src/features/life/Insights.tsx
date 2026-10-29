// 자세히 보기: 영역마다 쌓인 기록을 숫자 · 순위 · 그래프로
import { BarChart } from '../study/charts';
import { useStudy } from '../study/store';
import { Bar, Empty, go, useToday } from '../study/ui';
import { fitnessInsights, gradeInsights, hobbyInsights, moneyInsights, studyInsights, type Section } from './insights';

const TABS = [
  { key: 'study', label: '공부' },
  { key: 'grades', label: '성적' },
  { key: 'fitness', label: '운동' },
  { key: 'hobby', label: '취미' },
  { key: 'money', label: '돈' },
] as const;

const fmt = (f: Section['barFormat']) => (v: number) => (f === 'min' ? (v >= 60 ? `${Math.round((v / 60) * 10) / 10}시간` : `${v}분`) : f === 'won' ? (v >= 10000 ? `${Math.round(v / 1000) / 10}만` : `${Math.round(v / 1000)}천`) : f === 'pct' ? `${v}%` : `${v}`);

export function InsightsPage({ tab: t0 }: { tab?: string }) {
  const d = useStudy();
  const today = useToday();
  const tab = TABS.some((t) => t.key === t0) ? t0! : 'study';
  const sections = tab === 'study' ? studyInsights(d, today) : tab === 'grades' ? gradeInsights(d) : tab === 'fitness' ? fitnessInsights(d, today) : tab === 'hobby' ? hobbyInsights(d, today) : moneyInsights(d, today);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>자세히 보기</h2>
      </div>
      <div className="st-seg in-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => go(`/insights/${t.key}`)}>
            {t.label}
          </button>
        ))}
      </div>
      {!sections.length && <Empty title="아직 볼 기록이 없어요" />}
      {sections.map((s) => (
        <section key={s.title} className="st-card">
          <h3 className="st-h">{s.title}</h3>
          {s.stats && s.stats.length > 0 && (
            <div className="in-stats">
              {s.stats.map((x) => (
                <div key={x.label}>
                  <small>{x.label}</small>
                  <b>{x.value}</b>
                  {x.sub && <small className="st-muted">{x.sub}</small>}
                </div>
              ))}
            </div>
          )}
          {s.ranks && s.ranks.length > 0 && (
            <div className="in-ranks">
              {s.ranks.slice(0, 10).map((r) => (
                <div key={r.label} className="in-rank">
                  <span>{r.label}</span>
                  <Bar value={r.value} max={Math.max(...s.ranks!.map((x) => x.value), 1)} label={r.label} />
                  <small>{r.text}</small>
                </div>
              ))}
            </div>
          )}
          {s.bars && s.bars.some((b) => b.value > 0) && <BarChart label={s.title} height={140} bars={s.bars} format={fmt(s.barFormat)} />}
        </section>
      ))}
    </div>
  );
}
