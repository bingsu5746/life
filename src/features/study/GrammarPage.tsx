// 영어 어법: 유형마다 무엇을 보는지 · 확인할 것 · 예, 그리고 내 오답 중 그 유형 (오답 노트에서 유형을 고른 것)
import { useState } from 'react';
import { GRAMMAR_TYPES, isEnglish } from './grammar';
import { alive } from './model';
import { useStudy } from './store';
import { go, tap } from './ui';

export function GrammarPage({ open: open0 }: { open?: string }) {
  const d = useStudy();
  const [open, setOpen] = useState(open0 ?? '');
  const notes = alive(d.notes).filter((n) => n.grammar && isEnglish(d.subjects[n.subjectId]?.name));
  const count = (k: string) => notes.filter((n) => n.grammar === k);
  const weak = GRAMMAR_TYPES.map((g) => ({ g, n: count(g.key).filter((x) => !x.learned).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>영어 어법</h2>
      </div>
      <p className="st-hint">수능 · 모의고사 어법 문제(밑줄 친 것 중 어법상 틀린 것 고르기)에서 따져 보는 유형들이에요. 영어 오답 노트에서 「어법 유형」을 고르면 유형마다 모아 보여 줘요.</p>
      {weak.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">내가 자주 틀리는 유형</h3>
          <p className="st-sub">{weak.slice(0, 3).map((x) => `${x.g.name} ${x.n}개`).join(' · ')}</p>
        </section>
      )}
      <div className="gm-list">
        {GRAMMAR_TYPES.map((g) => {
          const mine = count(g.key);
          const isOpen = open === g.key;
          return (
            <section key={g.key} className={`st-card gm ${isOpen ? 'open' : ''}`}>
              <button className="gm-head" onClick={() => setOpen(isOpen ? '' : g.key)} aria-expanded={isOpen}>
                <b>{g.name}</b>
                {mine.length > 0 && <span className="st-pill">내 오답 {mine.length}</span>}
              </button>
              <p className="st-sub">{g.what}</p>
              {isOpen && (
                <>
                  <ul className="gm-check">
                    {g.check.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="gm-ex">{g.example}</p>
                  {mine.map((n) => (
                    <div key={n.id} className="st-item st-tap" {...tap(() => go('/review'))}>
                      <div className="st-item-main">
                        <div className="st-item-title">{n.question.split('\n')[0].slice(0, 60) || '(사진 문제)'}</div>
                        <div className="st-item-sub">{n.learned ? '해결됨' : `틀린 횟수 ${n.wrong}`}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
