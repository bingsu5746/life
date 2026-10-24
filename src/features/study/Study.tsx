// 📚 공부 도우미: 탭과 하위 화면 (설계 docs/superpowers/specs/2026-10-23-study-planner-design.md)
import { useEffect, useState } from 'react';
import './study.css';
import { Books } from './Books';
import { Life } from './Life';
import { alive } from './model';
import { Review } from './Review';
import { dueToday } from './review';
import { pendingLocks } from './select';
import { Settings } from './Settings';
import { putMany, useStudy, useWords } from './store';
import { Time } from './Time';
import { Today } from './Today';
import { Tutors } from './Tutors';
import { go, Toaster, useToday } from './ui';
import { Words } from './Words';

const TABS = [
  { key: 'today', icon: '☀️', label: '오늘' },
  { key: 'books', icon: '📖', label: '문제집' },
  { key: 'tutor', icon: '🧑‍🏫', label: '과외' },
  { key: 'words', icon: '🔤', label: '영단어' },
  { key: 'review', icon: '🔁', label: '복습' },
  { key: 'time', icon: '⏱', label: '기록' },
  { key: 'life', icon: '✅', label: '할 일·습관', short: '할 일' },
  { key: 'settings', icon: '⚙️', label: '설정' },
] as const;

export function Study({ path, loggedIn, onLogin }: { path: string[]; loggedIn: boolean; onLogin: () => void }) {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const tab = TABS.some((t) => t.key === path[0]) ? path[0] : 'today';
  const [, id, sub] = path;

  // 오늘 분량을 오늘 처음 볼 때 고정한다 (설계 §5.4)
  useEffect(() => {
    const locks = pendingLocks(d, words, today);
    if (locks.length) putMany(locks.map((p) => ({ c: 'plans' as const, item: p as never })));
  }, [d, words, today]);

  const reviewCount = dueToday(alive(d.notes), today).length + dueToday(alive(d.cards), today).length;
  const running = id && (sub === 'learn' || sub === 'prep' || sub === 'weak' || (tab === 'review' && (id === 'redo' || id?.startsWith('cards-run'))));

  let content;
  if (tab === 'books') content = <Books id={id} />;
  else if (tab === 'tutor') content = <Tutors />;
  else if (tab === 'words') content = <Words id={id} sub={sub} />;
  else if (tab === 'review') content = <Review sub={id} />;
  else if (tab === 'time') content = <Time />;
  else if (tab === 'life') content = <Life />;
  else if (tab === 'settings') content = <Settings />;
  else content = <Today />;

  return (
    <main className={`study ${running ? 'running' : ''}`}>
      {!running && (
        <nav className="st-nav" aria-label="공부 메뉴">
          {TABS.map((t) => (
            <button key={t.key} className={`st-tab ${tab === t.key ? 'on' : ''}`} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key === 'today' ? '/' : `/${t.key}`)}>
              <span className="st-tab-icon" aria-hidden>
                {t.icon}
              </span>
              <span className="st-tab-label">{t.label}</span>
              <span className="st-tab-short">{'short' in t ? t.short : t.label}</span>
              {t.key === 'review' && reviewCount > 0 && <b className="st-count">{reviewCount}</b>}
            </button>
          ))}
        </nav>
      )}
      <div className="st-main">
        {!loggedIn && tab === 'today' && <LoginHint onLogin={onLogin} />}
        {content}
      </div>
      <Toaster />
    </main>
  );
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
      <span>로그인하면 폰·PC 에서 같은 공부 계획을 볼 수 있어요. 지금은 이 기기에만 저장돼요.</span>
      <button className="btn btn-sm btn-primary" onClick={onLogin}>
        로그인
      </button>
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
