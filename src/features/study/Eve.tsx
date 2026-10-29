// 시험 전날 모드: 내일(또는 오늘) 보는 과목의 범위 체크 · 못 푼 오답 · 빠뜨린 핵심 · 헷갈린 단어를 한 화면에
import { eveTarget } from './eve';
import { put, useStudy, useWords } from './store';
import { weakSheet } from './weakSheet';
import { Check, Empty, go, SubjectDot, tap, useToday } from './ui';
import type { Exam } from './model';

export function EvePage() {
  const d = useStudy();
  const words = useWords();
  const today = useToday();
  const t = eveTarget(d, today);
  if (!t)
    return (
      <Empty title="오늘·내일 보는 시험이 없어요">
        <button className="btn" onClick={() => go('/exams')}>
          시험 목록
        </button>
      </Empty>
    );
  const exam = t.exam;
  const toggle = (scopeId: string, lineId: string) => put('exams', { ...exam, scopes: (exam.scopes ?? []).map((x) => (x.id === scopeId ? { ...x, lines: x.lines.map((l) => (l.id === lineId ? { ...l, done: !l.done, at: Date.now() } : l)) } : x)) } as Exam);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{t.date === today ? '오늘 시험' : '내일 시험'}</h2>
        <small className="st-muted">{exam.name}</small>
      </div>
      {t.subjectIds.map((sid) => {
        const scope = exam.scopes?.find((s) => s.subjectId === sid);
        const w = weakSheet(d, words, sid);
        const left = scope ? scope.lines.filter((l) => !l.done).length : 0;
        return (
          <section key={sid} className="st-card ev">
            <h3 className="st-h">
              <SubjectDot id={sid} d={d} /> {d.subjects[sid].name}
            </h3>
            {scope && scope.lines.length > 0 && (
              <>
                <small className="aw-label">시험 범위 {left ? `· ${left}개 남음` : '· 다 봤어요'}</small>
                {scope.lines.map((l) => (
                  <div key={l.id} className="st-item">
                    <Check on={l.done} label={l.text} onClick={() => toggle(scope.id, l.id)} />
                    <div className="st-item-main" {...tap(() => toggle(scope.id, l.id))}>
                      <div className={`st-item-title ${l.done ? 'done' : ''}`}>{l.text}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {w.comments.length > 0 && (
              <>
                <small className="aw-label">나에게 한마디</small>
                <ul className="ev-list">
                  {w.comments.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </>
            )}
            {w.missed.length > 0 && (
              <>
                <small className="aw-label">백지 복습에서 빠뜨린 핵심</small>
                <ul className="ev-list">{w.missed.flatMap((m) => m.points.map((p) => <li key={m.title + p}>{p}</li>))}</ul>
              </>
            )}
            {w.words.length > 0 && (
              <>
                <small className="aw-label">자주 틀린 단어</small>
                <ul className="ev-list">
                  {w.words.slice(0, 12).map((x) => (
                    <li key={x.term}>
                      <b>{x.term}</b> {x.meaning}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {w.passages.length > 0 && (
              <>
                <small className="aw-label">헷갈린 지문</small>
                <ul className="ev-list">
                  {w.passages.map((p) => (
                    <li key={p.id}>{p.title}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="st-inline wrap">
              {w.notes.length > 0 && (
                <button className="btn btn-sm btn-primary" onClick={() => go(`/review/redo?subject=${sid}`)}>
                  못 푼 오답 {w.notes.length}개 다시 풀기
                </button>
              )}
              <button className="btn btn-sm" onClick={() => go(`/exams/weak-${sid}`)}>
                약점 한 장
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** 오늘 화면 · 메인에 띄우는 한 줄 */
export function EveBanner({ today }: { today: string }) {
  const d = useStudy();
  const t = eveTarget(d, today);
  if (!t) return null;
  return (
    <button className="ev-banner" onClick={() => go('/eve')}>
      <b>{t.date === today ? '오늘' : '내일'} 시험</b> {t.subjectIds.map((s) => d.subjects[s].name).join(' · ')} · 마지막으로 훑기 ›
    </button>
  );
}
