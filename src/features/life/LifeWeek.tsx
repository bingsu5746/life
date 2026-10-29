// 이번 주 돌아보기 화면 (/week, /week/<그 주의 아무 날>)
import { addDays, isDate, shortDate, weekStart } from '../study/dates';
import { useStudy } from '../study/store';
import { go, useToday } from '../study/ui';
import { won } from './calc';
import { lifeWeek } from './lifeWeek';
import { starText } from './MovieParts';

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
const MOOD = ['', '나쁨', '별로', '보통', '좋음', '최고'];

function Delta({ now, prev, unit = '', fmt = String, lowerBetter }: { now: number; prev: number; unit?: string; fmt?: (n: number) => string; lowerBetter?: boolean }) {
  if (!prev && !now) return null;
  const diff = now - prev;
  if (!diff) return <small className="st-muted">지난주와 같아요</small>;
  const good = lowerBetter ? diff < 0 : diff > 0;
  return (
    <small className={good ? 'lw-up' : 'lw-down'}>
      지난주보다 {fmt(Math.abs(diff))}
      {unit} {diff > 0 ? '더' : '덜'}
    </small>
  );
}

export function LifeWeekPage({ day }: { day?: string }) {
  const d = useStudy();
  const today = useToday();
  const at = day && isDate(day) ? day : today;
  const w = lifeWeek(d, at, today);
  const cur = weekStart(today) === w.from;
  const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : '—');
  const shotsAny = w.shots.fg.a + w.shots.tp.a + w.shots.ft.a > 0;
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{cur ? '이번 주' : `${shortDate(w.from)} 주`} 돌아보기</h2>
      </div>
      <div className="st-inline between">
        <button className="btn btn-sm" onClick={() => go(`/week/${addDays(w.from, -7)}`)} aria-label="지난주">
          ‹
        </button>
        <small className="st-muted">
          {shortDate(w.from)} ~ {shortDate(w.to)}
        </small>
        <button className="btn btn-sm" disabled={cur} onClick={() => go(`/week/${addDays(w.from, 7)}`)} aria-label="다음 주">
          ›
        </button>
      </div>
      <div className="lw-grid">
        <button className="lw-card" onClick={() => go(`/time/week-${w.from}`)}>
          <small>공부</small>
          <b>{hm(w.study.now)}</b>
          <Delta now={w.study.now} prev={w.study.prev} fmt={hm} />
        </button>
        <button className="lw-card" onClick={() => go('/fitness')}>
          <small>운동</small>
          <b>
            {w.workout.days}일{w.workout.minutes ? ` · ${hm(w.workout.minutes)}` : ''}
          </b>
          <Delta now={w.workout.days} prev={w.workout.prevDays} unit="일" />
        </button>
        <button className="lw-card" onClick={() => go('/money')}>
          <small>쓴 돈</small>
          <b>{won(w.spent.now)}</b>
          <Delta now={w.spent.now} prev={w.spent.prev} fmt={won} lowerBetter />
        </button>
        <button className="lw-card" onClick={() => go('/life')}>
          <small>습관 · 할 일</small>
          <b>{w.habits.due ? pct(w.habits.done, w.habits.due) : '—'}</b>
          <small className="st-muted">끝낸 할 일 {w.todos}개</small>
        </button>
        <button className="lw-card" onClick={() => go(`/diary/${w.from.slice(0, 7)}`)}>
          <small>일기</small>
          <b>{w.diary.count}편</b>
          <small className="st-muted">{w.diary.mood ? `기분 평균 ${MOOD[Math.round(w.diary.mood)]} (${w.diary.mood})` : ' '}</small>
        </button>
        <button className="lw-card" onClick={() => go('/hobby/reading')}>
          <small>독서 · 취미</small>
          <b>{w.pages}쪽</b>
          <small className="st-muted">{[w.booksDone.length ? `다 읽은 책 ${w.booksDone.length}권` : '', w.hobby ? `취미 ${hm(w.hobby)}` : ''].filter(Boolean).join(' · ') || ' '}</small>
        </button>
      </div>
      {w.movies.length > 0 && (
        <section className="st-card">
          <small className="aw-label">이번 주 본 영화</small>
          {w.movies.map((m) => (
            <button key={m.id} className="aw-film" onClick={() => go('/movies/watched')}>
              <b>{m.title}</b>
              <span>{starText(m.rating)}</span>
              {m.comment && <small>“{m.comment}”</small>}
            </button>
          ))}
        </section>
      )}
      {shotsAny && (
        <section className="st-card">
          <small className="aw-label">농구</small>
          <p className="lw-shots">
            2점 {w.shots.fg.m}/{w.shots.fg.a} ({pct(w.shots.fg.m, w.shots.fg.a)}) · 3점 {w.shots.tp.m}/{w.shots.tp.a} ({pct(w.shots.tp.m, w.shots.tp.a)}) · 자유투 {w.shots.ft.m}/{w.shots.ft.a} ({pct(w.shots.ft.m, w.shots.ft.a)})
          </p>
        </section>
      )}
      <button className="st-link" onClick={() => go(`/time/week-${w.from}`)}>
        공부 주간 돌아보기 (과목별·다음 주 할 것) 열기
      </button>
    </div>
  );
}
