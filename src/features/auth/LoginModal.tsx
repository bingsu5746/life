import { useState } from 'react';
import { Field, Sheet } from '../study/ui';
import { login, signup } from './api';

/** 아이디·비밀번호 로그인 / 회원가입 (이메일 없이) */
export function LoginModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && password !== password2) return setError('비밀번호 두 개가 서로 달라요.');
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await signup(username.trim(), password, nickname.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 났어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={mode === 'login' ? '로그인' : '회원가입'} onClose={onClose}>
      <div className="st-seg">
        <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
          로그인
        </button>
        <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
          회원가입
        </button>
      </div>
      <form className="st-form" onSubmit={submit}>
        <Field label="아이디">
          <input className="st-input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={16} required />
        </Field>
        {mode === 'signup' && (
          <Field label="닉네임 (선택)">
            <input className="st-input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={16} placeholder="비우면 아이디" />
          </Field>
        )}
        <Field label="비밀번호">
          <input className="st-input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {mode === 'signup' && (
          <Field label="비밀번호 확인">
            <input className="st-input" type="password" autoComplete="new-password" minLength={6} value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </Field>
        )}
        {error && (
          <p className="bad" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
      </form>
      <p className="st-hint">
        {mode === 'signup'
          ? '아이디는 3~16자의 한글·영문·숫자·_ , 비밀번호는 6자 이상이에요. 이메일은 받지 않아서 비밀번호를 잊으면 찾을 수 없으니 꼭 기억해 주세요.'
          : '로그인하면 공부 자료가 서버에 저장돼서 폰·PC 어디서든 같이 볼 수 있어요.'}
      </p>
    </Sheet>
  );
}
