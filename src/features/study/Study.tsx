// 공부 도우미: 탭과 하위 화면 (설계 docs/superpowers/specs/2026-10-23-study-planner-design.md)
import { dueTodoRules } from './todoRules';
import { pendingExamLocks } from './examPlan';
import { lazy, Suspense, useEffect, useState } from 'react';
import './study.css';
import { AddButton } from './Add';
import { pendingLocks, reviewCountToday } from './select';
import { putMany, useSaveFailed, useStudy, useWords } from './store';
import { useTimerAlarm, useTimerView } from './timerStore';
import { clock } from './timer';
import { Today } from './Today';
import { localTimes, uploadDigest } from './notify';
import { dueRuleTx } from '../life/calc';
// 시험 화면은 오늘 화면(D-day)과 같이 쓰여 함께 받는다
import { Exams } from './Exams';
import { go, Icon, Toaster, useToday } from './ui';

// 오늘 화면 말고는 열 때 받는다 (처음 여는 속도)
const Books = lazy(() => import('./Books').then((m) => ({ default: m.Books })));
const Life = lazy(() => import('./Life').then((m) => ({ default: m.Life })));
const Review = lazy(() => import('./Review').then((m) => ({ default: m.Review })));
const Settings = lazy(() => import('./Settings').then((m) => ({ default: m.Settings })));
const Time = lazy(() => import('./Time').then((m) => ({ default: m.Time })));
const Home = lazy(() => import('../life/Home').then((m) => ({ default: m.Home })));
const Fitness = lazy(() => import('../life/Fitness').then((m) => ({ default: m.Fitness })));
const Money = lazy(() => import('../life/Money').then((m) => ({ default: m.Money })));
const Hobby = lazy(() => import('../life/Hobby').then((m) => ({ default: m.Hobby })));
const Movies = lazy(() => import('../life/Movies').then((m) => ({ default: m.Movies })));
const Search = lazy(() => import('../life/Search').then((m) => ({ default: m.Search })));
const LifeWeekPage = lazy(() => import('../life/LifeWeek').then((m) => ({ default: m.LifeWeekPage })));
const Diary = lazy(() => import('../life/Diary').then((m) => ({ default: m.Diary })));
const Preview = lazy(() => import('./Preview').then((m) => ({ default: m.Preview })));
const Translate = lazy(() => import('./Translate').then((m) => ({ default: m.Translate })));
const Tutors = lazy(() => import('./Tutors').then((m) => ({ default: m.Tutors })));
const Words = lazy(() => import('./Words').then((m) => ({ default: m.Words })));

const PRELOAD = [() => import('../life/Home'), () => import('../life/Fitness'), () => import('../life/Money'), () => import('../life/Hobby'), () => import('../life/Movies'), () => import('../life/Diary'), () => import('./Books'), () => import('./Life'), () => import('./Review'), () => import('./Settings'), () => import('./Time'), () => import('./Translate'), () => import('./Preview'), () => import('./Tutors'), () => import('./Words')];

import { activeItem, AREA_ITEMS, AREAS, TABS, type AreaKey } from './tabs';
export { TABS };
/** 메뉴에는 없지만 열 수 있는 화면 (설정은 맨 위 막대의 톱니) */
const HIDDEN = ['settings'];

