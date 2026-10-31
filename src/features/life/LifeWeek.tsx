// 이번 주 돌아보기 화면 (/week, /week/<그 주의 아무 날>)
import { shareCard, type CardLine } from '../../lib/shareCard';
import { addDays, isDate, shortDate, weekStart } from '../study/dates';
import { put, useStudy } from '../study/store';
import { go, toast, useToday } from '../study/ui';
import { useState } from 'react';
import { won } from './calc';
import { lifeMonth, lifeWeek, monthTrend } from './lifeWeek';
import { monthLabel, monthOf, shiftMonth } from './calc';
import { BarChart } from '../study/charts';
import { starText } from './MovieParts';

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
const MOOD = ['', '나쁨', '별로', '보통', '좋음', '최고'];

function Delta({ now, prev, unit = '', fmt = String, lowerBetter, word = '지난주' }: { now: number; prev: number; unit?: string; fmt?: (n: number) => string; lowerBetter?: boolean; word?: string }) {
  if (!prev && !now) return null;
  const diff = now - prev;
  if (!diff) return <small className="st-muted">{word}와 같아요</small>;
  const good = lowerBetter ? diff < 0 : diff > 0;
  return (
    <small className={good ? 'lw-up' : 'lw-down'}>
      {word}보다 {fmt(Math.abs(diff))}
      {unit} {diff > 0 ? '더' : '덜'}
    </small>
  );
}

