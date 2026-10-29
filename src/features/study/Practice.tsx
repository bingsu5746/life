// 영단어 연습: 카드 넘기기 · 4지선다 · 예문 빈칸 · 듣고 쓰기 (받아쓰기).
// 「오늘 외우기」와 달리 상자(다시 볼 날)는 바꾸지 않는다. 틀린 횟수만 세서 「자주 틀리는 단어」에 쓰인다.
import { playWord } from '../../lib/engDict';
import { useMemo, useRef, useState } from 'react';
import { alive, type Word } from './model';
import { listWords } from './select';
import { getWords, putWords, useStudy, useWords } from './store';
import { makeQuestions, sameAnswer, splitExample, type Question } from './wordTest';
import { choicesFor } from './wordSession';
import { go, toast } from './ui';
import { SwipeCard } from './SwipeCard';
import { WithSpeak } from './Speak';

type PMode = 'card' | 'choice' | 'blank' | 'listen';
const MODE_NAME: Record<PMode, string> = { card: '카드 넘기기', choice: '4지선다', blank: '예문 빈칸', listen: '듣고 쓰기' };
type Scope = 'all' | 'weak' | 'notLearned';

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 원어민 발음(영영 사전에 소리가 있으면), 없으면 기기 읽어 주기
const speak = (text: string) => void playWord(text);
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

interface Item {
  w: Word;
  /** 4지선다·빈칸: 보기 */
  choices?: string[];
  q?: Question;
}

