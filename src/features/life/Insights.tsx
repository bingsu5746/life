// 자세히 보기: 영역마다 쌓인 기록을 숫자 · 순위 · 그래프로
import { BarChart } from '../study/charts';
import { useStudy } from '../study/store';
import { Analysis } from '../study/Time';
import { alive } from '../study/model';
import { useState } from 'react';
import { Bar, Empty, go, toast, useToday } from '../study/ui';
import { fitnessInsights, gradeInsights, hobbyInsights, moneyInsights, studyInsights, yearReview, type Section, type Stat } from './insights';

const TABS = [
  { key: 'study', label: '공부' },
  { key: 'grades', label: '성적' },
  { key: 'fitness', label: '운동' },
  { key: 'hobby', label: '취미' },
  { key: 'money', label: '돈' },
  { key: 'year', label: '올해' },
] as const;

const fmt = (f: Section['barFormat']) => (v: number) => (f === 'min' ? (v >= 60 ? `${Math.round((v / 60) * 10) / 10}시간` : `${v}분`) : f === 'won' ? (v >= 10000 ? `${Math.round(v / 1000) / 10}만` : `${Math.round(v / 1000)}천`) : f === 'pct' ? `${v}%` : `${v}`);

export function InsightsPage({ tab: t0 }: { tab?: string }) {
  const d = useStudy();
  const today = useToday();
  const tab = TABS.some((t) => t.key === t0) ? t0! : 'study';
  const sections = tab === 'year' ? [] : tab === 'study' ? studyInsights(d, today) : tab === 'grades' ? gradeInsights(d) : tab === 'fitness' ? fitnessInsights(d, today) : tab === 'hobby' ? hobbyInsights(d, today) : moneyInsights(d, today);
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
      {tab === 'study' && alive(d.sessions).length > 0 && <Analysis sessions={alive(d.sessions)} today={today} />}
      {tab === 'year' && <YearView today={today} />}
      {tab !== 'year' && !sections.length && <Empty title="아직 볼 기록이 없어요" />}
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

/** 올해 결산 카드 + 이미지로 저장 */
function YearView({ today }: { today: string }) {
  const d = useStudy();
  const [year, setYear] = useState(today.slice(0, 4));
  const stats = yearReview(d, year);
  const years = [String(Number(today.slice(0, 4)) - 1), today.slice(0, 4)];
  return (
    <>
      <div className="st-seg sm">
        {years.map((y) => (
          <button key={y} className={year === y ? 'on' : ''} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>
      {!stats.length ? (
        <Empty title={`${year}년 기록이 없어요`} />
      ) : (
        <>
          <section className="yr-card">
            <small>{year} 결산</small>
            <div className="yr-grid">
              {stats.map((x) => (
                <div key={x.label}>
                  <small>{x.label}</small>
                  <b>{x.value}</b>
                  {x.sub && <span>{x.sub}</span>}
                </div>
              ))}
            </div>
          </section>
          <button className="btn" onClick={() => void saveImage(year, stats)}>
            이미지로 저장
          </button>
        </>
      )}
    </>
  );
}

/** 결산을 세로 이미지(1080×1350)로 그려 공유하거나 내려받기 */
async function saveImage(year: string, stats: Stat[]) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return;
  const font = (w: number, px: number) => `${w} ${px}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  g.fillStyle = '#111';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.font = font(700, 72);
  g.fillText(`${year} 결산`, 80, 160);
  const rows = Math.ceil(stats.length / 2);
  const cellH = Math.min(220, (H - 260 - 80) / Math.max(1, rows));
  stats.forEach((x, i) => {
    const cx = 80 + (i % 2) * 480;
    const cy = 260 + Math.floor(i / 2) * cellH;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = font(500, 30);
    g.fillText(x.label, cx, cy + 36);
    g.fillStyle = '#fff';
    g.font = font(700, 60);
    g.fillText(x.value, cx, cy + 108, 440);
    if (x.sub) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = font(400, 26);
      g.fillText(x.sub, cx, cy + 152, 440);
    }
  });
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) return toast('이미지를 만들지 못했어요');
  const file = new File([blob], `결산-${year}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      /* 공유를 닫으면 그냥 끝 */
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
