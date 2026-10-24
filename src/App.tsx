// 내 공부: 맨 위 막대(이름·로그인) + 공부 도우미 화면. 주소는 #/오늘·문제집… (src/features/study/Study.tsx)
import { useEffect, useState } from 'react';
import { LoginModal } from './features/auth/LoginModal';
import { logout } from './features/auth/api';
import { getSyncStatus, onSyncStatus, syncAll, type SyncStatus } from './features/auth/sync';
import { displayName, useAuth } from './features/auth/useAuth';
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
          {auth.user ? (
            <>
              <span className={`sync-dot ${sync}`} title={SYNC_TEXT[sync]} aria-label={SYNC_TEXT[sync]} />
              <span className="user-name">{displayName(auth.user)}</span>
              <button className="btn btn-sm" onClick={() => void logout()}>
                로그아웃
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setLoginOpen(true)}>
              로그인
            </button>
          )}
        </div>
      </header>
      <Study path={path} loggedIn={!!auth.user} onLogin={() => setLoginOpen(true)} />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
