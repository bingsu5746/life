// 공부 타이머 (설계 §10). 시작 시각을 저장해서 계산하므로 화면을 끄거나 새로고침해도 맞다.
import type { Id, StudySettings } from './model';

export type Phase = 'work' | 'short' | 'long';

export interface TimerState {
  kind: 'pomo' | 'watch';
  subjectId?: Id;
  bookId?: Id;
  label: string;
  /** 뽀모도로: 지금 단계, 몇 번째 공부인지(1부터) */
  phase: Phase;
  round: number;
  /** 지금 단계(또는 스톱워치)가 시작된 시각. 멈춤 중이면 null */
  runningSince: number | null;
  /** 지금 단계에서 이미 지난 시간 (멈췄다 다시 할 때) */
  elapsedMs: number;
  /** 이번 타이머 전체에서 공부한 시간 (기록용) */
  studiedMs: number;
  /** 처음 시작한 시각 */
  startedAt: number;
}

export function phaseLength(phase: Phase, pomo: StudySettings['pomo']): number {
  return (phase === 'work' ? pomo.work : phase === 'short' ? pomo.short : pomo.long) * 60_000;
}

export function elapsed(t: TimerState, now: number): number {
  return t.elapsedMs + (t.runningSince === null ? 0 : Math.max(0, now - t.runningSince));
}

export interface TimerView {
  /** 화면에 보일 시간 (뽀모도로: 남은 시간, 스톱워치: 지난 시간) */
  shownMs: number;
  /** 뽀모도로 단계가 끝났는지, 끝난 지 얼마나 됐는지 */
  finished: boolean;
  overMs: number;
  /** 0~1 */
  progress: number;
}

export function view(t: TimerState, now: number, pomo: StudySettings['pomo']): TimerView {
  const e = elapsed(t, now);
  if (t.kind === 'watch') return { shownMs: e, finished: false, overMs: 0, progress: (e % 3_600_000) / 3_600_000 };
  const len = phaseLength(t.phase, pomo);
  return { shownMs: Math.max(0, len - e), finished: e >= len, overMs: Math.max(0, e - len), progress: Math.min(1, e / len) };
}

export function start(kind: TimerState['kind'], label: string, now: number, subjectId?: Id, bookId?: Id): TimerState {
  return { kind, label, subjectId, bookId, phase: 'work', round: 1, runningSince: now, elapsedMs: 0, studiedMs: 0, startedAt: now };
}

export function pause(t: TimerState, now: number): TimerState {
  if (t.runningSince === null) return t;
  return { ...t, elapsedMs: elapsed(t, now), runningSince: null };
}
export function resume(t: TimerState, now: number): TimerState {
  return t.runningSince === null ? { ...t, runningSince: now } : t;
}

/**
 * 뽀모도로 다음 단계로. 공부 단계를 마치면 그만큼(최대 단계 길이) 공부 시간에 더한다.
 * 공부 every 번마다 긴 휴식.
 */
export function nextPhase(t: TimerState, now: number, pomo: StudySettings['pomo']): { state: TimerState; studiedMs: number } {
  const e = elapsed(t, now);
  if (t.phase === 'work') {
    const studied = Math.min(e, phaseLength('work', pomo));
    const phase: Phase = t.round % pomo.every === 0 ? 'long' : 'short';
    return { state: { ...t, phase, runningSince: now, elapsedMs: 0, studiedMs: t.studiedMs + studied }, studiedMs: studied };
  }
  return { state: { ...t, phase: 'work', round: t.round + 1, runningSince: now, elapsedMs: 0 }, studiedMs: 0 };
}

/** 끝내기: 이번에 기록할 공부 시간 (분, 반올림). 1분 미만은 0 */
export function finish(t: TimerState, now: number, pomo: StudySettings['pomo']): number {
  let ms = t.studiedMs;
  if (t.kind === 'watch') ms = elapsed(t, now);
  else if (t.phase === 'work') ms += Math.min(elapsed(t, now), phaseLength('work', pomo));
  return Math.round(ms / 60_000);
}

export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

/** 1시간 40분 */
export function minutesText(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
