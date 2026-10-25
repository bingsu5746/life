import { useEffect, useState } from 'react';
import { ApiError, cachedAccount, isLoggedIn, me, type Account } from './api';

export interface AuthState {
  user: Account | null;
  /** 이 기기에 기억한 계정이 없어 서버에 확인하는 중 */
  loading: boolean;
  /** 서버에 연결하지 못해 기억한 계정으로 보여 주는 중 */
  offline: boolean;
}

const initial = (): AuthState => {
  const cached = cachedAccount();
  return { user: cached, loading: isLoggedIn() && !cached, offline: false };
};

/**
 * 로그인 상태. 이 기기에 기억한 계정을 먼저 보여 주고(새로 고쳐도 「로그인」 단추가 깜빡이지 않게) 서버에 확인한다.
 * 인터넷이 안 되면 로그인한 채로 둔다 (로그인이 풀린 것은 서버가 401 로 알려 줄 때만).
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(initial);
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!isLoggedIn()) return setState({ user: null, loading: false, offline: false });
      // 로그인·닉네임 바꾸기 직후에는 기억한 계정을 바로 보여 준다
      const cached = cachedAccount();
      if (cached) setState((s) => (s.user?.id === cached.id && s.user.nickname === cached.nickname ? s : { ...s, user: cached, loading: false }));
      me()
        .then((user) => !cancelled && setState({ user, loading: false, offline: false }))
        .catch((e: unknown) => {
          if (cancelled) return;
          if (!isLoggedIn() || (e instanceof ApiError && e.status === 401)) return setState({ user: null, loading: false, offline: false });
          // 서버에 닿지 않음: 기억한 계정으로 (없으면 확인할 수 없어 로그아웃처럼 보이지만 표시는 남겨 둔다)
          setState({ user: cachedAccount(), loading: false, offline: true });
        });
    };
    check();
    window.addEventListener('my-study-auth', check);
    window.addEventListener('online', check);
    return () => {
      cancelled = true;
      window.removeEventListener('my-study-auth', check);
      window.removeEventListener('online', check);
    };
  }, []);
  return state;
}

export const displayName = (user: Account) => user.nickname || user.username;
