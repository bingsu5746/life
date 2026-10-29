// 내가 본 영화 시상식: 한 해(또는 전체) 요약
import { useState } from 'react';
import { alive, type Movie } from '../study/model';
import { useStudy } from '../study/store';
import { Empty, go } from '../study/ui';
import { awards, watchedYears, type Tally } from './awards';
import { starText } from './MovieParts';

function Film({ m, onOpen }: { m: Movie; onOpen: (m: Movie) => void }) {
  return (
    <button className="aw-film" onClick={() => onOpen(m)}>
      <b>{m.title}</b>
      <span>{starText(m.rating)}</span>
      {m.comment && <small>“{m.comment}”</small>}
    </button>
  );
}

function Cat({ label, t, unit = '편' }: { label: string; t?: Tally; unit?: string }) {
  if (!t) return null;
  return (
    <div className="aw-cat">
      <small>{label}</small>
      <b>{t.name}</b>
      <span>
        {t.count}
        {unit}
      </span>
    </div>
  );
}

export function AwardsView({ onOpen }: { onOpen: (m: Movie) => void }) {
  const d = useStudy();
  const years = watchedYears(d);
  const [year, setYear] = useState<number | null>(years[0] ?? null);
  if (!alive(d.movies).some((m) => m.status === 'watched')) return <Empty title="아직 본 영화가 없어요">영화를 보고 별점을 남기면 시상식 요약이 만들어져요.</Empty>;
  const a = awards(d, year);
  return (
    <div className="aw">
      <div className="aw-years" role="tablist" aria-label="연도">
        {years.map((y) => (
          <button key={y} role="tab" aria-selected={year === y} className={year === y ? 'on' : ''} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
        <button className="aw-open" onClick={() => go('/movies/ceremony')}>
          시상식 열기
        </button>
        <button role="tab" aria-selected={year === null} className={year === null ? 'on' : ''} onClick={() => setYear(null)}>
          전체
        </button>
      </div>
      <section className="st-card aw-hero">
        <small>{year ?? '지금까지'} 올해의 영화</small>
        {a.best ? (
          <>
            <h3>{a.best.title}</h3>
            <div className="aw-stars">{starText(a.best.rating)}</div>
            {a.best.comment && <p>“{a.best.comment}”</p>}
            <button className="st-link" onClick={() => onOpen(a.best!)}>
              리뷰 보기
            </button>
          </>
        ) : (
          <p className="st-muted">별점을 준 영화가 없어요.</p>
        )}
      </section>
      {a.nominees.length > 0 && (
        <section className="st-card">
          <small className="aw-label">후보작</small>
          {a.nominees.map((m) => (
            <Film key={m.id} m={m} onOpen={onOpen} />
          ))}
        </section>
      )}
      <section className="st-card aw-grid">
        <div className="aw-cat">
          <small>본 영화</small>
          <b>{a.count}편</b>
          <span>{a.rewatch ? `다시 본 ${a.rewatch}번 포함` : ' '}</span>
        </div>
        <div className="aw-cat">
          <small>평균 별점</small>
          <b>{a.avg ?? '—'}</b>
          <span>{a.fives ? `5점 ${a.fives}편` : ' '}</span>
        </div>
        <Cat label="가장 많이 본 장르" t={a.genre} />
        <Cat label="가장 많이 본 감독" t={a.director} />
        <Cat label="가장 많이 간 곳" t={a.place} unit="번" />
        <Cat label="영화를 가장 많이 본 달" t={a.month} />
      </section>
      {a.worst && (
        <section className="st-card">
          <small className="aw-label">아쉬웠던 영화</small>
          <Film m={a.worst} onOpen={onOpen} />
        </section>
      )}
    </div>
  );
}
