// 「오늘」 화면 (설계 §7): 과외 숙제 → 문제집 오늘 분량 → 영단어 → 복습 → 할 일·습관 → 공부 시간
import { ExamToday } from './ExamPlan';
import { todayExamItems } from './examPlan';
import { useMemo, useState } from 'react';
import { addDays, dday, longDate, shortDate, weekStart } from './dates';
import { habitOn, streak, toggleHabit } from './habits';
import { alive, type Habit, type Todo } from './model';
import { rangeText } from './pages';
import { dueToday } from './review';
import { cardsToday, homeworkViews, planViews, wordListViews, type HomeworkView, type PlanView, type WordListView } from './select';
import { put, useStudy, useWords } from './store';
import { doneUpTo, finishPlan, markBook, markDays, markHwPages, patchHwItem, parseWrong, quickWrongNotes } from './actions';
import { minutesText } from './timer';
import { DdayHero } from './Exams';
import { forecastFor } from './forecast';
import { TaskCard, upcomingTasks } from './Assessments';
import { ConditionCard } from './ConditionCard';
import { classesOn } from './timetable';
import { PreviewRow, previewsForToday } from './Preview';
import { Bar, Check, Empty, go, Icon, SubjectDot, toast, useToday, tap } from './ui';

export function Today() {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const plans = useMemo(() => planViews(d, words, today), [d, words, today]);
  const hws = useMemo(() => homeworkViews(d, today).filter((h) => !h.finished || h.due >= today), [d, today]);
  const lists = useMemo(() => wordListViews(d, words, today, plans), [d, words, today, plans]);
  const bookPlans = plans.filter((p) => p.plan.target === 'book');
  // 오늘 할 것이 없는 단어 목록은 오늘 화면에 늘어놓지 않는다 (영단어 탭에서 볼 수 있다)
  const todayLists = lists.filter((l) => l.fresh.length + l.due.length > 0 || l.prep || paperDays(l));
  const notesDue = dueToday(alive(d.notes), today);
  const cardsDue = cardsToday(d, today);
  const todos = alive(d.todos)
    .filter((t) => (!t.done && (t.star || (t.due && t.due <= today))) || (t.done && t.doneAt && t.doneAt > Date.now() - 12 * 3600_000 && (t.star || (t.due && t.due <= today))))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9').localeCompare(b.due ?? '9'));
  const habits = alive(d.habits).filter((h) => !h.archived && habitOn(h, today));
  const previews = d.settings.hiddenTabs?.includes('preview') ? [] : previewsForToday(alive(d.previews), today);
  // 일주일 안에 낼 수행평가
  const tasks = upcomingTasks(alive(d.assessments), today).filter((a) => a.due <= addDays(today, 7));
  const classes = classesOn(d.settings.schoolTimetable, today).filter((id) => d.subjects[id] && !d.subjects[id].deleted);
  const weekday0 = new Date(`${today}T00:00:00Z`).getUTCDay();
  const studied = alive(d.sessions)
    .filter((s) => s.date === today)
    .reduce((a, s) => a + s.minutes, 0);

  // 진행: 체크할 수 있는 줄 수
  let total = 0;
  let done = 0;
  const count = (ok: boolean) => {
    total++;
    if (ok) done++;
  };
  for (const h of hws) for (const i of h.items) if (i.item.kind !== 'pages' || i.today.length || i.finished) count(i.finished || (i.item.kind === 'pages' && i.today.every((p) => !i.remaining.includes(p))));
  for (const p of bookPlans) if (p.sched.today.length) count(p.sched.today.every((x) => p.target.done.has(x)));
  for (const t of todos) count(t.done);
  for (const p of previews) count(p.done);
  for (const a of tasks) if (a.due <= addDays(today, 1)) count(false);
  for (const h of habits) count(h.checks.includes(today));
  const wordsLeft = lists.reduce((a, l) => a + l.fresh.length + l.due.length, 0);
  if (wordsLeft) count(false);
  if (notesDue.length + cardsDue.length) count(false);

  const examTodo = todayExamItems(d, today).some((x) => x.items.length > 0);
  const empty = !examTodo && !hws.length && !plans.length && !lists.length && !alive(d.notes).length && !alive(d.cards).length && !todos.length && !habits.length && !previews.length && !tasks.length;

  return (
    <div className="st-today">
      <DdayHero today={today} />
      <header className="st-today-head">
        <div>
          <h2>{longDate(today)}</h2>
          {total > 0 && (
            <p className="st-sub">
              {done === total ? '오늘 할 것 다 했어요' : `오늘 할 것 ${total - done}개 남음`} · 공부 {minutesText(studied)}
            </p>
          )}
        </div>
        {total > 0 && <Bar value={done} max={total} label="오늘 할 것" />}
      </header>

      {empty && (
        <Empty icon="📚" title="오늘 할 것이 아직 없어요">
          <p>문제집을 넣으면 시험(또는 정한 날)까지 하루 분량을 나눠 드려요. 숙제·단어·할 일은 ＋ 로 넣을 수 있어요.</p>
          <button className="btn btn-primary" onClick={() => go('/books/new')}>
            문제집 넣기
          </button>
        </Empty>
      )}

      {classes.length > 0 && (
        <p className="st-classes">
          오늘 수업: {classes.map((id) => d.subjects[id].name).join(' · ')}
        </p>
      )}

      {(weekday0 === 0 || weekday0 === 1) && (
        <button className="st-dday-empty" onClick={() => go(`/time/week-${weekday0 === 0 ? weekStart(today) : addDays(weekStart(today), -7)}`)}>
          {weekday0 === 0 ? '이번 주' : '지난주'} 돌아보기 <Icon name="chevron" />
        </button>
      )}

      {!d.settings.hiddenTabs?.includes('condition') && <ConditionCard today={today} />}

      {tasks.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">수행평가</h3>
          {tasks.map((a) => (
            <TaskCard key={a.id} a={a} today={today} compact onEdit={() => go('/exams/tasks')} />
          ))}
        </section>
      )}

      {previews.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">예습</h3>
          {previews.map((p) => (
            <PreviewRow key={p.id} p={p} today={today} onEdit={() => go('/preview')} />
          ))}
        </section>
      )}

      {hws.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">과외 숙제</h3>
          {hws.map((h) => (
            <HomeworkRow key={h.hw.id} h={h} today={today} />
          ))}
        </section>
      )}

      {bookPlans.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">문제집</h3>
          {bookPlans.map((p) => (
            <BookRow key={p.plan.id} p={p} today={today} />
          ))}
        </section>
      )}

      {todayLists.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">영단어</h3>
          {todayLists.map((l) => {
            const n = l.fresh.length + l.due.length;
            const paper = paperDays(l);
            return (
              <div key={l.list.id} className="st-item">
                {paper ? (
                  <Check on={l.todayDays.every((x) => l.plan?.target.done.has(x))} label="오늘 Day 다 했어요" onClick={() => markDays(l.list.id, l.todayDays, !l.todayDays.every((x) => l.plan?.target.done.has(x)))} />
                ) : (
                  <span className={`st-badge ${n ? '' : 'ok'}`}>{n ? n : '✓'}</span>
                )}
                <div className="st-item-main" {...tap(() => go(`/words/${l.list.id}/${n > 0 || !l.prep ? 'learn' : 'prep'}`))}>
                  <div className="st-item-title">
                    <SubjectDot id={l.list.subjectId} d={d} />
                    {l.list.name}
                    {l.todayDays.length > 0 && <span className="st-pill">Day {rangeText(l.todayDays)}</span>}
                    {l.prep && <span className="st-pill warn">시험 대비</span>}
                  </div>
                  <div className="st-item-sub">
                    {paper ? '종이 단어장 · 다 외우면 체크' : n ? `새 단어 ${l.fresh.length} · 복습 ${l.due.length}` : '오늘 분량 끝'}
                    {l.list.kind === 'test' && l.list.testDate && ` · 시험 ${shortDate(l.list.testDate)} ${dday(today, l.list.testDate)}`}
                  </div>
                </div>
                {(n > 0 || l.prep) && <Icon name="chevron" />}
              </div>
            );
          })}
        </section>
      )}

      {(notesDue.length > 0 || cardsDue.length > 0) && (
        <section className="st-card">
          <h3 className="st-h">오늘 복습</h3>
          <div className="st-item st-tap" {...tap(() => go(notesDue.length ? '/review/redo' : '/review/cards-run'))}>
            <span className="st-badge">{notesDue.length + cardsDue.length}</span>
            <div className="st-item-main">
              <div className="st-item-title">
                {notesDue.length > 0 && `오답 ${notesDue.length}문제`}
                {notesDue.length > 0 && cardsDue.length > 0 && ' · '}
                {cardsDue.length > 0 && `암기 카드 ${cardsDue.length}장`}
              </div>
              <div className="st-item-sub">답을 가리고 먼저 떠올려 보세요</div>
            </div>
            <Icon name="chevron" />
          </div>
        </section>
      )}

      {(todos.length > 0 || habits.length > 0) && (
        <section className="st-card">
          <h3 className="st-h">할 일 · 습관</h3>
          {todos.map((t) => (
            <TodoRow key={t.id} t={t} today={today} />
          ))}
          {habits.map((h) => (
            <HabitRow key={h.id} h={h} today={today} />
          ))}
        </section>
      )}

      <ExamToday today={today} />

      {bookPlans.length > 0 && <Week plans={bookPlans} today={today} />}
    </div>
  );
}

