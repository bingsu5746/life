// 돌고 있는 타이머 (이 기기에만 저장). 어느 화면에 있든 끝나면 알림음·알림을 주고, 탭 제목에 남은 시간을 보여 준다.
import { useEffect, useRef, useState } from 'react';
import { getStudy } from './store';
import { clock, view, type TimerState } from './timer';

const KEY = 'my-study.study.timer.v1';
const EVENT = 'my-study-timer';

export function loadTimer(): TimerState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function saveTimer(t: TimerState | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useTimer(): TimerState | null {
  const [t, setT] = useState(loadTimer);
  useEffect(() => {
    const on = () => setT(loadTimer());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return t;
}

/**
 * 소리 낼 준비: 폰 브라우저(특히 아이폰)는 사람이 누를 때 만든 AudioContext 로만 소리를 낸다.
 * 타이머를 시작·계속할 때(누를 때) 불러 둔다.
 */
let audio: AudioContext | null = null;
export function primeAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
  } catch {
    /* 소리를 낼 수 없는 환경 */
  }
}

/** 짧은 알림음 + 진동 */
export function beep() {
  try {
    const shared = !!audio;
    const ctx = audio ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    for (const [i, f] of [880, 1175].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.start(t0);
      o.stop(t0 + 0.45);
    }
    if (!shared) setTimeout(() => void ctx.close(), 1200);
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* 소리를 낼 수 없는 환경 */
  }
}

/** 알림 허락 받기 (타이머를 처음 시작할 때) */
export function askNotify() {
  primeAudio();
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
}

/** 알림 띄우기: 폰(안드로이드 크롬)은 페이지에서 new Notification 을 만들 수 없어 서비스 워커로 띄운다 */
async function notify(title: string, body: string) {
  const opts = { body, icon: '/icon.svg', tag: 'life-timer' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, opts));
  } catch {
    /* 아래로 */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* 알림을 만들 수 없는 브라우저 */
  }
}

/** 돌고 있는 타이머와 지금 보여 줄 값 (1초마다). 이것을 쓰는 작은 부품만 1초마다 다시 그려진다 */
export function useTimerView() {
  const timer = useTimer();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timer]);
  const v = timer ? view(timer, now, getStudy().settings.pomo) : null;
  return { timer, v };
}

/** 타이머가 끝나면 알리기 + 탭 제목 (Study 화면의 보이지 않는 작은 부품에서 한 번) */
export function useTimerAlarm(): { timer: TimerState | null; shown: string | null } {
  const { timer, v } = useTimerView();
  const rang = useRef<string | null>(null);
  const key = timer ? `${timer.startedAt}-${timer.round}-${timer.phase}` : null;
  useEffect(() => {
    if (!timer || !v?.finished || rang.current === key) return;
    rang.current = key;
    // 오래전에 끝난 것(다른 앱에 갔다 온 경우)은 소리 없이 화면에만
    if (v.overMs < 10_000) beep();
    const msg = timer.phase === 'work' ? '공부 시간 끝! 쉬었다 하세요' : '쉬는 시간 끝! 다시 공부해요';
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') void notify('내 공부', `${timer.label} · ${msg}`);
  }, [timer, v?.finished, v?.overMs, key]);
  const shown = timer && v ? clock(v.shownMs) : null;
  useEffect(() => {
    document.title = shown && timer ? `${shown} ${timer.kind === 'watch' ? '공부 중' : timer.phase === 'work' ? '공부' : '휴식'} · 내 공부` : '내 공부';
  }, [shown, timer]);
  return { timer, shown };
}
