// 시험 직전 「내 약점 한 장」: 한 과목에서 내가 자주 틀리는 것만 한 화면에 (인쇄해서 들고 다닐 수도 있게)
import { REASONS } from './model';
import { isEmptySheet, weakSheet } from './weakSheet';
import { useStudy, useWords } from './store';
import { Empty, go, SubjectDot } from './ui';

export function WeakPage({ subjectId }: { subjectId: string }) {
  const d = useStudy();
  const words = useWords();
  const subject = d.subjects[subjectId];
  if (!subject || subject.deleted)
    return (
      <Empty title="과목을 찾을 수 없어요">
        <button className="btn" onClick={() => go('/exams')}>
          시험 목록
        </button>
      </Empty>
    );
  const s = weakSheet(d, words, subjectId);
  return (
    <div className="st-page narrow wk">
      <div className="st-page-head">
        <button className="st-back no-print" onClick={() => history.back()} aria-label="돌아가기">
          ‹
        </button>
        <h2>
          <SubjectDot id={subjectId} d={d} /> {subject.name} 약점 한 장
        </h2>
        <button className="st-link no-print" onClick={() => window.print()}>
          인쇄
        </button>
      </div>
      {isEmptySheet(s) ? (
        <Empty title="아직 모인 약점이 없어요">
          <p>오답 · 백지 복습 · 지문 · 단어를 쓰다 보면 시험 전에 여기 한 장으로 모아 드려요.</p>
        </Empty>
      ) : (
        <>
          {s.pattern && (s.pattern.top || s.pattern.units.length > 0) && (
            <section className="st-card">
              <h3 className="st-h">자주 틀리는 이유 · 곳</h3>
              {s.pattern.top && (
                <p className="wk-big">
                  {REASONS[s.pattern.top.reason]} <b>{Math.round(s.pattern.top.share * 100)}%</b>
                </p>
              )}
              {s.pattern.units.length > 0 && <p className="st-sub">많이 틀린 곳: {s.pattern.units.map((u) => `${u.name} (${u.n})`).join(' · ')}</p>}
            </section>
          )}
          {s.comments.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">나에게 한마디</h3>
              <ul className="wk-list">
                {s.comments.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          )}
          {s.notes.length > 0 && (
            <section className="st-card">
              <div className="st-inline between">
                <h3 className="st-h">아직 못 푼 오답 {s.notes.length}</h3>
                <button className="st-link no-print" onClick={() => go(`/review/redo?subject=${subjectId}`)}>
                  다시 풀기
                </button>
              </div>
              <ul className="wk-list">
                {s.notes.map((n) => (
                  <li key={n.id}>
                    {n.question.split('\n')[0].slice(0, 80) || [n.page && `p.${n.page}`, n.number && `${n.number.replace(/번$/, '')}번`].filter(Boolean).join(' ') || '오답'}
                    {n.reason && <small className="st-muted"> · {REASONS[n.reason]}</small>}
                    {n.wrong > 1 && <small className="bad"> · {n.wrong}번 틀림</small>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {s.missed.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">백지 복습에서 빠뜨린 핵심</h3>
              {s.missed.map((m) => (
                <div key={m.title}>
                  <b className="wk-sub">{m.title}</b>
                  <ul className="wk-list">
                    {m.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          {s.passages.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">헷갈린 지문</h3>
              {s.passages.map((p) => (
                <button key={p.id} className="sr-hit" onClick={() => go(`/review/passage-${p.id}`)}>
                  <b>{p.title}</b>
                  {p.note && <small>{p.note.split('\n')[0]}</small>}
                </button>
              ))}
            </section>
          )}
          {s.words.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">자주 틀린 단어</h3>
              <div className="wk-words">
                {s.words.map((w) => (
                  <span key={w.term}>
                    <b lang="en">{w.term}</b> {w.meaning}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
