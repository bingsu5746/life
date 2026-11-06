// 오늘 화면 맨 위 시험 D-day · 시험 칸 위 탭 (시험 화면 코드를 다 받지 않아도 되게 따로)
import { diffDays, dday } from './dates';
import { examPeriodText, examProgress, nextSubjects, scopeDate, timetable, upcomingExams } from './exams';
import { useStudy } from './store';
import { Bar, go, Icon, tap } from './ui';

/** 오늘 화면 맨 위: 가장 가까운 시험을 크게 */
export function DdayHero({ today }: { today: string }) {
  const d = useStudy();
  const exams = upcomingExams(d, today);
  if (!exams.length)
    return (
      <button className="st-dday-empty" onClick={() => go('/exams/new')}>
        시험 날을 넣으면 여기에 D-day가 크게 보여요 <Icon name="chevron" />
      </button>
    );
  const [e, ...rest] = exams;
  const p = examProgress(e);
  const subs = nextSubjects(e, today).slice(0, 4);
  const left = diffDays(today, e.date);
  return (
    <section className="st-hero" {...tap(() => go(`/exams/${e.id}`))} aria-label={`${e.name} ${dday(today, e.date)}`}>
      <div className="st-hero-main">
        <span className="st-hero-dday">{left > 0 ? `D-${left}` : left === 0 ? 'D-day' : '시험 중'}</span>
        <div>
          <strong>{e.name}</strong>
          <small>{examPeriodText(e)}</small>
          {left <= 0 &&
            (() => {
              const t = timetable(e).find((x) => x.date === today);
              return t?.subjectIds.length ? <small>오늘 시험: {t.subjectIds.map((sid) => d.subjects[sid]?.name ?? '과목').join(' · ')}</small> : null;
            })()}
        </div>
      </div>
      {p.total > 0 && (
        <div className="st-hero-bar">
          <Bar value={p.done} max={p.total} label="시험 범위" />
          <small>
            시험 범위 {p.done}/{p.total}
          </small>
        </div>
      )}
      {subs.length > 0 && (
        <div className="st-hero-subs">
          {subs.map((s) => (
            <span key={s.id}>
              {d.subjects[s.subjectId]?.name ?? '과목'} <b>{dday(today, scopeDate(e, s))}</b>
              <small>
                {s.lines.filter((l) => l.done).length}/{s.lines.length}
              </small>
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="st-hero-more">
          {rest.slice(0, 3).map((x) => (
            <span key={x.id}>
              {x.name} {dday(today, x.date)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** 시험 · 수행평가 · 성적 · 목표 칸 */
export function ExamTabs({ on }: { on: 'exams' | 'grades' | 'tasks' | 'goal' }) {
  return (
    <div className="st-seg" role="tablist" aria-label="시험·수행평가·성적">
      <button role="tab" aria-selected={on === 'exams'} className={on === 'exams' ? 'on' : ''} onClick={() => go('/exams')}>
        시험
      </button>
      <button role="tab" aria-selected={on === 'tasks'} className={on === 'tasks' ? 'on' : ''} onClick={() => go('/exams/tasks')}>
        수행평가
      </button>
      <button role="tab" aria-selected={on === 'grades'} className={on === 'grades' ? 'on' : ''} onClick={() => go('/exams/grades')}>
        성적
      </button>
      <button role="tab" aria-selected={on === 'goal'} className={on === 'goal' ? 'on' : ''} onClick={() => go('/exams/goal')}>
        목표
      </button>
    </div>
  );
}