export function Study({ path, loggedIn, syncReady = true, onLogin }: { path: string[]; loggedIn: boolean; syncReady?: boolean; onLogin: () => void }) {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  // 영역: 주소 맨 앞이 없으면 메인, fitness·money·hobby·movies 면 그 영역, 그 밖(study·공부 칸들·설정)은 공부
  const p0 = path[0];
  const isSearch = p0 === 'search';
  const isWeek = p0 === 'week';
  const area: AreaKey = !p0 || isSearch || isWeek ? 'home' : (AREAS.some((a) => a.key === p0) && p0 !== 'study' ? p0 : 'study') as AreaKey;
  const spath = p0 === 'study' ? path.slice(1) : path;
  const tab = area !== 'study' ? '' : TABS.some((t) => t.key === spath[0]) || HIDDEN.includes(spath[0]) ? spath[0] : 'today';
  const [, id, sub] = area === 'study' ? spath : path;

  // 오늘 분량을 오늘 처음 볼 때 고정한다 (설계 §5.4)
  // 로그인했으면 서버 자료를 받은 뒤에 (옛 자료로 고정한 분량이 다른 기기의 것을 덮지 않게)
  useEffect(() => {
    if (!syncReady) return;
    const locks = pendingLocks(d, words, today);
    if (locks.length) putMany(locks.map((p) => ({ c: 'plans' as const, item: p as never })));
  }, [d, words, today, syncReady]);
  // 시험 공부 계획: 오늘 할 것을 오늘 처음 볼 때 고정한다 (오늘 동안 바뀌지 않게)
  useEffect(() => {
    if (!syncReady) return;
    const locks = pendingExamLocks(d, today);
    if (locks.length) putMany(locks.map((e) => ({ c: 'exams' as const, item: e as never })));
  }, [d, today, syncReady]);
  // 반복 할 일: 오늘 것을 만든다
  useEffect(() => {
    if (!syncReady) return;
    const due = dueTodoRules(d, today);
    if (due.length) putMany(due.map((t) => ({ c: 'todos' as const, item: t as never })));
  }, [d, today, syncReady]);
  // 고정 지출·수입: 날이 된 것을 자동으로 넣는다 (같은 날·같은 규칙은 같은 id 라 두 기기에서 넣어도 하나)
  useEffect(() => {
    if (!syncReady) return;
    const due = dueRuleTx(d, today);
    if (due.length) putMany(due.map((t) => ({ c: 'moneyTx' as const, item: t as never })));
  }, [d, today, syncReady]);
  // 알림을 켜 둔 기기: 자료가 바뀌면 잠시 뒤 알림 글을 다시 올린다
  useEffect(() => {
    if (!loggedIn || !localTimes()) return;
    const t = setTimeout(() => void uploadDigest().catch(() => {}), 5000);
    return () => clearTimeout(t);
  }, [d, words, today, loggedIn]);
  const saveFailed = useSaveFailed();
  // 다른 화면 코드는 잠시 뒤 미리 받아 둔다 (누를 때 「여는 중」이 오래 보이지 않게, 오프라인에서도 열리게)
  useEffect(() => {
    const t = setTimeout(() => {
      for (const load of PRELOAD) void load().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const reviewCount = reviewCountToday(d, today);
  const running = id && (sub === 'learn' || sub === 'prep' || sub === 'weak' || (tab === 'review' && (id === 'redo' || id?.startsWith('cards-run') || id?.startsWith('blank-run'))));

  let content;
  if (isWeek) content = <LifeWeekPage day={path[1]} />;
  else if (isSearch) content = <Search q0={path[1] ? decodeURIComponent(path[1]) : ''} />;
  else if (area === 'home') content = <Home loggedIn={loggedIn} onLogin={onLogin} />;
  else if (area === 'fitness') content = <Fitness sub={path[1]} sub2={path[2]} />;
  else if (area === 'money') content = <Money sub={path[1]} />;
  else if (area === 'hobby') content = <Hobby sub={path[1]} sub2={path[2]} />;
  else if (area === 'movies') content = <Movies sub={path[1]} />;
  else if (area === 'diary') content = <Diary sub={path[1]} />;
  else if (tab === 'books') content = <Books id={id} sub={sub} />;
  else if (tab === 'tutor') content = <Tutors sub={id} />;
  else if (tab === 'words') content = <Words id={id} sub={sub} />;
  else if (tab === 'review') content = <Review sub={id} />;
  else if (tab === 'time') content = <Time sub={id} />;
  else if (tab === 'life') content = <Life sub={id} />;
  else if (tab === 'settings') content = <Settings />;
  else if (tab === 'preview') content = <Preview sub={id} />;
  else if (tab === 'translate') content = <Translate loggedIn={loggedIn} onLogin={onLogin} />;
  else if (tab === 'exams') content = <Exams id={id} sub={sub} />;
  else content = <Today />;

  return (
    <main className={`study ${running ? 'running' : ''}`}>
      {!running && area === 'home' && (
        <nav className="st-nav" aria-label="영역">
          {AREAS.filter((a) => a.key === 'home' || !d.settings.hiddenAreas?.includes(a.key)).map((a) => (
            <button key={a.key} className={`st-tab ${area === a.key ? 'on' : ''}`} aria-current={area === a.key ? 'page' : undefined} onClick={() => go(a.key === 'home' ? '/' : `/${a.key}`)}>
              <Icon name={`area-${a.key}`} />
              <span className="st-tab-label">{a.label}</span>
              <span className="st-tab-short">{a.label}</span>
            </button>
          ))}
        </nav>
      )}
      {!running && area !== 'home' && area !== 'study' && (
        <nav className="st-nav" aria-label={`${AREAS.find((a) => a.key === area)?.label} 메뉴`}>
          <button className="st-tab st-tab-home" onClick={() => go('/')}>
            <Icon name="area-home" />
            <span className="st-tab-label">메인으로</span>
            <span className="st-tab-short">메인</span>
          </button>
          {AREA_ITEMS[area].map((it) => {
            const on = activeItem(area, path[1]) === it.key;
            return (
              <button key={it.key} className={`st-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => go(it.key ? `/${area}/${it.key}` : `/${area}`)}>
                <Icon name={it.icon} />
                <span className="st-tab-label">{it.label}</span>
                <span className="st-tab-short">{it.label}</span>
              </button>
            );
          })}
        </nav>
      )}
      {!running && area === 'study' && (
        <nav className="st-nav" aria-label="공부 메뉴">
          <button className="st-tab st-tab-home" onClick={() => go('/')}>
            <Icon name="area-home" />
            <span className="st-tab-label">메인으로</span>
            <span className="st-tab-short">메인</span>
          </button>
          {TABS.filter((t) => t.key === 'today' || t.key === tab || !d.settings.hiddenTabs?.includes(t.key)).map((t) => (
            <button key={t.key} className={`st-tab ${tab === t.key ? 'on' : ''}`} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key === 'today' ? '/study' : `/${t.key}`)}>
              <Icon name={t.key} />
              <span className="st-tab-label">{t.label}</span>
              <span className="st-tab-short">{'short' in t ? t.short : t.label}</span>
              {t.key === 'review' && reviewCount > 0 && <b className="st-count">{reviewCount}</b>}
              {t.key === 'time' && tab !== 'time' && <TimerChip />}
            </button>
          ))}
        </nav>
      )}
      <div className="st-main">
        {saveFailed && (
          <div className="st-banner bad" role="alert">
            이 기기의 저장 공간이 꽉 차서 방금 고친 것을 저장하지 못했어요. 새로 고치면 사라질 수 있으니 설정에서 백업 파일을 내려받고, 쓰지 않는 단어 목록을 지워 주세요.
          </div>
        )}
        {!loggedIn && (tab === 'today' || area === 'home') && <LoginHint onLogin={onLogin} />}
        {/* 주소가 바뀌면 화면을 새로 연다 (「＋」에서 같은 화면의 「새로 넣기」 창을 열 때도) */}
        <div className="st-page-wrap" key={path.join('/')}>
          <Suspense fallback={<p className="st-muted">여는 중…</p>}>{content}</Suspense>
        </div>
      </div>
      {!running && area === 'study' && <AddButton today={today} tab={tab} />}
      <Toaster />
      <TimerAlarm />
    </main>
  );
}

/** 타이머 알림·탭 제목 (1초마다 다시 그려지는 것은 이 부품뿐) */
function TimerAlarm() {
  useTimerAlarm();
  return null;
}

/** 메뉴의 「기록」 옆 남은 시간 */
function TimerChip() {
  const { timer, v } = useTimerView();
  return timer && v ? <b className="st-timechip">{clock(v.shownMs)}</b> : null;
}

function LoginHint({ onLogin }: { onLogin: () => void }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('my-study.study.login-hint') === 'off';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <div className="st-banner">
      <span>
        지금은 이 기기에만 저장돼요.{' '}
        <button className="st-link" onClick={onLogin}>
          로그인
        </button>
        하면 폰·PC 에서 같이 볼 수 있어요.
      </span>
      <button
        className="st-x"
        aria-label="닫기"
        onClick={() => {
          try {
            localStorage.setItem('my-study.study.login-hint', 'off');
          } catch {
            /* 무시 */
          }
          setHidden(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
