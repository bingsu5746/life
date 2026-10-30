// 맨 위에 작게: AI 가 푸는 중 · 다 풀었음 (누르면 AI 화면으로)
import { useSolveJob } from './solveJob';
import { useNow } from './ui';

export function AiPill({ onAi }: { onAi: boolean }) {
  const job = useSolveJob();
  const now = useNow(1000);
  if (!job || onAi) return null;
  if (job.status === 'running')
    return (
      <button className="ai-pill run" onClick={() => (window.location.hash = `/ai/${job.chat.id}`)}>
        <i /> AI 푸는 중 {Math.round((now - job.startedAt) / 1000)}초
      </button>
    );
  if (job.seen) return null;
  return (
    <button className={`ai-pill ${job.status === 'done' ? 'ok' : 'bad'}`} onClick={() => (window.location.hash = `/ai/${job.chat.id}`)}>
      {job.status === 'done' ? 'AI 풀이 완료 ›' : 'AI 풀이 실패 ›'}
    </button>
  );
}
