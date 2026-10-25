// 주간 돌아보기: 한 주에 한 것 · 지난주와 비교 · 다음 주 할 것 · 한 줄 돌아보기
import { useState } from 'react';
import { addDays, isDate, shortDate, weekStart, WEEKDAYS } from './dates';
import { BarChart } from './charts';
import { put, useStudy, useWords } from './store';
import { minutesText } from './timer';
import { weekSummary } from './weekReview';
import { Bar, go, SubjectDot, toast, useToday } from './ui';

export function WeekReview({ from: from0 }: { from?: string }) {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const from = from0 && isDate(from0) ? weekStart(from0) : weekStart(today);
  const s = weekSummary(d, words, from, today);
  const note = d.weekNotes[from]?.deleted ? undefined : d.weekNotes[from];
  const [text, setText] = useState(note?.text ?? '');
  const diff = s.prevMinutes ? Math.round(((s.minutes - s.prevMinutes) / s.prevMinutes) * 100) : null;
  const max = Math.max(1, ...s.bySubject.map((x) => x.min));
  const h = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}시간` : `${m}분`);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go('/time')} aria-label="공부 기록">
          ‹
        </button>
        <h2>주간 돌아보기</h2>
      </div>
      <div className="st-inline between">
        <button className="btn btn-sm" onClick={() => go(`/time/week-${addDays(from, -7)}`)}>
          ‹ 지난주
        </button>
        <b>
          {shortDate(from)} ~ {shortDate(addDays(from, 6))}
        </b>
        <button className="btn btn-sm" disabled={addDays(from, 7) > today} onClick={() => go(`/time/week-${addDays(from, 7)}`)}>
          다음 주 ›
        </button>
      </div>

      <section className="st-card">
        <div className="st-stat-row">
          <div>
            <small>공부 시간</small>
            <b>{minutesText(s.minutes)}</b>
          </div>
          <div>
            <small>지난주보다</small>
            <b>{diff === null ? '—' : diff === 0 ? '같아요' : `${Math.abs(diff)}% ${diff > 0 ? '많아요' : '적어요'}`}</b>
          </div>
          <div>
            <small>공부한 날</small>
            <b>{s.studyDays}/7일</b>
          </div>
        </div>
        <BarChart height={140} label="요일별 공부 시간" bars={s.perDay.map((x, i) => ({ label: WEEKDAYS[(i + 1) % 7], title: shortDate(x.date), value: x.min, strong: x.date === today }))} format={h} tickUnit={Math.max(...s.perDay.map((x) => x.min)) >= 120 ? 60 : 1} />
        {s.bySubject.map((x) => (
          <div key={x.subjectId || 'none'} className="st-subj-row">
            <span>
              {x.subjectId && <SubjectDot id={x.subjectId} d={d} />} {d.subjects[x.subjectId]?.name ?? '과목 없음'}
            </span>
            <Bar value={x.min} max={max} label={`${d.subjects[x.subjectId]?.name ?? '과목 없음'} 공부 시간`} />
            <small>{minutesText(x.min)}</small>
          </div>
        ))}
      </section>

      <section className="st-card">
        <h3 className="st-h">이번 주에 한 것</h3>
        <ul className="wk-list">
          <li>
            예습 <b>{s.previews}</b>개
          </li>
          <li>
            할 일 <b>{s.todos}</b>개 끝냄
          </li>
          {s.habitPossible > 0 && (
            <li>
              습관 <b>{s.habitChecks}</b>/{s.habitPossible}번
            </li>
          )}
          <li>
            새로 익힌 단어 <b>{s.newWords}</b>개
          </li>
          <li>
            새 오답 <b>{s.newNotes}</b>개
          </li>
          <li>
            백지 복습 <b>{s.blankTries}</b>번
          </li>
          <li>
            기출·모의고사 <b>{s.papers}</b>회
          </li>
          {s.sleepAvg !== null && (
            <li>
              평균 잠 <b>{minutesText(s.sleepAvg)}</b>
            </li>
          )}
          {s.moodAvg !== null && (
            <li>
              평균 컨디션 <b>{s.moodAvg}</b>/5
            </li>
          )}
        </ul>
      </section>

      <section className="st-card">
        <h3 className="st-h">다음 주 ({shortDate(addDays(from, 7))} ~)</h3>
        {!s.next.length ? (
          <p className="st-hint">다음 주에 정해 둔 시험·수행평가·숙제 마감이 없어요.</p>
        ) : (
          s.next.map((x, i) => (
            <div key={i} className="st-item">
              <small className="st-muted nowrap">{shortDate(x.date)}</small>
              <div className="st-item-main">{x.text}</div>
            </div>
          ))
        )}
      </section>

      <section className="st-card st-form">
        <h3 className="st-h">한 줄 돌아보기</h3>
        <textarea className="st-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="잘한 것 · 아쉬운 것 · 다음 주에 바꿀 것" />
        <div className="st-row end">
          <button className="btn btn-primary btn-sm" disabled={text.trim() === (note?.text ?? '')} onClick={() => (put('weekNotes', { id: from, text: text.trim() } as never), toast('저장했어요'))}>
            저장
          </button>
        </div>
      </section>
    </div>
  );
}
