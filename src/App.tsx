// Life: 맨 위 막대(이름·로그인) + 메인(공부·운동·돈·취미·일기)과 각 영역 화면 (src/features/study/Study.tsx)
import { useEffect, useState } from 'react';
import { AccountSheet } from './features/auth/AccountSheet';
import { LoginModal } from './features/auth/LoginModal';
import { getSyncStatus, onSyncStatus, syncAll, type SyncStatus } from './features/auth/sync';
import { displayName, useAuth } from './features/auth/useAuth';
import { isLoggedIn } from './features/auth/api';
import { Study } from './features/study/Study';
import { AREAS, HOBBY_PARTS } from './features/study/tabs';
import { AiPill } from './features/study/AiPill';
import { toast } from './features/study/ui';

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(safeDecode);

const SYNC_TEXT: Record<SyncStatus, string> = { local: '이 기기에만 저장', syncing: '동기화 중…', saved: '서버에 저장됨', error: '동기화 실패 (잠시 뒤 다시 시도해요)' };

export default function App() {
  const [path, setPath] = useState(parse);
  const auth = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sync, setSync] = useState(getSyncStatus);
  useEffect(() => onSyncStatus(setSync), []);
  // 인터넷 끊김 표시 · 다른 기기 것이 더 최근이라 바뀐 것 알리기
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const up = () => setOffline(false);
    const down = () => setOffline(true);
    const conflict = (e: Event) => toast(`다른 기기에서 고친 ${(e as CustomEvent<number>).detail}개가 더 최근이라 그쪽으로 맞췄어요`);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('my-study-conflict', conflict);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('my-study-conflict', conflict);
    };
  }, []);
  useEffect(() => {
    const on = () => {
      setPath(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const userId = auth.user?.id ?? null;
  // 맨 위 막대: 지금 있는 영역 이름 (누르면 그 영역 처음으로)
  const area = AREAS.find((a) => a.key === ((HOBBY_PARTS as readonly string[]).includes(path[0]) ? 'hobby' : path[0]));
  const crumb = !path[0]
    ? null
    : path[0] === 'settings'
      ? { label: '설정', to: '/settings' }
      : path[0] === 'week'
        ? { label: '이번 주', to: '/week' }
        : path[0] === 'checkin'
          ? { label: '하루 마감', to: '/checkin' }
          : path[0] === 'month'
            ? { label: '이번 달', to: '/month' }
            : path[0] === 'search'
              ? { label: '검색', to: '/search' }
              : path[0] === 'insights'
                ? { label: '자세히 보기', to: '/insights' }
                : path[0] === 'calendar'
                  ? { label: '달력', to: '/calendar' }
                  : path[0] === 'plan'
                    ? { label: '한 주 계획', to: '/plan' }
                    : path[0] === 'eve'
                      ? { label: '시험 전날', to: '/eve' }
                      : area
                        ? { label: area.label, to: `/${area.key}` }
                        : { label: '공부', to: '/study' };
  // 「/」 를 누르면 검색 (글 쓰는 칸에서는 빼고)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        window.location.hash = '/search';
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    void syncAll();
  }, [userId]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => (window.location.hash = '/')}>
          <img src="/icon.svg" alt="" width={30} height={30} />
          <span>Life</span>
        </button>
        {crumb && (
          <button className="crumb" onClick={() => (window.location.hash = crumb.to)}>
            {crumb.label}
          </button>
        )}
        <AiPill ai={path[0] === 'ai' ? (path[1] ?? '') : undefined} />
        <div className="account">
          <button className="gear-btn search-btn" aria-label="검색" title="검색 ( / )" onClick={() => (window.location.hash = '/search')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
            </svg>
          </button>
          <button className="gear-btn" aria-label="설정" title="설정" onClick={() => (window.location.hash = '/settings')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
          {auth.loading ? (
            <span className="account-wait" aria-hidden />
          ) : auth.user ? (
            <>
              <button className="account-btn" onClick={() => setAccountOpen(true)} aria-label={`계정: ${displayName(auth.user)} (${SYNC_TEXT[sync]})`} title={auth.offline ? '서버에 연결할 수 없어요 (이 기기에 저장 중)' : SYNC_TEXT[sync]}>
                <span className={`sync-dot ${sync}`} />
                <span className="user-name">{displayName(auth.user)}</span>
                <span className="avatar" aria-hidden>
                  {displayName(auth.user).slice(0, 1).toUpperCase()}
                </span>
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setLoginOpen(true)}>
              로그인
            </button>
          )}
        </div>
      </header>
      {/* 로그인했으면 첫 동기화가 끝난 뒤에 오늘 분량을 고정한다 (다른 기기의 최신 진도로) */}
      {offline && <div className="offline-bar">인터넷 연결이 끊겼어요 · 이 기기에 저장하고, 다시 연결되면 다른 기기와 맞춰요</div>}
      <Study path={path} loggedIn={!!auth.user || auth.loading} syncReady={!isLoggedIn() || sync !== 'syncing'} onLogin={() => setLoginOpen(true)} />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      {accountOpen && auth.user && <AccountSheet user={auth.user} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
