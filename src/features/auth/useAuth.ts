import { useEffect, useState } from 'react';
import { isLoggedIn, me, type Account } from './api';

export interface AuthState {
  user: Account | null;
  loading: boolean;
}

/** 로그인 상태. 토큰이 이 기기에 있으면 새로고침해도 로그인이 유지된다. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: !!isLoggedIn() });
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!isLoggedIn()) return setState({ user: null, loading: false });
      me()
        .then((user) => !cancelled && setState({ user, loading: false }))
        .catch(() => !cancelled && setState((s) => ({ user: isLoggedIn() ? s.user : null, loading: false })));
    };
    check();
    window.addEventListener('my-study-auth', check);
    return () => {
      cancelled = true;
      window.removeEventListener('my-study-auth', check);
    };
  }, []);
  return state;
}

export const displayName = (user: Account) => user.nickname || user.username;
