// 감상문 도우미: AI 가 질문 4개를 던지고, 내 답을 모아 감상문 뼈대(문단)를 만들어 리뷰 칸에 넣는다 (답은 내가 쓴 그대로)
import { useState } from 'react';
import { isLoggedIn, reviewQuestions } from '../auth/api';
import { toast } from '../study/ui';

export function ReviewHelper({ kind, title, by, mine, onDraft }: { kind: 'book' | 'movie'; title: string; by?: string; mine?: string; onDraft: (text: string) => void }) {
  const [qs, setQs] = useState<string[] | null>(null);
  const [ans, setAns] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!isLoggedIn() || !title.trim()) return null;
  if (!qs)
    return (
      <button
        type="button"
        className="st-link"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          reviewQuestions(kind, title.trim(), by?.trim() ?? '', mine?.trim() ?? '')
            .then((r) => (r.questions.length ? (setQs(r.questions), setAns(r.questions.map(() => ''))) : toast('질문을 받지 못했어요')))
            .catch((e) => toast(e instanceof Error ? e.message : '질문을 받지 못했어요'))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? '질문 만드는 중…' : '✍️ 감상문 도우미 (질문에 답하면 뼈대를 만들어요)'}
      </button>
    );
  return (
    <div className="rh">
      {qs.map((q, i) => (
        <label key={i} className="rh-q">
          <span>
            {i + 1}. {q}
          </span>
          <textarea className="st-input" rows={2} value={ans[i]} onChange={(e) => setAns(ans.map((a, j) => (j === i ? e.target.value : a)))} aria-label={q} />
        </label>
      ))}
      <div className="st-inline">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!ans.some((a) => a.trim())}
          onClick={() => {
            // 답한 것만, 질문 순서대로 문단으로 (내 말 그대로)
            onDraft(
              ans
                .map((a) => a.trim())
                .filter(Boolean)
                .join('\n\n'),
            );
            toast('답을 문단으로 모아 리뷰 칸에 넣었어요. 이어서 다듬어 보세요');
            setQs(null);
          }}
        >
          리뷰 칸에 넣기
        </button>
        <button type="button" className="st-link" onClick={() => setQs(null)}>
          닫기
        </button>
      </div>
    </div>
  );
}
