// 영단어 시험지 만들기: 뜻 쓰기 · 단어 쓰기 · 예문 빈칸(쓰기·고르기). 인쇄하거나 화면에서 답 확인
import { useMemo, useState } from 'react';
import { fillExamples } from './actions';
import { isLoggedIn } from '../auth/api';
import { alive } from './model';
import { listWords } from './select';
import { useStudy, useWords } from './store';
import { makeQuestions, QKIND_NAME, type QKind } from './wordTest';
import { go, toast } from './ui';

export function WordTestSheet({ listId }: { listId: string }) {
  const d = useStudy();
  const words = useWords();
  const list = d.wordLists[listId];
  const ws = list ? listWords(words, listId) : [];
  const days = [...new Set(ws.map((w) => w.day).filter((x): x is number => x !== undefined))].sort((a, b) => a - b);
  const [kinds, setKinds] = useState<QKind[]>(['meaning', 'term']);
  const [count, setCount] = useState(20);
  const [from, setFrom] = useState(days[0] ?? 0);
  const [to, setTo] = useState(days[days.length - 1] ?? 0);
  const [seed, setSeed] = useState(1);
  const [answers, setAnswers] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const picked = days.length ? ws.filter((w) => w.day === undefined || (w.day >= from && w.day <= to)) : ws;
  const withEx = picked.filter((w) => w.example).length;
  const wantsEx = kinds.some((k) => k === 'blank' || k === 'blankChoice');
  // 다시 만들기를 누를 때만 섞는다 (그리는 동안 문제가 바뀌지 않게)
  const qs = useMemo(() => {
    let x = seed * 9301 + 49297;
    const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return makeQuestions(picked, kinds, count, alive(words), rand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, kinds, count, from, to, listId, picked.length]);

  if (!list || list.deleted) return null;

  async function makeEx() {
    if (!isLoggedIn()) return toast('예문 만들기는 로그인한 뒤에 쓸 수 있어요');
    setBusy('예문 만드는 중…');
    try {
      const n = await fillExamples(picked, (a, b) => setBusy(`예문 만드는 중… ${a}/${b}`));
      toast(`${n}단어에 예문을 넣었어요. AI 가 만든 문장이라 한 번 확인해 주세요`);
      setSeed(seed + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : '예문을 만들지 못했어요');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="st-page narrow wt">
      <div className="st-page-head no-print">
        <button className="st-back" onClick={() => go(`/words/${listId}`)} aria-label="단어 목록">
          ‹
        </button>
        <h2>시험지 만들기</h2>
      </div>
      <section className="st-card st-form no-print">
        <div className="st-chips">
          {(Object.keys(QKIND_NAME) as QKind[]).map((k) => {
            const on = kinds.includes(k);
            return (
              <button key={k} type="button" className={`st-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setKinds(on ? kinds.filter((x) => x !== k) : [...kinds, k])}>
                {QKIND_NAME[k]}
              </button>
            );
          })}
        </div>
        <div className="st-inline wrap">
          <span>문제 수</span>
          {[10, 20, 30, 50].map((n) => (
            <button key={n} type="button" className={`st-chip ${count === n ? 'on' : ''}`} aria-pressed={count === n} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
          {days.length > 1 && (
            <>
              <span>Day</span>
              <input className="st-input xs" inputMode="numeric" value={from} onChange={(e) => setFrom(Number(e.target.value.replace(/\D/g, '')) || 0)} aria-label="시작 Day" />~
              <input className="st-input xs" inputMode="numeric" value={to} onChange={(e) => setTo(Number(e.target.value.replace(/\D/g, '')) || 0)} aria-label="끝 Day" />
            </>
          )}
        </div>
        {wantsEx && (
          <p className="st-hint">
            예문이 있는 단어 {withEx}/{picked.length}개. 예문이 없는 단어의 빈칸 문제는 뜻 쓰기로 바뀌어요.{' '}
            {withEx < picked.length && (
              <button className="st-link" disabled={!!busy} onClick={() => void makeEx()}>
                {busy ?? `나머지 ${picked.length - withEx}개 예문 만들기 (AI)`}
              </button>
            )}
          </p>
        )}
        <div className="st-row">
          <button className="btn btn-sm" onClick={() => setSeed(seed + 1)}>
            다시 섞기
          </button>
          <label className="st-toggle">
            <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> 답 보기
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
            인쇄
          </button>
        </div>
      </section>

      <article className="wt-paper">
        <header className="wt-head">
          <b>{list.name}</b>
          <span>
            {qs.length}문제 · 이름 ________ · 점수 ____/{qs.length}
          </span>
        </header>
        <ol className="wt-list">
          {qs.map((q) => (
            <li key={q.n} className="wt-q">
              <span className="wt-kind">
                <b className="wt-n">{q.n}.</b> {QKIND_NAME[q.kind].replace(/ \(.*\)/, '')}
              </span>
              <span className="wt-ask" lang={q.kind === 'term' ? 'ko' : 'en'}>
                {q.ask}
              </span>
              {q.hint && <small className="wt-hint">{q.hint}</small>}
              {q.choices && (
                <span className="wt-choices">
                  {q.choices.map((c, i) => (
                    <span key={c}>
                      {'①②③④'[i]} {c}
                    </span>
                  ))}
                </span>
              )}
              {!q.choices && <span className="wt-line" />}
              {answers && <span className="wt-answer">답: {q.choices ? `${'①②③④'[q.choices.indexOf(q.answer)]} ${q.answer}` : q.answer}</span>}
            </li>
          ))}
        </ol>
        {!answers && (
          <details className="wt-key no-print">
            <summary>정답 보기</summary>
            <ol>
              {qs.map((q) => (
                <li key={q.n}>{q.choices ? `${'①②③④'[q.choices.indexOf(q.answer)]} ${q.answer}` : q.answer}</li>
              ))}
            </ol>
          </details>
        )}
      </article>
    </div>
  );
}
