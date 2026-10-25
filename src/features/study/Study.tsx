// 공부 도우미: 탭과 하위 화면 (설계 docs/superpowers/specs/2026-10-23-study-planner-design.md)
import { lazy, Suspense, useEffect, useState } from 'react';
import './study.css';
import { AddButton } from './Add';
import { pendingLocks, reviewCountToday } from './select';
import { putMany, useSaveFailed, useStudy, useWords } from './store';
import { useTimerAlarm, useTimerView } from './timerStore';
import { clock } from './timer';
import { Today } from './Today';
// 시험 화면은 오늘 화면(D-day)과 같이 쓰여 함께 받는다
import { Exams } from './Exams';
import { go, Icon, Toaster, useToday } from './ui';

// 오늘 화면 말고는 열 때 받는다 (처음 여는 속도)
const Books = lazy(() => import('./Books').then((m) => ({ default: m.Books })));
const Life = lazy(() => import('./Life').then((m) => ({ default: m.Life })));
const Review = lazy(() => import('./Review').then((m) => ({ default: m.Review })));
const Settings = lazy(() => import('./Settings').then((m) => ({ default: m.Settings })));
const Time = lazy(() => import('./Time').then((m) => ({ default: m.Time })));
const Preview = lazy(() => import('./Preview').then((m) => ({ default: m.Preview })));
const Translate = lazy(() => import('./Translate').then((m) => ({ default: m.Translate })));
const Tutors = lazy(() => import('./Tutors').then((m) => ({ default: m.Tutors })));
const Words = lazy(() => import('./Words').then((m) => ({ default: m.Words })));

const PRELOAD = [() => import('./Books'), () => import('./Life'), () => import('./Review'), () => import('./Settings'), () => import('./Time'), () => import('./Translate'), () => import('./Preview'), () => import('./Tutors'), () => import('./Words')];

import { TABS } from './tabs';
export { TABS };
/** 메뉴에는 없지만 열 수 있는 화면 (설정은 맨 위 막대의 톱니) */
const HIDDEN = ['settings'];

export function Study({ path, loggedIn, syncReady = true, onLogin }: { path: string[]; loggedIn: boolean; syncReady?: boolean; onLogin: () => void }) {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const tab = TABS.some((t) => t.key === path[0]) || HIDDEN.includes(path[0]) ? path[0] : 'today';
  const [, id, sub] = path;

  // 오늘 분량을 오늘 처음 볼 때 고정한다 (설계 §5.4)
  // 로그인했으면 서버 자료를 받은 뒤에 (옛 자료로 고정한 분량이 다른 기기의 것을 덮지 않게)
  useEffect(() => {
    if (!syncReady) return;
    const locks = pendingLocks(d, words, today);
    if (locks.length) putMany(locks.map((p) => ({ c: 'plans' as const, item: p as never })));
  }, [d, words, today, syncReady]);
  const saveFailed = useSaveFailed();
  // 다른 화면 코드는 잠시 뒤 미리 받아 둔다 (누를 때 「여는 중」이 오래 보이지 않게, 오프라인에서도 열리게)
  useEffect(() => {
    const t = setTimeout(() => {
      for (const load of PRELOAD) void load().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const reviewCount = reviewCountToday(d, today);
  const running = id && (sub === 'learn' || sub === 'prep' || sub === 'weak' || (tab === 'review' && (id === 'redo' || id?.startsWith('cards-run'))));

  let content;
  if (tab === 'books') content = <Books id={id} />;
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
      {!running && (
        <nav className="st-nav" aria-label="공부 메뉴">
          {TABS.filter((t) => t.key === 'today' || t.key === tab || !d.settings.hiddenTabs?.includes(t.key)).map((t) => (
            <button key={t.key} className={`st-tab ${tab === t.key ? 'on' : ''}`} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key === 'today' ? '/' : `/${t.key}`)}>
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
        {!loggedIn && tab === 'today' && <LoginHint onLogin={onLogin} />}
        {/* 주소가 바뀌면 화면을 새로 연다 (「＋」에서 같은 화면의 「새로 넣기」 창을 열 때도) */}
        <div className="st-page-wrap" key={path.join('/')}>
          <Suspense fallback={<p className="st-muted">여는 중…</p>}>{content}</Suspense>
        </div>
      </div>
      {!running && <AddButton today={today} />}
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