export function Practice({ listId }: { listId?: string }) {
  const d = useStudy();
  const words = useWords();
  const lists = alive(d.wordLists);
  const [src, setSrc] = useState(listId && d.wordLists[listId] ? listId : 'all');
  const [mode, setMode] = useState<PMode>('choice');
  const [dir, setDir] = useState<'en' | 'ko'>('en');
  const [scope, setScope] = useState<Scope>('all');
  const [count, setCount] = useState(20);
  const [items, setItems] = useState<Item[] | null>(null);

  const pool = src === 'all' ? alive(words) : listWords(words, src);
  const base = pool.filter((w) => w.term && (scope === 'all' || (scope === 'weak' ? w.wrong > 0 : !w.learned)));
  const usable = base.filter((w) => (mode === 'blank' ? !!w.example && !!splitExample(w.example.s, w.term) : mode === 'listen' ? true : !!w.meaning));
  const noExample = mode === 'blank' ? base.filter((w) => !w.example).length : 0;

  function start(from = usable) {
    const picked = shuffle(from).slice(0, count);
    const all = alive(getWords());
    const next: Item[] = picked.map((w) => {
      if (mode === 'choice') return { w, choices: choicesFor(w, all, Math.random, dir === 'en' ? 'meaning' : 'term') ?? undefined };
      if (mode === 'blank') return { w, q: makeQuestions([w], ['blankChoice'], 1, all, Math.random, false)[0] };
      return { w };
    });
    if (!next.length) return toast('연습할 단어가 없어요');
    setItems(next);
  }

  if (items) return <Run items={items} mode={mode} dir={dir} onExit={() => setItems(null)} onRetry={(ws) => start(ws)} />;

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go(listId ? `/words/${listId}` : '/words')} aria-label="돌아가기">
          ‹
        </button>
        <h2>단어 연습</h2>
      </div>
      <section className="st-card st-form">
        <label className="st-field">
          <span>단어</span>
          <select className="st-input" value={src} onChange={(e) => setSrc(e.target.value)}>
            <option value="all">모든 단어 ({alive(words).length})</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({listWords(words, l.id).length})
              </option>
            ))}
          </select>
        </label>
        <div className="st-seg" aria-label="방법">
          {(Object.keys(MODE_NAME) as PMode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {MODE_NAME[m]}
            </button>
          ))}
        </div>
        {(mode === 'card' || mode === 'choice') && (
          <div className="st-seg" aria-label="방향">
            <button className={dir === 'en' ? 'on' : ''} aria-pressed={dir === 'en'} onClick={() => setDir('en')}>
              단어 → 뜻
            </button>
            <button className={dir === 'ko' ? 'on' : ''} aria-pressed={dir === 'ko'} onClick={() => setDir('ko')}>
              뜻 → 단어
            </button>
          </div>
        )}
        <div className="st-seg" aria-label="고를 단어">
          {(
            [
              ['all', '전부'],
              ['notLearned', '아직 못 외운 것'],
              ['weak', '틀린 적 있는 것'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={scope === k ? 'on' : ''} aria-pressed={scope === k} onClick={() => setScope(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="st-inline">
          <span>문제 수</span>
          {[10, 20, 50].map((n) => (
            <button key={n} type="button" className={`st-chip ${count === n ? 'on' : ''}`} aria-pressed={count === n} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
        </div>
        {mode === 'blank' && noExample > 0 && <p className="st-hint">예문이 없는 단어 {noExample}개는 빠져요. 단어 목록 화면의 「예문 만들기」로 예문을 넣을 수 있어요.</p>}
        {mode === 'listen' && !canSpeak() && <p className="bad">이 브라우저는 읽어 주기를 지원하지 않아요.</p>}
        <button className="btn btn-primary btn-lg" disabled={!usable.length || (mode === 'listen' && !canSpeak())} onClick={() => start()}>
          시작 ({Math.min(count, usable.length)}문제)
        </button>
      </section>
    </div>
  );
}

function Run({ items, mode, dir, onExit, onRetry }: { items: Item[]; mode: PMode; dir: 'en' | 'ko'; onExit: () => void; onRetry: (ws: Word[]) => void }) {
  const [i, setI] = useState(0);
  const [result, setResult] = useState<boolean[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const cur = items[i];
  const done = i >= items.length;

  function record(ok: boolean) {
    if (!ok) {
      // 틀린 횟수만 센다 (상자·다시 볼 날은 그대로)
      const w = getWords()[cur.w.id];
      if (w && !w.deleted) putWords([{ ...w, wrong: w.wrong + 1 }]);
    }
    setResult((r) => [...r, ok]);
  }
  function next() {
    setI(i + 1);
    setPicked(null);
    setTyped('');
    if (mode === 'listen' && items[i + 1]) setTimeout(() => speak(items[i + 1].w.term), 200);
  }

  const wrongWords = useMemo(() => items.filter((_, k) => result[k] === false).map((x) => x.w), [items, result]);

  if (done) {
    const ok = result.filter(Boolean).length;
    return (
      <div className="st-page narrow">
        <section className="st-card st-done-card">
          <h2>
            {ok}/{items.length} 맞혔어요
          </h2>
          {wrongWords.length > 0 && (
            <div className="pr-wrong">
              {wrongWords.map((w) => (
                <div key={w.id}>
                  <b>{w.term}</b> {w.meaning}
                </div>
              ))}
            </div>
          )}
          <div className="st-row center">
            {wrongWords.length > 0 && (
              <button className="btn btn-primary" onClick={() => onRetry(wrongWords)}>
                틀린 것만 다시
              </button>
            )}
            <button className="btn" onClick={onExit}>
              끝내기
            </button>
          </div>
        </section>
      </div>
    );
  }

  const w = cur.w;
  const front = dir === 'en' ? w.term : w.meaning;
  const back = dir === 'en' ? w.meaning : w.term;
  const answered = result.length > i;

  return (
    <div className="st-page narrow pr-run">
      <div className="st-inline between">
        <button className="st-link" onClick={onExit}>
          그만하기
        </button>
        <small className="st-muted">
          {i + 1}/{items.length} · 맞힘 {result.filter(Boolean).length}
        </small>
      </div>
      <div className="st-bar" role="progressbar" aria-label="진행" aria-valuenow={i} aria-valuemax={items.length}>
        <i style={{ width: `${(i / items.length) * 100}%` }} />
      </div>

      {mode === 'card' && (
        <SwipeCard
          key={`${w.id}:${i}`}
          front={
            dir === 'en' ? (
              <WithSpeak text={w.term}>
                <span lang="en">{front}</span>
              </WithSpeak>
            ) : (
              <span lang="ko">{front}</span>
            )
          }
          back={
            <>
              {dir === 'en' ? (
                <span>{back}</span>
              ) : (
                <WithSpeak text={w.term}>
                  <span>{back}</span>
                </WithSpeak>
              )}
              {w.example && <small className="sw-ex">{w.example.s.replace(/\[|\]/g, '')}</small>}
            </>
          }
          onAnswer={(ok) => (record(ok), next())}
        />
      )}

      {(mode === 'choice' || mode === 'blank') && (
        <>
          <section className="st-card pr-card">
            {mode === 'choice' ? (
              <div className="pr-front" lang={dir === 'en' ? 'en' : 'ko'}>
                {front}
              </div>
            ) : (
              <>
                <div className="pr-sentence" lang="en">
                  {cur.q!.ask}
                </div>
                <small className="st-muted">{cur.q!.hint}</small>
              </>
            )}
          </section>
          {(() => {
            const choices = mode === 'choice' ? cur.choices : cur.q!.choices;
            const right = mode === 'choice' ? back : w.term;
            if (!choices)
              return (
                <p className="st-hint">
                  보기를 만들 단어가 모자라요. 답: <b>{right}</b>{' '}
                  <button className="st-link" onClick={next}>
                    다음
                  </button>
                </p>
              );
            return (
              <div className="pr-choices">
                {choices.map((c) => {
                  const state = picked === null ? '' : c === right ? 'right' : c === picked ? 'wrong' : 'dim';
                  return (
                    <button
                      key={c}
                      className={`pr-choice ${state}`}
                      disabled={picked !== null}
                      onClick={() => {
                        setPicked(c);
                        record(c === right);
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          {picked !== null && (
            <div className="st-row center">
              {mode === 'blank' && <small className="st-muted">정답 문장: {w.example!.s.replace(/\[|\]/g, '')}</small>}
              <button className="btn btn-primary btn-lg" autoFocus onClick={next}>
                다음
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'listen' && (
        <>
          <section className="st-card pr-card">
            <button className="btn btn-lg" onClick={() => speak(w.term)}>
              다시 듣기
            </button>
            <small className="st-muted">들리는 단어를 영어로 써 보세요 (뜻 힌트: {w.meaning || '없음'})</small>
          </section>
          <form
            className="st-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (answered) return next();
              if (!typed.trim()) return;
              record(sameAnswer(typed, w.term));
            }}
          >
            <input ref={input} className="st-input" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={answered} aria-label="들은 단어" />
            <button className="btn btn-primary">{answered ? '다음' : '확인'}</button>
          </form>
          {answered && (
            <p className={result[i] ? 'pr-ok' : 'bad'}>
              {result[i] ? '맞았어요' : `정답: ${w.term}`}
              {!result[i] && (
                <button className="st-link" onClick={() => speak(w.term)}>
                  {' '}
                  다시 듣기
                </button>
              )}
            </p>
          )}
          {i === 0 && !answered && <AutoSpeak term={w.term} />}
        </>
      )}
    </div>
  );
}

/** 첫 문제는 시작하자마자 한 번 읽어 준다 */
function AutoSpeak({ term }: { term: string }) {
  const once = useRef(false);
  if (!once.current) {
    once.current = true;
    setTimeout(() => speak(term), 300);
  }
  return null;
}
