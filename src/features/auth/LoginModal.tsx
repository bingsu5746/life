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
  const [show, setShow] = useState(false);
  // 폰에서 한글 자판인 채로 영문 비밀번호를 치면 한글이 들어간다
  const hangul = /[\u3131-\u318e\uac00-\ud7a3]/.test(password) || /[\u3131-\u318e]/.test(username);
  const spaces = /^\s|\s$/.test(password);
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
          <input className="st-input" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={16} required />
        </Field>
        {mode === 'signup' && (
          <Field label="닉네임 (선택)">
            <input className="st-input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={16} placeholder="비우면 아이디" />
          </Field>
        )}
        <Field label="비밀번호">
          <div className="st-inline">
            <input
              className="st-input"
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={mode === 'signup' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" className="btn btn-sm" aria-pressed={show} onClick={() => setShow(!show)}>
              {show ? '가리기' : '보기'}
            </button>
          </div>
        </Field>
        {hangul && <p className="st-warn">비밀번호(또는 아이디)에 한글이 들어가 있어요. 폰 자판이 한글로 되어 있지 않은지 확인해 주세요.</p>}
        {spaces && <p className="st-warn">비밀번호 앞이나 뒤에 빈칸이 있어요.</p>}
        {mode === 'signup' && (
          <Field label="비밀번호 확인">
            <input className="st-input" type="password" autoComplete="new-password" minLength={8} value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </Field>
        )}
        {error && (
          <p className="bad" role="alert">
            {error}
            {mode === 'login' && error.includes('맞지 않아요') && (
              <span className="st-hint">
                {' '}
                「보기」를 눌러 친 글자를 확인해 보세요 (자동 대문자·한글 자판·저장된 옛 비밀번호 자동 입력). 다른 기기에서 로그인되어 있다면 그 기기의 계정 메뉴에서 비밀번호를 바꿀 수 있어요.
              </span>
            )}
          </p>
        )}
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
      </form>
      <p className="st-hint">
        {mode === 'signup'
          ? '아이디는 3~16자의 한글·영문·숫자·_ , 비밀번호는 8자 이상이에요. 이메일은 받지 않아서 비밀번호를 잊으면 찾을 수 없으니 꼭 기억해 주세요.'
          : '로그인하면 공부 자료가 서버에 저장돼서 폰·PC 어디서든 같이 볼 수 있어요.'}
      </p>
    </Sheet>
  );
}
