// AI 풀이를 화면 밖에서도: 서버에 「풀어 줘」 를 맡기고 몇 초마다 끝났는지 물어본다.
// 다른 칸·다른 앱으로 가도 서버는 계속 풀고, 돌아오면 바로 받아 온다. 푸는 동안은 맨 위에 작게 보인다.
import { useSyncExternalStore } from 'react';
import { put } from './store';
import { ApiError, solveJobGet, solveJobStart, type SolveEngine, type SolveTurn } from '../auth/api';

export interface Msg extends SolveTurn {
  /** 사진 미리보기 (이 화면에서만) */
  thumbs?: string[];
  /** R2 에 올린 사진 (지난 대화에서도 보이게) */
  imgKeys?: string[];
  model?: string;
  error?: boolean;
}
export interface Chat {
  id: string;
  at: number;
  title: string;
  /** 과목 (나중에 문제 저장소로 모을 때) */
  subjectId?: string;
  msgs: Msg[];
}

export const CHATS_KEY = 'my-study.solve.chats';
const JOB_KEY = 'my-study.solve.job';
const DUR_KEY = 'my-study.solve.durations';

export const load = <T>(k: string, fb: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? fb;
  } catch {
    return fb;
  }
};
const store = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 가득 차면 저장하지 않는다 */
  }
};

/** 대화는 글만 저장소(problems, 다른 기기와 같이 씀)에 둔다. 사진은 R2 열쇠만 */
export function saveChat(c: Chat) {
  put('problems', { id: c.id, title: c.title, subjectId: c.subjectId, at: c.at, msgs: c.msgs.map((m) => ({ role: m.role, text: m.text, model: m.model, error: m.error, imgKeys: m.imgKeys })) });
}

/** 예전에 이 기기에만 두던 대화를 저장소로 한 번 옮긴다 */
export function migrateChats(have: Record<string, unknown>) {
  const old = load<Chat[]>(CHATS_KEY, []);
  if (!old.length) return;
  for (const c of old) if (!have[c.id] && c.title) saveChat(c);
  store(CHATS_KEY, null);
}

/** 예상 시간: 이 모델로 최근 푼 시간의 평균 (기록이 없으면 사진 20초 · 글 12초) */
export function estimateMs(engine: SolveEngine, hasImage: boolean): number {
  const list = load<Record<string, number[]>>(DUR_KEY, {})[`${engine}${hasImage ? ':img' : ''}`] ?? [];
  if (!list.length) return hasImage ? 20_000 : 12_000;
  return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
}
function recordDuration(engine: SolveEngine, hasImage: boolean, ms: number) {
  const all = load<Record<string, number[]>>(DUR_KEY, {});
  const k = `${engine}${hasImage ? ':img' : ''}`;
  all[k] = [...(all[k] ?? []), ms].slice(-8);
  store(DUR_KEY, all);
}

export interface Job {
  id: string;
  engine: SolveEngine;
  chat: Chat;
  startedAt: number;
  estimate: number;
  hasImage: boolean;
  status: 'running' | 'done' | 'error';
  /** 끝난 대화 (답이 붙은) */
  result?: Chat;
  /** 실패했을 때 서버 상태 코드 (429·5xx 면 다른 모델 고르기) */
  code?: number;
  /** 사람이 확인했는지 (맨 위 표시를 지우려고) */
  seen?: boolean;
}

let job: Job | null = load<Job | null>(JOB_KEY, null);
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const setJob = (j: Job | null) => {
  job = j;
  // 사진 데이터는 저장하지 않는다 (무거움)
  store(JOB_KEY, j ? { ...j, chat: { ...j.chat, msgs: j.chat.msgs.map((m) => ({ ...m, images: undefined })) } } : null);
  emit();
};
export const useSolveJob = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => job,
  );
export const getSolveJob = () => job;
export const markJobSeen = () => job && job.status !== 'running' && setJob({ ...job, seen: true });
export const clearJob = () => setJob(null);

const turnsOf = (msgs: Msg[]): SolveTurn[] => msgs.filter((m) => !m.error).map((m, i, all) => ({ role: m.role, text: m.text, images: i === all.length - 1 ? m.images : undefined }));

/** 풀이 맡기기 (대화의 마지막이 질문) */
export async function startSolve(engine: SolveEngine, chat: Chat) {
  const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const hasImage = !!chat.msgs[chat.msgs.length - 1]?.images?.length;
  setJob({ id, engine, chat, startedAt: Date.now(), estimate: estimateMs(engine, hasImage), hasImage, status: 'running' });
  try {
    await solveJobStart(engine, turnsOf(chat.msgs), id);
  } catch (e) {
    finish(e instanceof Error ? e.message : '풀지 못했어요', e instanceof ApiError ? e.status : 0);
    return;
  }
  void poll();
}

function finish(text: string, code: number, model?: string) {
  if (!job || job.status !== 'running') return;
  const ok = code >= 200 && code < 300;
  if (ok) recordDuration(job.engine, job.hasImage, Date.now() - job.startedAt);
  const result: Chat = { ...job.chat, at: Date.now(), msgs: [...job.chat.msgs, { role: 'assistant', text, model, error: ok ? undefined : true }] };
  if (ok) saveChat(result);
  setJob({ ...job, status: ok ? 'done' : 'error', result, code });
}

let polling = false;
/** 끝날 때까지 2초마다 묻는다. 다른 앱에 갔다 오면(화면이 다시 보이면) 바로 다시 */
async function poll() {
  if (polling) return;
  polling = true;
  try {
    while (job && job.status === 'running') {
      if (document.visibilityState === 'visible') {
        try {
          const r = await solveJobGet(job.id);
          if (r.done) {
            const res = r.result as { text?: string; model?: string; error?: string };
            finish(res.text ?? res.error ?? '풀지 못했어요', r.code ?? 500, res.model);
            break;
          }
          if (r.missing && Date.now() - job.startedAt > 15_000) {
            finish('서버가 다시 시작돼서 풀이를 잃었어요. 다시 보내 주세요.', 500);
            break;
          }
        } catch {
          /* 인터넷이 잠깐 끊겨도 계속 기다린다 */
        }
      }
      await new Promise((res) => setTimeout(res, 2000));
      // 10분이 지나도 안 끝나면 그만
      if (job && Date.now() - job.startedAt > 10 * 60_000) finish('너무 오래 걸려서 멈췄어요. 다시 보내 주세요.', 504);
    }
  } finally {
    polling = false;
  }
}

// 앱을 다시 열었을 때 푸는 중이던 것이 있으면 이어서 기다린다
if (typeof document !== 'undefined') {
  if (job?.status === 'running') void poll();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && job?.status === 'running') void poll();
  });
}
