// 등하교 단어 듣기 모드: 화면을 안 봐도 되게 단어 → (잠깐) → 뜻을 차례로 읽어 준다 (기기의 읽어 주기)
import { useEffect, useRef, useState } from 'react';
import { canSpeak, speakWait, stopSpeak } from '../../lib/speak';
import { alive, type Word } from './model';
import { useStudy, useWords } from './store';
import { go } from './ui';

type Source = 'all' | 'weak' | string;
interface Opt {
  src: Source;
  shuffle: boolean;
  rep: 1 | 2;
  meaning: boolean;
  rate: number;
  gap: number;
}
const KEY = 'my-study.listen.v1';
const loadOpt = (): Opt => {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Opt> | null;
    if (o) return { src: typeof o.src === 'string' ? o.src : 'all', shuffle: !!o.shuffle, rep: o.rep === 2 ? 2 : 1, meaning: o.meaning !== false, rate: typeof o.rate === 'number' ? o.rate : 0.9, gap: typeof o.gap === 'number' ? o.gap : 1.5 };
  } catch {
    /* 무시 */
  }
  return { src: 'all', shuffle: false, rep: 1, meaning: true, rate: 0.9, gap: 1.5 };
};
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** 들을 단어 고르기 (자주 틀린 단어 = 틀린 적 있는 단어, 많이 틀린 순) */
export function listenWords(words: Word[], lists: Record<string, { deleted?: boolean }>, src: Source): Word[] {
  const ok = words.filter((w) => w.term && w.meaning && lists[w.listId] && !lists[w.listId].deleted);
  if (src === 'weak') return ok.filter((w) => w.wrong > 0).sort((a, b) => b.wrong - a.wrong);
  if (src === 'all') return ok.sort((a, b) => a.listId.localeCompare(b.listId) || a.order - b.order);
  return ok.filter((w) => w.listId === src).sort((a, b) => a.order - b.order);
}

