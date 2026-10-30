// 맨 위에 작게: AI 가 푸는 중 · 다 풀었음 (누르면 AI 화면으로)
import { useSolveJob } from './solveJob';
import { useNow } from './ui';

/** ai: AI 화면이면 주소의 대화 id ('' 은 새 대화 화면), 아니면 undefined. 그 대화를 보고 있으면 숨긴다 */
export function AiPill({ ai }: { ai?: string }) {
  const job = useSolveJob();
  if (!job || ai === '' || ai === job.chat.id) return null;
  if (job.status === 'running') return <Running id={job.chat.id} from={job.startedAt} />;
  if (job.seen) return null;
  return (
    <button className={`ai-pill ${job.status === 'done' ? 'ok' : 'bad'}`} onClick={() => (window.location.hash = `/ai/${job.chat.id}`)}>
      {job.status === 'done' ? 'AI 풀이 완료 ›' : 'AI 풀이 실패 ›'}
    </button>
  );
}

/** 푸는 동안만 1초마다 다시 그린다 */
function Running({ id, from }: { id: string; from: number }) {
  const now = useNow(1000);
  return (
    <button className="ai-pill run" onClick={() => (window.location.hash = `/ai/${id}`)}>
      <i /> AI 푸는 중 {Math.round((now - from) / 1000)}초
    </button>
  );
}
