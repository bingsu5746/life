// 오늘 화면: 어제(최근 3일) 적은 「배운 것 한 줄」을 떠올려 보기. 가물가물하면 암기 카드로
import { useState } from 'react';
import { addDays } from './dates';
import { alive, newId, type MemoCard, type StudySession } from './model';
import { put, useStudy } from './store';
import { SubjectDot, toast } from './ui';

export function RecallCard({ today }: { today: string }) {
  const d = useStudy();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const list = alive(d.sessions)
    .filter((s) => s.learned && !s.learnedCheck && s.date < today && s.date >= addDays(today, -3))
    .sort((a, b) => a.start - b.start)
    .slice(0, 5);
  if (!list.length) return null;
  const done = (s: StudySession, ok: boolean) => {
    put('sessions', { ...s, learnedCheck: ok ? 'ok' : 'fuzzy' });
    if (ok) return toast('기억하고 있네요 👍');
    // 그 과목 「배운 것」 카드 묶음에 넣는다 (없으면 만든다)
    const sid = s.subjectId ?? '';
    let deck = alive(d.decks).find((x) => x.name === '배운 것' && x.subjectId === sid);
    if (!deck) {
      deck = { id: newId(), name: '배운 것', subjectId: sid, updatedAt: 0 };
      put('decks', deck);
    }
    put('cards', { id: newId(), deckId: deck.id, front: s.memo ? `${s.memo} — 무엇을 배웠지?` : `${d.subjects[sid]?.name ?? ''} ${s.date.slice(5).replace('-', '/')}에 배운 것`.trim(), back: s.learned!, created: Date.now(), box: 0, due: today, wrong: 0 } as MemoCard);
    toast('암기 카드 「배운 것」에 넣었어요');
  };
  return (
    <section className="st-card">
      <h3 className="st-h">🧠 지난번에 배운 것, 기억나요?</h3>
      {list.map((s) => (
        <div key={s.id} className="rc-row">
          <div className="st-inline">
            <SubjectDot id={s.subjectId} d={d} />
            <small className="st-muted">
              {d.subjects[s.subjectId ?? '']?.name ?? '공부'} · {s.date.slice(5).replace('-', '/')}
              {s.memo ? ` · ${s.memo}` : ''}
            </small>
          </div>
          {open.has(s.id) ? (
            <>
              <b>{s.learned}</b>
              <div className="st-inline">
                <button className="btn btn-sm btn-primary" onClick={() => done(s, true)}>
                  기억났어요
                </button>
                <button className="btn btn-sm" onClick={() => done(s, false)}>
                  가물가물 → 카드로
                </button>
              </div>
            </>
          ) : (
            <button className="st-link" onClick={() => setOpen(new Set(open).add(s.id))}>
              머릿속으로 떠올려 본 뒤 보기
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