/** 단어를 넣지 않은 Day(종이 단어장)만 오늘 분량인지 */
const paperDays = (l: WordListView) => l.list.kind === 'book' && l.todayDays.length > 0 && l.todayDays.every((x) => !l.words.some((w) => w.day === x));

function HomeworkRow({ h, today }: { h: HomeworkView; today: string }) {
  const d = useStudy();
  const late = h.due < today && !h.finished;
  return (
    <div className={`st-hw ${late ? 'late' : ''}`}>
      <div className="st-hw-head">
        <SubjectDot id={h.subjectId} d={d} />
        <b>{h.tutorName}</b>
        <span className={`st-pill ${late ? 'bad' : h.due === today ? 'warn' : ''}`}>
          {late ? '밀린 숙제 · ' : ''}마감 {shortDate(h.due)}
        </span>
      </div>
      {h.items.map(({ item, today: tp, remaining, finished }) => {
        if (item.kind === 'pages') {
          const todayDone = tp.length === 0 || tp.every((p) => !remaining.includes(p));
          return (
            <div key={item.id} className="st-item">
              <Check on={finished || todayDone} label="오늘 분량 했어요" onClick={() => markHwPages(h.hw, item, tp.length ? tp : remaining, !(finished || todayDone))} />
              <div className="st-item-main">
                <div className="st-item-title">
                  {item.bookName ?? (item.bookId ? d.books[item.bookId]?.name : '')} {tp.length ? `p.${rangeText(tp)}` : finished ? '끝' : ''}
                </div>
                <div className="st-item-sub">
                  전체 p.{item.range && rangeText([item.range])} · {finished ? '다 했어요' : `남은 ${remaining.length}쪽`}
                  {item.question && ` · 질문: ${item.question}`}
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={item.id} className="st-item">
            <Check on={!!item.done} label="다 했어요" onClick={() => patchHwItem(h.hw.id, item.id, { done: !item.done })} />
            <div className="st-item-main">
              <div className={`st-item-title ${item.done ? 'done' : ''}`}>{item.text}</div>
              {item.question && <div className="st-item-sub">질문: {item.question}</div>}
            </div>
            {item.kind === 'words' && item.wordListId && (
              <button className="st-iconbtn" aria-label="외우기" onClick={() => go(`/words/${item.wordListId}/learn`)}>
                <Icon name="chevron" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BookRow({ p, today }: { p: PlanView; today: string }) {
  const d = useStudy();
  const { sched, plan } = p;
  // 줄을 누르면 그 문제집에 할 수 있는 일이 나타난다 (체크하면 「틀린 번호」 칸이 바로 열린다)
  const [open, setOpen] = useState(false);
  const [upTo, setUpTo] = useState('');
  const [wrong, setWrong] = useState('');
  const doneToday = sched.today.length > 0 && sched.today.every((x) => p.target.done.has(x));
  const book = d.books[plan.targetId];
  const unitNames = [...new Set(sched.today.map((x) => book.units.find((u) => x >= u.from && x <= u.to)?.name).filter(Boolean))];
  const unitEnd = sched.today.length > 0 && book.units.some((u) => u.to === sched.today[sched.today.length - 1]);
  const toggle = () => {
    markBook(book.id, sched.today, !doneToday);
    if (!doneToday) setOpen(true);
  };
  return (
    <div className="st-item-wrap">
      <div className="st-item">
        {sched.today.length ? <Check on={doneToday} onClick={toggle} label="오늘 분량 다 했어요" /> : <span className="st-badge ok">–</span>}
        <div className="st-item-main" {...tap(() => setOpen(!open))} aria-expanded={open}>
          <div className={`st-item-title ${doneToday ? 'done' : ''}`}>
            <SubjectDot id={book.subjectId} d={d} />
            {book.name} {sched.today.length > 0 && <span className="st-pages">p.{rangeText(sched.today)}</span>}
          </div>
          <div className="st-item-sub">
            {sched.today.length === 0 ? (!sched.remaining.length ? '다 끝났어요' : sched.warning?.kind === 'ended' ? '시험 끝' : plan.start > today ? `${shortDate(plan.start)}부터 시작` : '오늘은 쉬는 날') : `${sched.today.length}쪽${unitNames.length ? ' · ' + unitNames.join(', ') : ''}${unitEnd ? ' · 단원 끝' : ''}`}
            {sched.end && ` · ${shortDate(sched.end)}까지 ${sched.remaining.length}쪽`}
          </div>
          {(() => {
            // 요즘 속도로는 마감까지 못 끝낼 것 같으면 미리 알린다
            const f = forecastFor(d, p, today);
            return f.state === 'short' ? <div className="st-note">요즘 하루 {f.perDay}쪽으로는 {f.shortDays}일 모자라요. 하루 {f.need}쪽씩 해야 해요</div> : null;
          })()}
          {plan.carried?.date === today && <div className="st-note">지난번 {plan.carried.count}쪽이 남아서 남은 날에 나눠 넣었어요</div>}
          {sched.warning && <PlanWarning p={p} />}
        </div>
      </div>
      {open && (
        <div className="st-actions">
          {doneToday ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const nums = parseWrong(wrong);
                if (nums.length) {
                  quickWrongNotes(book.subjectId, book.id, nums, today);
                  toast(`오답 ${nums.length}문제를 넣었어요. 내일 다시 풀어요`);
                }
                setWrong('');
                setOpen(false);
              }}
            >
              <input autoFocus className="st-input sm" placeholder="틀린 번호 (예: p.37 3번 7번) · 없으면 비워 두세요" value={wrong} onChange={(e) => setWrong(e.target.value)} aria-label="틀린 문제 번호" />
            </form>
          ) : (
            sched.today.length > 1 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(upTo);
                  if (!n) return;
                  doneUpTo(book.id, sched.today, n);
                  setUpTo('');
                  toast(`p.${n}까지 체크했어요`);
                }}
              >
                <input className="st-input sm" inputMode="numeric" placeholder={`어디까지 풀었나요? (예: ${sched.today[Math.floor(sched.today.length / 2)]})`} value={upTo} onChange={(e) => setUpTo(e.target.value.replace(/\D/g, ''))} aria-label="몇 쪽까지 풀었나요" />
              </form>
            )
          )}
          <button className="st-link" onClick={() => go(`/books/${book.id}`)}>
            문제집 보기
          </button>
        </div>
      )}
    </div>
  );
}

export function PlanWarning({ p }: { p: PlanView }) {
  const w = p.sched.warning!;
  const text =
    w.kind === 'ended'
      ? `시험(${shortDate(w.due)})이 끝났어요. 남은 ${p.sched.remaining.length}쪽은 어떻게 할까요?`
      : w.kind === 'overdue'
        ? `마감(${shortDate(w.due)})이 지났어요. 남은 ${p.sched.remaining.length}쪽`
        : w.kind === 'nodays'
          ? '마감까지 공부하는 날이 없어요'
          : w.kind === 'max'
            ? `하루 ${w.perDay}쪽이 필요해요 (정한 최대 ${w.max}쪽)`
            : `하루 ${w.perDay}쪽이 필요해요 (처음 계획 ${w.baseline}쪽)`;
  const late = w.kind === 'ended' || w.kind === 'overdue';
  return (
    <div className="st-warn" role="alert">
      {text}{' '}
      {late && (
        <button
          className="st-link"
          onClick={(e) => {
            e.stopPropagation();
            finishPlan(p.plan.id);
            toast('계획을 끝냈어요. 진도는 그대로 남아요');
          }}
        >
          계획 끝내기
        </button>
      )}
      {late && ' · '}
      <button className="st-link" onClick={(e) => (e.stopPropagation(), go(`/books/${p.plan.targetId}`))}>
        {late ? '날짜 늘리기' : '계획 고치기'}
      </button>
    </div>
  );
}

function TodoRow({ t, today }: { t: Todo; today: string }) {
  return (
    <div className="st-item">
      <Check on={t.done} label="했어요" onClick={() => put('todos', { ...t, done: !t.done, doneAt: t.done ? undefined : Date.now() })} />
      <div className="st-item-main">
        <div className={`st-item-title ${t.done ? 'done' : ''}`}>
          {t.star && '★ '}
          {t.title}
        </div>
        {t.due && <div className={`st-item-sub ${t.due < today && !t.done ? 'bad' : ''}`}>{t.due < today ? `${shortDate(t.due)} 마감 지남` : t.due === today ? '오늘 마감' : shortDate(t.due)}</div>}
      </div>
    </div>
  );
}

function HabitRow({ h, today }: { h: Habit; today: string }) {
  const on = h.checks.includes(today);
  const s = streak(h, today);
  return (
    <div className="st-item">
      <Check on={on} label={`${h.name} 했어요`} onClick={() => put('habits', toggleHabit(h, today))} />
      <div className="st-item-main">
        <div className={`st-item-title ${on ? 'done' : ''}`}>
          {h.icon} {h.name}
        </div>
        <div className="st-item-sub">{s > 0 ? `${s}일 연속` : '오늘부터 시작'}</div>
      </div>
    </div>
  );
}

/** 다음 7일 미리 보기 */
function Week({ plans, today }: { plans: PlanView[]; today: string }) {
  const d = useStudy();
  const [open, setOpen] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
  return (
    <section className="st-card">
      <button className="st-fold" onClick={() => setOpen(!open)} aria-expanded={open}>
        다음 7일 미리 보기 <span className={`st-fold-icon ${open ? 'open' : ''}`}><Icon name="chevron" /></span>
      </button>
      {open && (
        <div className="st-week">
          {days.map((day) => {
            const rows = plans.map((p) => ({ p, items: p.sched.days.find((x) => x.date === day)?.items ?? [] })).filter((r) => r.items.length);
            return (
              <div key={day} className="st-week-day">
                <b>{shortDate(day)}</b>
                {rows.length ? (
                  rows.map((r) => (
                    <span key={r.p.plan.id}>
                      <SubjectDot id={r.p.subjectId} d={d} />
                      {r.p.name} p.{rangeText(r.items)}
                    </span>
                  ))
                ) : (
                  <span className="st-muted">쉬는 날</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

