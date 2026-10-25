// 내 공부: 맨 위 막대(이름·로그인) + 공부 도우미 화면. 주소는 #/오늘·문제집… (src/features/study/Study.tsx)
import { useEffect, useState } from 'react';
import { AccountSheet } from './features/auth/AccountSheet';
import { LoginModal } from './features/auth/LoginModal';
import { getSyncStatus, onSyncStatus, syncAll, type SyncStatus } from './features/auth/sync';
import { displayName, useAuth } from './features/auth/useAuth';
import { isLoggedIn } from './features/auth/api';
import { Study } from './features/study/Study';

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const parse = () =>
  window.location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(safeDecode);

const SYNC_TEXT: Record<SyncStatus, string> = { local: '이 기기에만 저장', syncing: '동기화 중…', saved: '서버에 저장됨', error: '동기화 실패 (나중에 다시 해요)' };

export default function App() {
  const [path, setPath] = useState(parse);
  const auth = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sync, setSync] = useState(getSyncStatus);
  useEffect(() => onSyncStatus(setSync), []);
  useEffect(() => {
    const on = () => {
      setPath(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const userId = auth.user?.id ?? null;
  useEffect(() => {
    void syncAll();
  }, [userId]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => (window.location.hash = '/')}>
          <img src="/icon.svg" alt="" width={30} height={30} />
          <span>내 공부</span>
        </button>
        <div className="account">
          <button className="gear-btn" aria-label="번역" title="번역 (한국어 ↔ 영어)" onClick={() => (window.location.hash = '/translate')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 5h8M8 3v2M10 5c-.5 3.5-2.5 6-5.5 7.5M6 8c1 2 2.6 3.4 4.5 4.2M13 20l4-9 4 9M14.4 17h5.2" />
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
      <Study path={path} loggedIn={!!auth.user || auth.loading} syncReady={!isLoggedIn() || sync !== 'syncing'} onLogin={() => setLoginOpen(true)} />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      {accountOpen && auth.user && <AccountSheet user={auth.user} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