export function LifeWeekPage({ day, monthly }: { day?: string; monthly?: boolean }) {
  const d = useStudy();
  const today = useToday();
  const at = day && isDate(day) ? day : today;
  const month = monthly && day && /^\d{4}-\d{2}$/.test(day) ? day : monthOf(today);
  const w = monthly ? lifeMonth(d, month, today) : lifeWeek(d, at, today);
  const cur = monthly ? month === monthOf(today) : weekStart(today) === w.from;
  const prevWord = monthly ? '지난달' : '지난주';
  const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : '—');
  // 주간(월간) 리포트 카드: 있는 것만 줄로
  const share = async () => {
    const hm = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}시간` : `${m}분`);
    const shots = w.shots.fg.a + w.shots.tp.a;
    const lines: CardLine[] = [
      w.study.now ? { icon: '📚', label: '공부', value: hm(w.study.now), sub: w.study.prev ? `지난 ${monthly ? '달' : '주'} ${hm(w.study.prev)}` : undefined } : null,
      w.workout.days ? { icon: '🏃', label: '운동', value: `${w.workout.days}일`, sub: w.workout.minutes ? hm(w.workout.minutes) : undefined } : null,
      shots ? { icon: '🏀', label: '슛', value: `${w.shots.fg.m + w.shots.tp.m}/${shots}`, sub: pct(w.shots.fg.m + w.shots.tp.m, shots) } : null,
      w.pages || w.booksDone.length ? { icon: '📖', label: '독서', value: `${w.pages}쪽`, sub: w.booksDone.length ? `다 읽음: ${w.booksDone.join(', ')}` : undefined } : null,
      w.movies.length ? { icon: '🎬', label: '영화', value: `${w.movies.length}편`, sub: w.movies.map((m) => m.title).join(', ') } : null,
      w.diary.count ? { icon: '📔', label: '일기', value: `${w.diary.count}편`, sub: w.diary.mood ? `평균 기분 ${w.diary.mood.toFixed(1)} / 5` : undefined } : null,
      w.habits.due ? { icon: '✅', label: '습관', value: pct(w.habits.done, w.habits.due), sub: `${w.habits.done}/${w.habits.due}` } : null,
      w.spent.now ? { icon: '💰', label: '쓴 돈', value: `${w.spent.now.toLocaleString('ko-KR')}원` } : null,
    ].filter((x): x is CardLine => !!x);
    if (!lines.length) return toast('이 기간 기록이 아직 없어요');
    const title = monthly ? `${monthLabel(month)} 돌아보기` : `${shortDate(w.from)} 주 돌아보기`;
    if (!(await shareCard(title, lines, `${w.from}-돌아보기.png`, ['#0f172a', '#047857']))) toast('그림을 만들지 못했어요');
  };
  const shotsAny = w.shots.fg.a + w.shots.tp.a + w.shots.ft.a > 0;
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{monthly ? (cur ? '이번 달' : monthLabel(month)) : cur ? '이번 주' : `${shortDate(w.from)} 주`} 돌아보기</h2>
        <button className="btn btn-sm" onClick={() => void share()}>
          그림으로 공유
        </button>
      </div>
      <div className="st-seg" role="tablist" aria-label="기간">
        <button role="tab" aria-selected={!monthly} className={!monthly ? 'on' : ''} onClick={() => go('/week')}>
          주
        </button>
        <button role="tab" aria-selected={!!monthly} className={monthly ? 'on' : ''} onClick={() => go('/month')}>
          달
        </button>
      </div>
      <div className="st-inline between">
        <button className="btn btn-sm" onClick={() => go(monthly ? `/month/${shiftMonth(month, -1)}` : `/week/${addDays(w.from, -7)}`)} aria-label={prevWord}>
          ‹
        </button>
        <small className="st-muted">
          {shortDate(w.from)} ~ {shortDate(w.to)}
        </small>
        <button className="btn btn-sm" disabled={cur} onClick={() => go(monthly ? `/month/${shiftMonth(month, 1)}` : `/week/${addDays(w.from, 7)}`)} aria-label={monthly ? '다음 달' : '다음 주'}>
          ›
        </button>
      </div>
      <div className="lw-grid">
        <button className="lw-card" onClick={() => go(`/time/week-${w.from}`)}>
          <small>공부</small>
          <b>{hm(w.study.now)}</b>
          <Delta now={w.study.now} prev={w.study.prev} fmt={hm} word={prevWord} />
        </button>
        <button className="lw-card" onClick={() => go('/basketball')}>
          <small>운동</small>
          <b>
            {w.workout.days}일{w.workout.minutes ? ` · ${hm(w.workout.minutes)}` : ''}
          </b>
          <Delta now={w.workout.days} prev={w.workout.prevDays} unit="일" word={prevWord} />
        </button>
        <button className="lw-card" onClick={() => go('/money')}>
          <small>쓴 돈</small>
          <b>{won(w.spent.now)}</b>
          <Delta now={w.spent.now} prev={w.spent.prev} fmt={won} lowerBetter word={prevWord} />
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
          <small className="aw-label">{monthly ? '이 달' : '이번 주'} 본 영화</small>
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
      {monthly && <Trend month={month} />}
      {!monthly && w.from <= today && <NextChange from={w.from} />}
      {!monthly && (
        <button className="st-link" onClick={() => go(`/time/week-${w.from}`)}>
          공부 자세히 돌아보기 (과목별 · 다음 주 할 것)
        </button>
      )}
    </div>
  );
}

/** 달마다 비교 (최근 6달) */
function Trend({ month }: { month: string }) {
  const d = useStudy();
  const t = monthTrend(d, month);
  const label = (m: string) => `${Number(m.slice(5))}월`;
  const bars = (f: (x: (typeof t)[number]) => number) => t.map((x) => ({ label: label(x.month), title: monthLabel(x.month), value: f(x), strong: x.month === month }));
  const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}시간`;
  const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000) / 10}만` : n > 0 ? `${Math.round(n / 1000)}천` : '0');
  return (
    <section className="st-card">
      <h3 className="st-h">달마다 (최근 6달)</h3>
      <h4 className="ta-h">공부 시간</h4>
      <BarChart label="달별 공부 시간" height={120} bars={bars((x) => x.study)} format={hours} tickUnit={60} />
      <h4 className="ta-h">운동한 날</h4>
      <BarChart label="달별 운동한 날" height={110} bars={bars((x) => x.workoutDays)} format={(v) => `${v}일`} />
      <h4 className="ta-h">쓴 돈</h4>
      <BarChart label="달별 쓴 돈" height={110} bars={bars((x) => x.spent)} format={short} />
    </section>
  );
}

/** 다음 주에 바꿀 한 가지: 정해 두면 다음 주 내내 메인 맨 위에 보이고, 주말에 지켰는지 묻는다 */
function NextChange({ from }: { from: string }) {
  const d = useStudy();
  const note = d.weekNotes[from];
  const [v, setV] = useState(note?.change ?? '');
  const save = () => {
    put('weekNotes', { ...(note ?? { id: from, text: '' }), change: v.trim() || undefined, kept: undefined } as never);
    toast(v.trim() ? '다음 주 메인 화면 맨 위에 보여 드릴게요' : '지웠어요');
  };
  return (
    <section className="st-card st-form">
      <h3 className="st-h">다음 주에 바꿀 한 가지</h3>
      <form
        className="st-inline"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input className="st-input" value={v} onChange={(e) => setV(e.target.value)} maxLength={100} placeholder="예: 11시 전에 휴대폰 끄기" aria-label="다음 주에 바꿀 한 가지" />
        <button className="btn btn-sm btn-primary" disabled={v.trim() === (note?.change ?? '')}>
          저장
        </button>
      </form>
      {note?.kept !== undefined && <small className="st-muted">{note.kept ? '지켰어요 ✓' : '못 지켰어요'}</small>}
    </section>
  );
}
