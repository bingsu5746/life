// 계정: 닉네임 · 비밀번호 바꾸기 · 로그아웃(이 기기 자료 지우기) · 모든 기기에서 로그아웃 · 계정 지우기
import { useState } from 'react';
import { Field, Sheet, toast } from '../study/ui';
import { changeNickname, changePassword, deleteAccount, logout, type Account } from './api';
import { forgetDevice } from './sync';

type View = 'menu' | 'nickname' | 'password' | 'logout' | 'delete';

export function AccountSheet({ user, onClose }: { user: Account; onClose: () => void }) {
  const [view, setView] = useState<View>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState(user.nickname);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [wipe, setWipe] = useState(true);
  const [confirmText, setConfirmText] = useState('');

  /** f 가 글을 돌려주면 그 글로 알린다 */
  async function run(f: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const msg = await f();
      toast(typeof msg === 'string' ? msg : done);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 났어요.');
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <button type="button" className="st-link" onClick={() => (setView('menu'), setError(null))}>
      ‹ 계정
    </button>
  );
  const err = error && (
    <p className="bad" role="alert">
      {error}
    </p>
  );

  if (view === 'nickname')
    return (
      <Sheet title="닉네임 바꾸기" onClose={onClose}>
        {back}
        <form className="st-form" onSubmit={(e) => (e.preventDefault(), void run(() => changeNickname(nickname.trim()), '닉네임을 바꿨어요'))}>
          <Field label="닉네임">
            <input className="st-input" value={nickname} maxLength={16} onChange={(e) => setNickname(e.target.value)} required />
          </Field>
          {err}
          <button className="btn btn-primary" disabled={busy || !nickname.trim()}>
            저장
          </button>
        </form>
      </Sheet>
    );

  if (view === 'password')
    return (
      <Sheet title="비밀번호 바꾸기" onClose={onClose}>
        {back}
        <form
          className="st-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== next2) return setError('새 비밀번호 두 개가 서로 달라요.');
            void run(() => changePassword(current, next), '비밀번호를 바꿨어요. 다른 기기는 다시 로그인해야 해요');
          }}
        >
          <Field label="지금 비밀번호">
            <input className="st-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="새 비밀번호" hint="8자 이상, 아이디와 다르게">
            <input className="st-input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
          <Field label="새 비밀번호 확인">
            <input className="st-input" type="password" autoComplete="new-password" minLength={8} value={next2} onChange={(e) => setNext2(e.target.value)} required />
          </Field>
          {err}
          <button className="btn btn-primary" disabled={busy}>
            바꾸기
          </button>
          <p className="st-hint">바꾸면 이 기기를 빼고 다른 기기의 로그인은 모두 풀려요.</p>
        </form>
      </Sheet>
    );

  if (view === 'logout')
    return (
      <Sheet title="로그아웃" onClose={onClose}>
        {back}
        <div className="st-form">
          <label className="st-toggle">
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} /> 이 기기에 남은 공부 자료도 지우기
          </label>
          <p className="st-hint">자료는 계정에 저장돼 있어서, 다시 로그인하면 돌아와요. 함께 쓰는 기기라면 지우는 것이 안전해요.</p>
          {err}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                // 서버에 못 알려도(인터넷 끊김) 이 기기의 로그아웃과 자료 지우기는 한다
                let offline = false;
                try {
                  await logout();
                } catch {
                  offline = true;
                } finally {
                  await forgetDevice(wipe);
                }
                if (offline) return '이 기기에서 로그아웃했어요. 서버에 연결하지 못해 서버의 로그인 기록이 남아 있을 수 있어요';
              }, '로그아웃했어요')
            }
          >
            로그아웃
          </button>
          <button
            className="st-link"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await logout(true);
                await forgetDevice(wipe);
              }, '모든 기기에서 로그아웃했어요')
            }
          >
            모든 기기에서 로그아웃 (잃어버린 기기가 있을 때)
          </button>
        </div>
      </Sheet>
    );

  if (view === 'delete')
    return (
      <Sheet title="계정 지우기" onClose={onClose}>
        {back}
        <form
          className="st-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await deleteAccount(current);
              await forgetDevice(true);
            }, '계정을 지웠어요');
          }}
        >
          <p>
            계정과 서버에 저장된 공부 자료·사진을 <b>모두 지워요. 되돌릴 수 없어요.</b> 필요하면 먼저 설정에서 백업 파일을 내려받으세요.
          </p>
          <Field label="비밀번호">
            <input className="st-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label={`확인을 위해 아이디(${user.username})를 써 주세요`}>
            <input className="st-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} required />
          </Field>
          {err}
          <button className="btn st-danger" disabled={busy || confirmText !== user.username}>
            계정 지우기
          </button>
        </form>
      </Sheet>
    );

  return (
    <Sheet title={user.nickname || user.username} onClose={onClose}>
      <p className="st-hint">아이디 {user.username}</p>
      <div className="st-addlist">
        {(
          [
            ['nickname', '닉네임 바꾸기'],
            ['password', '비밀번호 바꾸기'],
            ['logout', '로그아웃'],
            ['delete', '계정 지우기'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className={`st-addrow ${v === 'delete' ? 'danger' : ''}`} onClick={() => setView(v)}>
            <span>
              <b>{label}</b>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