export function WordListen() {
  const d = useStudy();
  const words = useWords();
  const [opt, setOptState] = useState<Opt>(loadOpt);
  const setOpt = (p: Partial<Opt>) => {
    const next = { ...opt, ...p };
    setOptState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 무시 */
    }
  };
  const lists = alive(d.wordLists);
  const base = listenWords(alive(words), d.wordLists, opt.src);
  const [order, setOrder] = useState<Word[]>([]);
  const [i, setI] = useState(0);
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<'term' | 'meaning' | ''>('');
  const run = useRef(0);

  // 화면 꺼짐 막기 (켜 두는 동안)
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [on]);
  useEffect(
    () => () => {
      run.current++;
      stopSpeak();
    },
    [],
  );

  async function play(list: Word[], from: number) {
    const my = ++run.current;
    setOn(true);
    for (let k = from; k < list.length; k++) {
      if (run.current !== my) return;
      setI(k);
      const w = list[k];
      const lang = d.wordLists[w.listId]?.lang === 'ko' ? 'ko' : 'en';
      for (let r = 0; r < opt.rep; r++) {
        setPhase('term');
        await speakWait(w.term, lang, opt.rate);
        if (run.current !== my) return;
        await wait(r < opt.rep - 1 ? 700 : opt.gap * 1000);
        if (run.current !== my) return;
      }
      if (opt.meaning) {
        setPhase('meaning');
        await speakWait(w.meaning, 'ko', opt.rate);
        if (run.current !== my) return;
        await wait(opt.gap * 1000);
      }
    }
    if (run.current === my) {
      setOn(false);
      setPhase('');
    }
  }
  const start = () => {
    const list = opt.shuffle ? [...base].sort(() => Math.random() - 0.5) : base;
    setOrder(list);
    void play(list, 0);
  };
  const stop = () => {
    run.current++;
    stopSpeak();
    setOn(false);
    setPhase('');
  };
  const cur = order[i];

  if (!canSpeak())
    return (
      <div className="st-page narrow">
        <h2>단어 듣기</h2>
        <p className="st-hint">이 브라우저는 읽어 주기를 지원하지 않아요.</p>
      </div>
    );

  if (on || (order.length && cur))
    return (
      <div className="focus wl-listen show">
        <div className="focus-top">
          <span>단어 듣기</span>
          <small>
            {i + 1} / {order.length}
          </small>
        </div>
        <div className="wl-card">
          <b className={phase === 'term' ? 'on' : ''}>{cur?.term}</b>
          <span className={phase === 'meaning' ? 'on' : ''}>{opt.meaning || !on ? cur?.meaning : ''}</span>
        </div>
        <div className="focus-bottom">{!on && i >= order.length - 1 ? '다 들었어요' : on ? '화면을 꺼 두면 기기에 따라 멈출 수 있어요' : '멈춤'}</div>
        <div className="focus-ctl">
          <div className="focus-btns">
            <button onClick={() => (stop(), void play(order, Math.max(0, i - 1)))} disabled={i === 0}>
              ‹ 앞
            </button>
            {on ? (
              <button className="primary" onClick={stop}>
                멈춤
              </button>
            ) : (
              <button className="primary" onClick={() => void play(order, i >= order.length - 1 && !phase ? 0 : i)}>
                {i >= order.length - 1 && !phase ? '처음부터' : '이어서'}
              </button>
            )}
            <button onClick={() => (stop(), void play(order, Math.min(order.length - 1, i + 1)))} disabled={i >= order.length - 1}>
              다음 ›
            </button>
            <button
              onClick={() => {
                stop();
                setOrder([]);
                setI(0);
              }}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go('/words')} aria-label="단어">
          ‹
        </button>
        <h2>단어 듣기</h2>
      </div>
      <p className="st-hint">등하교 길처럼 화면을 보기 어려울 때, 단어와 뜻을 차례로 읽어 줘요. 이어폰을 꽂고 시작하세요. 기기의 읽어 주기를 써서 화면을 끄거나 다른 앱으로 가면 멈추는 기기가 있어요 (켜 두는 동안 화면이 꺼지지 않게 해요).</p>
      <section className="st-card st-form">
        <label className="st-cond-time">
          들을 단어
          <select className="st-input" value={opt.src} onChange={(e) => setOpt({ src: e.target.value })}>
            <option value="all">모든 단어</option>
            <option value="weak">자주 틀린 단어</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="st-inline wrap">
          <label className="st-toggle">
            <input type="checkbox" checked={opt.shuffle} onChange={(e) => setOpt({ shuffle: e.target.checked })} /> 섞기
          </label>
          <label className="st-toggle">
            <input type="checkbox" checked={opt.meaning} onChange={(e) => setOpt({ meaning: e.target.checked })} /> 뜻도 읽기
          </label>
          <label className="st-toggle">
            <input type="checkbox" checked={opt.rep === 2} onChange={(e) => setOpt({ rep: e.target.checked ? 2 : 1 })} /> 단어 두 번
          </label>
        </div>
        <div className="st-inline wrap">
          <span className="st-muted">빠르기</span>
          <div className="st-seg sm">
            {[0.7, 0.9, 1.1].map((r) => (
              <button key={r} className={opt.rate === r ? 'on' : ''} onClick={() => setOpt({ rate: r })}>
                {r === 0.7 ? '천천히' : r === 0.9 ? '보통' : '빠르게'}
              </button>
            ))}
          </div>
          <span className="st-muted">사이</span>
          <div className="st-seg sm">
            {[1, 1.5, 3].map((g) => (
              <button key={g} className={opt.gap === g ? 'on' : ''} onClick={() => setOpt({ gap: g })}>
                {g}초
              </button>
            ))}
          </div>
        </div>
        <div className="st-row">
          <button className="btn btn-primary" disabled={!base.length} onClick={start}>
            {base.length ? `${base.length}단어 듣기 시작` : '들을 단어가 없어요'}
          </button>
        </div>
      </section>
    </div>
  );
}
