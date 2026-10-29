// 메인: 공부 · 운동 · 돈 · 취미 · 일기를 한눈에. 누르면 그 영역으로
import { exportBackup } from '../study/backup';
import { addDays, dday, longDate, weekStart, weekday } from '../study/dates';
import { upcomingExams } from '../study/exams';
import { alive } from '../study/model';
import { todaySummary } from '../study/select';
import { put, useStudy, useWords } from '../study/store';
import { useEffect, useState } from 'react';
import { DEFAULT_PLACE, getWeather, weatherText, type Weather } from './weather';
import { minutesText } from '../study/timer';
import { AREAS } from '../study/tabs';
import { go, Icon, useToday } from '../study/ui';
import { dayStreak, hobbyWeek, monthOf, monthSummary, weekWorkouts, won, workoutStreak } from './calc';

export function Home(_: { loggedIn: boolean; onLogin: () => void }) {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const hidden = d.settings.hiddenAreas ?? [];
  const show = (k: string) => !hidden.includes(k);

  // 공부
  const sum = todaySummary(d, words, today);
  const exam = upcomingExams(d, today)[0];
  const studied = alive(d.sessions)
    .filter((s) => s.date === today)
    .reduce((a, s) => a + s.minutes, 0);
  // 운동
  const ws = weekStart(today);
  const wk = weekWorkouts(d, ws);
  const wkDays = new Set(wk.map((w) => w.date)).size;
  const goal = d.settings.fitnessGoal?.perWeek;
  const didToday = wk.some((w) => w.date === today);
  // 돈
  const ms = monthSummary(d, monthOf(today));
  const budget = d.settings.monthlyBudget;
  // 취미
  const hw = hobbyWeek(alive(d.hobbyLogs), ws);
  const hobbyMin = [...hw.values()].reduce((a, b) => a + b, 0);
  const doing = alive(d.wishes).filter((w) => w.status === 'doing');
  // 영화
  const movies = alive(d.movies);
  const seen = movies.filter((m) => m.status === 'watched');
  const nextOpen = movies.filter((m) => m.status === 'want' && m.release && m.release >= today).sort((a, b) => a.release!.localeCompare(b.release!))[0];
  // 일기
  const diaryToday = d.diary[today] && !d.diary[today].deleted;
  const diaryMonth = alive(d.diary).filter((e) => monthOf(e.id) === monthOf(today)).length;

  const cards: Record<
    string,
    {
      lines: string[];
      action?: { label: string; to: string };
      badge?: { big: string; small: string };
      streak?: number;
    }
  > = {
    study: {
      lines: [sum.total ? (sum.left ? `오늘 할 것 ${sum.left}개 남음` : '오늘 할 것 다 했어요') : '오늘 정해 둔 공부가 없어요', `오늘 공부 ${minutesText(studied)}`],
      badge: exam ? { big: dday(today, exam.date), small: exam.name } : undefined,
      streak: dayStreak(
        alive(d.sessions)
          .filter((s) => s.minutes > 0)
          .map((s) => s.date),
        today,
      ),
    },
    fitness: {
      lines: [`이번 주 ${wkDays}${goal ? `/${goal}` : ''}일 운동`, didToday ? '오늘 운동했어요' : workoutStreak(alive(d.workouts), today) ? `${workoutStreak(alive(d.workouts), today)}일 연속` : '오늘은 아직 안 했어요'],
      action: didToday ? undefined : { label: '운동 넣기', to: '/fitness/new' },
      streak: workoutStreak(alive(d.workouts), today),
    },
    money: {
      lines: [`이번 달 쓴 돈 ${won(ms.out)}`, budget ? (budget - ms.out >= 0 ? `예산 ${won(budget - ms.out)} 남음` : `예산 ${won(ms.out - budget)} 넘음`) : ''].filter(Boolean),
      action: { label: '쓴 것 적기', to: '/money/new' },
    },
    hobby: {
      lines: [
        `이번 주 취미 ${minutesText(hobbyMin)}`,
        [seen.length ? `본 영화 ${seen.length}편` : '', alive(d.records).filter((r) => r.status === 'have').length ? `LP·음반 ${alive(d.records).filter((r) => r.status === 'have').length}장` : '', alive(d.games).filter((g) => g.status === 'playing').length ? `하는 게임 ${alive(d.games).filter((g) => g.status === 'playing').length}개` : ''].filter(Boolean).join(' · '),
        doing.length
          ? `하는 중: ${doing
              .slice(0, 2)
              .map((w) => w.title)
              .join(', ')}`
          : '',
      ].filter(Boolean),
      badge: nextOpen ? { big: dday(today, nextOpen.release!), small: nextOpen.title } : undefined,
    },
    movies: {
      lines: [`본 영화 ${seen.length}편 · 올해 ${seen.filter((m) => m.watched?.startsWith(today.slice(0, 4))).length}편`, `보고 싶어요 ${movies.length - seen.length}편`],
      badge: nextOpen ? { big: dday(today, nextOpen.release!), small: nextOpen.title } : undefined,
      action: { label: '극장가', to: '/movies' },
    },
    diary: {
      lines: [diaryToday ? '오늘 일기를 썼어요' : '오늘 일기를 아직 안 썼어요', `이번 달 ${diaryMonth}편`],
      streak: dayStreak(
        alive(d.diary).map((e) => e.id),
        today,
      ),
      action: {
        label: diaryToday ? '오늘 일기 보기' : '오늘 일기 쓰기',
        to: `/diary/${today}`,
      },
    },
  };

  return (
    <div className="hm">
      <header className="hm-head">
        <div className="hm-top">
          <h2>{longDate(today)}</h2>
          <WeatherChip />
        </div>
        <p className="st-sub">
          오늘도 하나씩 해 봐요 ·{' '}
          <button className="st-link" onClick={() => go('/week')}>
            이번 주 돌아보기
          </button>{' '}
          ·{' '}
          <button className="st-link" onClick={() => go('/checkin')}>
            하루 마감
          </button>{' '}
          ·{' '}
          <button className="st-link" onClick={() => go('/insights')}>
            자세히 보기
          </button>
        </p>
      </header>
      <ChangeBanner today={today} />
      <div className="hm-grid">
        {AREAS.filter((a) => a.key !== 'home' && show(a.key)).map((a) => {
          const c = cards[a.key];
          return (
            <section key={a.key} className="hm-card">
              <button className="hm-main" onClick={() => go(`/${a.key}`)}>
                <span className="hm-title">
                  <Icon name={`area-${a.key}`} /> {a.label}
                  {(c.streak ?? 0) >= 2 && (
                    <span className="hm-streak" title={`${c.streak}일 연속`}>
                      🔥 {c.streak}
                    </span>
                  )}
                </span>
                {c.badge && (
                  <span className="hm-dday">
                    <b>{c.badge.big}</b>
                    <small>{c.badge.small}</small>
                  </span>
                )}
                {c.lines.map((l, i) => (
                  <span key={i} className={i === 0 ? 'hm-big' : 'hm-line'}>
                    {l}
                  </span>
                ))}
              </button>
              {c.action && (
                <button className="btn btn-sm hm-act" onClick={() => go(c.action!.to)}>
                  {c.action.label}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {(() => {
        const last = d.settings.lastBackup;
        const days = last ? Math.floor((Date.parse(today) - Date.parse(last)) / 86_400_000) : null;
        if (days !== null && days < 30) return null;
        return (
          <p className="st-hint">
            {days === null ? '아직 백업 파일을 내려받은 적이 없어요.' : `백업한 지 ${days}일 지났어요.`}{' '}
            <button className="st-link" onClick={() => exportBackup()}>
              지금 내려받기
            </button>
          </p>
        );
      })()}
      <p className="st-hint">메인에 보일 영역은 설정에서 고를 수 있어요.</p>
    </div>
  );
}

/** 지난주에 정한 「이번 주에 바꿀 한 가지」. 주말이면 지켰는지 묻는다 */
function ChangeBanner({ today }: { today: string }) {
  const d = useStudy();
  const note = d.weekNotes[addDays(weekStart(today), -7)];
  if (!note || note.deleted || !note.change) return null;
  const weekend = weekday(today) === 6 || weekday(today) === 0;
  return (
    <section className="hm-change">
      <small>이번 주에 바꿀 한 가지</small>
      <b>{note.change}</b>
      {note.kept !== undefined ? (
        <small className="st-muted">{note.kept ? '지켰어요 ✓' : '다음 주에 다시 해 봐요'}</small>
      ) : (
        weekend && (
          <div className="st-inline">
            <span className="st-muted">지켰나요?</span>
            <button className="btn btn-sm btn-primary" onClick={() => put('weekNotes', { ...note, kept: true })}>
              지켰어요
            </button>
            <button className="btn btn-sm" onClick={() => put('weekNotes', { ...note, kept: false })}>
              못 지켰어요
            </button>
          </div>
        )
      )}
    </section>
  );
}

/** 오늘 날씨 (지금 기온 · 최고/최저 · 비 올 확률) */
function WeatherChip() {
  const d = useStudy();
  const p = d.settings.weatherPlace ?? DEFAULT_PLACE;
  const [w, setW] = useState<Weather | null>(null);
  useEffect(() => {
    let on = true;
    getWeather(p.lat, p.lon)
      .then((x) => on && setW(x))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [p.lat, p.lon]);
  if (!w) return null;
  const t = weatherText(w.code);
  return (
    <div className="hm-weather" title={`${p.name} · Open-Meteo`}>
      <span className="hm-weather-icon" aria-hidden>
        {t.icon}
      </span>
      <b>{w.temp}°</b>
      <small>
        {t.text} · {w.max}° / {w.min}°{w.rain !== null && w.rain >= 30 ? ` · 비 ${w.rain}%` : ''}
      </small>
    </div>
  );
}
