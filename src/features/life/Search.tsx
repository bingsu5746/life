// 통합 검색 화면
import { useEffect, useRef, useState } from 'react';
import { useStudy, useWords } from '../study/store';
import { go } from '../study/ui';
import { searchAll } from './search';

export function Search({ q0 = '' }: { q0?: string }) {
  const d = useStudy();
  const words = useWords();
  const [q, setQ] = useState(q0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const hits = searchAll(d, words, q);
  const groups = [...new Set(hits.map((h) => h.group))];
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>검색</h2>
      </div>
      <input ref={ref} className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="일기·영화·책·할 일·시험·오답·단어… 모두에서 찾기" aria-label="검색" type="search" />
      {q.trim() && !hits.length && <p className="st-hint">찾은 것이 없어요.</p>}
      {!q.trim() && <p className="st-hint">이 기기에 있는 모든 기록에서 찾아요. 검색한 글자는 서버로 보내지 않아요.</p>}
      {groups.map((g) => (
        <section key={g} className="st-card">
          <small className="aw-label">{g}</small>
          {hits
            .filter((h) => h.group === g)
            .map((h, i) => (
              <button key={i} className="sr-hit" onClick={() => go(h.to)}>
                <b>{h.title}</b>
                {h.snippet && <small>{h.snippet}</small>}
              </button>
            ))}
        </section>
      ))}
    </div>
  );
}
