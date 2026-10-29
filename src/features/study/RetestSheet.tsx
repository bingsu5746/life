// 오답 재시험지: 아직 못 푼 오답을 골라 한 장짜리 시험지로 (인쇄 화면에서 PDF로 저장)
import { useEffect, useState } from 'react';
import { alive } from './model';
import { photoUrl } from './photos';
import { useStudy } from './store';
import { Empty, go, SubjectDot, useToday } from './ui';
import { longDate } from './dates';

export function RetestSheet() {
  const d = useStudy();
  const today = useToday();
  const open = alive(d.notes).filter((n) => !n.learned && d.subjects[n.subjectId] && !d.subjects[n.subjectId].deleted);
  const subs = [...new Set(open.map((n) => n.subjectId))];
  const [subject, setSubject] = useState(subs[0] ?? '');
  const list = open.filter((n) => n.subjectId === subject).sort((a, b) => b.wrong - a.wrong || b.created - a.created);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState(true);
  const picked = list.filter((n) => !off.has(n.id));
  if (!open.length)
    return (
      <Empty title="아직 못 푼 오답이 없어요">
        <button className="btn" onClick={() => go('/review')}>
          복습
        </button>
      </Empty>
    );
  return (
    <div className="st-page narrow rt">
      <div className="st-page-head no-print">
        <button className="st-back" onClick={() => history.back()} aria-label="돌아가기">
          ‹
        </button>
        <h2>오답 재시험지</h2>
        <button className="btn btn-sm btn-primary" disabled={!picked.length} onClick={() => window.print()}>
          인쇄 · PDF
        </button>
      </div>
      <div className="no-print rt-pick">
        <div className="st-chips">
          {subs.map((s) => (
            <button
              key={s}
              className={`st-chip ${subject === s ? 'on' : ''}`}
              onClick={() => {
                setSubject(s);
                setOff(new Set());
              }}
            >
              {d.subjects[s].name} {open.filter((n) => n.subjectId === s).length}
            </button>
          ))}
        </div>
        <label className="st-inline">
          <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> 정답 페이지 붙이기
        </label>
        <small className="st-muted">문제를 누르면 빼거나 다시 넣어요 · {picked.length}문제</small>
      </div>
      <div className="rt-paper">
        <header className="rt-head">
          <b>
            <SubjectDot id={subject} d={d} /> {d.subjects[subject]?.name} 오답 다시 풀기
          </b>
          <small>{longDate(today)}</small>
        </header>
        {list.map((n) => (
          <article key={n.id} className={`rt-q ${off.has(n.id) ? 'off' : ''}`} onClick={() => setOff((o) => (o.has(n.id) ? (o.delete(n.id), new Set(o)) : new Set(o).add(n.id)))}>
            <b className="rt-no">{picked.indexOf(n) >= 0 ? picked.indexOf(n) + 1 : '–'}.</b>
            <div>
              {(n.page || n.number) && <small className="st-muted">{[n.bookId && d.books[n.bookId]?.name, n.page && `p.${n.page}`, n.number && `${n.number}번`].filter(Boolean).join(' · ')}</small>}
              {n.question && <p>{n.question}</p>}
              {n.photos.map((p) => (
                <RtPhoto key={p} id={p} />
              ))}
              <div className="rt-space" />
            </div>
          </article>
        ))}
        {answers && picked.length > 0 && (
          <section className="rt-answers">
            <b>정답</b>
            <ol>
              {picked.map((n) => (
                <li key={n.id}>{n.answer || '(정답을 안 적었어요)'}</li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

function RtPhoto({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void photoUrl(id).then((u) => on && setUrl(u));
    return () => {
      on = false;
    };
  }, [id]);
  if (!url) return <div className="rt-photo missing">{url === undefined ? '' : '사진을 못 받았어요'}</div>;
  return <img className="rt-photo" src={url} alt="문제 사진" />;
}
