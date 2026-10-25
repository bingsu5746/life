// 한국어 ↔ 영어 번역기. 번역은 서버(worker/translate.ts)가 하고, 로그인한 사람만 쓸 수 있다 (무료 한도를 지키려고).
// 영어 낱말을 한국어로 바꾸면 「모르는 단어 모음」에 바로 넣을 수 있다.
import { useEffect, useRef, useState } from 'react';
import { translate } from '../auth/api';
import { addToInbox } from './actions';
import { useWords } from './store';
import { toast, useToday } from './ui';

type Lang = 'ko' | 'en';
const NAME: Record<Lang, string> = { ko: '한국어', en: '영어' };
const MAX = 2000;
const RECENT_KEY = 'my-study.translate.recent';

interface Recent {
  from: string;
  to: string;
  target: Lang;
}

const hasHangul = (s: string) => /[ㄱ-ㆎ가-힣]/.test(s);
/** 낱말 하나나 짧은 말(세 낱말까지)인 영어인지: 단어 모음에 넣을 수 있는지 */
const isShortEnglish = (s: string) => /^[A-Za-z][A-Za-z'\-.]*( [A-Za-z][A-Za-z'\-.]*){0,2}$/.test(s.trim());

function readRecent(): Recent[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Recent[];
    return Array.isArray(r) ? r.filter((x) => x && typeof x.from === 'string' && typeof x.to === 'string' && (x.target === 'ko' || x.target === 'en')).slice(0, 10) : [];
  } catch {
    return [];
  }
}
function saveRecent(list: Recent[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    // 저장할 수 없는 환경
  }
}

/** 기기의 읽어 주기 (있을 때만) */
function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
function speak(text: string, lang: Lang) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'en' ? 'en-US' : 'ko-KR';
  window.speechSynthesis.speak(u);
}

export function Translate({ loggedIn, onLogin }: { loggedIn: boolean; onLogin: () => void }) {
  const [text, setText] = useState('');
  // 바꿀 언어. 사람이 직접 고르기 전에는 넣은 글을 보고 정한다
  const [target, setTarget] = useState<Lang>('en');
  const [manual, setManual] = useState(false);
  const [result, setResult] = useState<{ from: string; to: string; target: Lang } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<Recent[]>(readRecent);
  const words = useWords();
  const today = useToday();
  const input = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);

  const auto: Lang = text.trim() ? (hasHangul(text) ? 'en' : 'ko') : target;
  const to = manual ? target : auto;
  const from: Lang = to === 'en' ? 'ko' : 'en';

  useEffect(() => () => void (canSpeak() && window.speechSynthesis.cancel()), []);

  async function run() {
    const t = text.trim();
    if (!t || busy) return;
    if (!loggedIn) return onLogin();
    const my = ++seq.current;
    setBusy(true);
    setError('');
    try {
      const r = await translate(t, to);
      if (my !== seq.current) return;
      const item = { from: t, to: r.text, target: r.to };
      setResult(item);
      const next = [item, ...recent.filter((x) => !(x.from === t && x.target === r.to))].slice(0, 10);
      setRecent(next);
      saveRecent(next);
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : '번역하지 못했어요.');
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }

  function swap() {
    // 결과가 있으면 결과를 다시 넣고 반대로 (확인 번역)
    if (result && result.from === text.trim()) setText(result.to);
    setTarget(from);
    setManual(true);
    setResult(null);
    input.current?.focus();
  }

  async function copy(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      toast('복사했어요');
    } catch {
      toast('복사할 수 없어요. 글을 길게 눌러 복사해 주세요');
    }
  }

  const shown = result && result.from === text.trim() ? result : null;
  const word = shown && shown.target === 'ko' && isShortEnglish(shown.from) ? shown.from.trim() : shown && shown.target === 'en' && isShortEnglish(shown.to) ? shown.to.trim() : '';
  const meaning = word ? (shown!.target === 'ko' ? shown!.to : shown!.from) : '';

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>번역</h2>
      </div>

      <section className="st-card tr-box">
        <div className="tr-langs">
          <span>{NAME[from]}</span>
          <button className="btn btn-sm tr-swap" onClick={swap} aria-label="번역 방향 바꾸기" title="방향 바꾸기">
            ⇄
          </button>
          <span>{NAME[to]}</span>
          {manual && (
            <button className="st-link tr-auto" onClick={() => setManual(false)}>
              자동으로
            </button>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <label className="sr-only" htmlFor="tr-input">
            번역할 글
          </label>
          <textarea
            id="tr-input"
            ref={input}
            className="st-input tr-input"
            rows={5}
            maxLength={MAX}
            placeholder={from === 'ko' ? '한국어를 넣으면 영어로 바꿔요' : 'Type English to translate into Korean'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void run();
              }
            }}
          />
          <div className="tr-row">
            <small className="st-muted">
              {text.length.toLocaleString()} / {MAX.toLocaleString()}
            </small>
            {text && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setText('');
                  setResult(null);
                  setError('');
                  input.current?.focus();
                }}
              >
                지우기
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={!text.trim() || busy}>
              {busy ? '번역하는 중…' : loggedIn ? '번역' : '로그인하고 번역'}
            </button>
          </div>
        </form>
        {!loggedIn && <p className="st-hint">번역은 로그인한 뒤에 쓸 수 있어요 (서버의 무료 사용량을 지키려고요).</p>}
        {error && (
          <p className="st-hint bad" role="alert">
            {error}
          </p>
        )}
      </section>

      {shown && (
        <section className="st-card tr-box" aria-live="polite">
          <p className="tr-out" lang={shown.target}>
            {shown.to}
          </p>
          <div className="tr-row">
            {canSpeak() && (
              <button className="btn btn-sm" onClick={() => speak(shown.to, shown.target)}>
                듣기
              </button>
            )}
            <button className="btn btn-sm" onClick={() => void copy(shown.to)}>
              복사
            </button>
            {word && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  addToInbox(word, meaning, words, today);
                  toast(`「${word}」 단어를 모르는 단어 모음에 넣었어요`);
                }}
              >
                단어 모음에 넣기
              </button>
            )}
          </div>
          <p className="st-hint">AI 번역이라 틀릴 수 있어요. 시험·숙제에 쓸 때는 사전이나 교과서로 한 번 더 확인해 주세요.</p>
        </section>
      )}

      {recent.length > 0 && (
        <section className="st-card">
          <div className="tr-row">
            <h3 className="st-h">최근 번역</h3>
            <button
              className="st-link"
              onClick={() => {
                setRecent([]);
                saveRecent([]);
              }}
            >
              모두 지우기
            </button>
          </div>
          <ul className="tr-recent">
            {recent.map((r, i) => (
              <li key={i}>
                <button
                  className="tr-recent-item"
                  onClick={() => {
                    setText(r.from);
                    setTarget(r.target);
                    setManual(true);
                    setResult(r);
                    setError('');
                  }}
                >
                  <span>{r.from}</span>
                  <small className="st-muted">{r.to}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
