// 문제 풀이: AI 대화 화면. ＋ 로 사진 넣기 · 모델 고르기 · 보내기. 대화는 이 기기에만 저장(글만)
import { useEffect, useRef, useState } from 'react';
import { isLoggedIn, solveAsk, solveUsage, type SolveEngine, type SolveTurn } from '../auth/api';
import { MathText } from '../../lib/mathText';
import { shrink } from './photos';
import { Icon, Sheet, toast } from './ui';

const ENGINES: { key: SolveEngine; name: string; desc: string }[] = [
  { key: 'gemini', name: 'Gemini Flash', desc: '무료 · 사진 읽기 · 빠르고 정확해요' },
  { key: 'gemini-pro', name: 'Gemini Pro', desc: '가장 똑똑해요 · 결제를 켠 키에서만 · 하루 10번' },
  { key: 'openrouter', name: 'OpenRouter', desc: '무료 모델 자동 선택 · 하루 횟수 적음' },
  { key: 'cloudflare', name: 'Cloudflare AI', desc: '무료 · 글만 (사진은 기기에서 글자로 읽어 보내요)' },
];

interface Msg extends SolveTurn {
  /** 사진 미리보기 (이 화면에서만) */
  thumbs?: string[];
  model?: string;
  error?: boolean;
}
interface Chat {
  id: string;
  at: number;
  title: string;
  msgs: Msg[];
}

const ENGINE_KEY = 'my-study.solve.engine';
const CHATS_KEY = 'my-study.solve.chats';
const load = <T,>(k: string, fb: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? fb;
  } catch {
    return fb;
  }
};
/** 대화는 글만 최근 20개 (사진은 저장하지 않는다: 저장 공간) */
function saveChat(c: Chat) {
  try {
    const list = load<Chat[]>(CHATS_KEY, []).filter((x) => x.id !== c.id);
    const slim: Chat = { ...c, msgs: c.msgs.map((m) => ({ role: m.role, text: m.text, model: m.model, error: m.error, images: undefined, thumbs: undefined })) };
    localStorage.setItem(CHATS_KEY, JSON.stringify([slim, ...list].slice(0, 20)));
  } catch {
    /* 가득 차면 저장하지 않는다 */
  }
}

const toB64 = async (b: Blob) => {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
};

export function Solve() {
  const [engine, setEngine] = useState<SolveEngine>(() => load<SolveEngine>(ENGINE_KEY, 'gemini'));
  const [chat, setChat] = useState<Chat>(() => ({ id: Date.now().toString(36), at: Date.now(), title: '', msgs: [] }));
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ blob: Blob; url: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [picker, setPicker] = useState(false);
  const [history, setHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const eng = ENGINES.find((e) => e.key === engine) ?? ENGINES[0];
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof solveUsage>> | null>(null);
  useEffect(() => {
    if (picker && isLoggedIn())
      solveUsage()
        .then(setUsage)
        .catch(() => setUsage(null));
  }, [picker]);
  /** 오늘 쓴 횟수 · 남은 횟수 (한도를 알 때만) */
  const countText = (k: SolveEngine) => {
    if (!usage) return '';
    if (usage.out[k]) return '오늘은 다 썼어요';
    const n = usage.used[k] ?? 0;
    const lim = usage.limits[k];
    return lim ? `오늘 ${Math.max(0, lim - n)}번 더` : `오늘 ${n}번 씀`;
  };
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [chat.msgs.length, busy]);
  useEffect(() => {
    const a = area.current;
    if (!a) return;
    a.style.height = 'auto';
    a.style.height = `${Math.min(a.scrollHeight, 200)}px`;
  }, [text]);

  async function send() {
    if (busy || (!text.trim() && !files.length)) return;
    if (!isLoggedIn()) return toast('풀이는 로그인한 뒤에 쓸 수 있어요');
    const pics = files;
    let q = text.trim();
    setText('');
    setFiles([]);
    let images: SolveTurn['images'];
    try {
      if (pics.length && engine === 'cloudflare') {
        // 글만 읽는 모델: 사진 글자를 기기에서 읽어 함께 보낸다
        const { readImageText } = await import('../../lib/ocr');
        let read = '';
        for (const [i, p] of pics.entries()) {
          setBusy(`사진 글자 읽는 중 ${i + 1}/${pics.length}`);
          read += (await readImageText(p.blob)).trim() + '\n';
        }
        q = `${q}\n\n[사진에서 읽은 문제]\n${read.trim()}`.trim();
      } else if (pics.length) {
        setBusy('사진 준비 중');
        images = await Promise.all(pics.map(async (p) => ({ mime: 'image/jpeg', data: await toB64(await shrink(p.blob)) })));
      }
    } catch {
      setBusy('');
      return toast('사진을 준비하지 못했어요');
    }
    const user: Msg = { role: 'user', text: q, images, thumbs: pics.map((p) => p.url) };
    const msgs = [...chat.msgs, user];
    const next = { ...chat, title: chat.title || q.slice(0, 40) || '사진 문제', msgs };
    setChat(next);
    setBusy('푸는 중');
    try {
      // 앞 대화는 글만 (사진은 이번 질문 것만 보내서 무겁지 않게)
      const turns: SolveTurn[] = msgs.filter((m) => !m.error).map((m, i, all) => ({ role: m.role, text: m.text, images: i === all.length - 1 ? m.images : undefined }));
      const r = await solveAsk(engine, turns);
      const done = { ...next, at: Date.now(), msgs: [...msgs, { role: 'assistant' as const, text: r.text, model: r.model }] };
      setChat(done);
      saveChat(done);
    } catch (e) {
      const done = { ...next, msgs: [...msgs, { role: 'assistant' as const, text: e instanceof Error ? e.message : '풀지 못했어요', error: true }] };
      setChat(done);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="sv">
      <div className="sv-head">
        <button className="st-link" onClick={() => setHistory(true)}>
          지난 대화
        </button>
        {chat.msgs.length > 0 && (
          <button className="st-link" onClick={() => setChat({ id: Date.now().toString(36), at: Date.now(), title: '', msgs: [] })}>
            새 대화
          </button>
        )}
      </div>
      <div className="sv-msgs">
        {!chat.msgs.length && (
          <div className="sv-empty">
            <Icon name="solve" />
            <b>어떤 문제를 풀어 볼까요?</b>
          </div>
        )}
        {chat.msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="sv-user">
              {m.thumbs && m.thumbs.length > 0 && (
                <div className="sv-thumbs">
                  {m.thumbs.map((u) => (
                    <img key={u} src={u} alt="문제 사진" />
                  ))}
                </div>
              )}
              {m.text && <p>{m.text}</p>}
            </div>
          ) : (
            <div key={i} className={`sv-ai ${m.error ? 'bad' : ''}`}>
              {m.error ? <p>{m.text}</p> : <MathText text={m.text} />}
              {m.model && (
                <div className="sv-meta">
                  <small>{m.model}</small>
                  <button className="st-link" onClick={() => void navigator.clipboard?.writeText(m.text).then(() => toast('복사했어요'))}>
                    복사
                  </button>
                </div>
              )}
            </div>
          ),
        )}
        {busy && <div className="sv-ai sv-busy">{busy}…</div>}
        <div ref={endRef} />
      </div>

      <div className="sv-box">
        {files.length > 0 && (
          <div className="sv-files">
            {files.map((f, i) => (
              <div key={f.url} className="sv-file">
                <img src={f.url} alt="넣은 사진" />
                <button aria-label="사진 빼기" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={area}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 한글 조합 중 엔터는 글자 확정이라 보내지 않는다
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="문제를 쓰거나 사진을 넣어 주세요"
          aria-label="문제"
        />
        <div className="sv-tools">
          <button className="sv-round" aria-label="사진 넣기" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const add = [...(e.target.files ?? [])].slice(0, 4 - files.length).map((blob) => ({ blob, url: URL.createObjectURL(blob) }));
              setFiles([...files, ...add]);
              e.target.value = '';
            }}
          />
          <button className="sv-model" onClick={() => setPicker(true)}>
            {eng.name} ▾
          </button>
          <button className="sv-send" aria-label="보내기" disabled={!!busy || (!text.trim() && !files.length)} onClick={() => void send()}>
            <Icon name="up" />
          </button>
        </div>
      </div>

      {picker && (
        <Sheet title="모델 고르기" onClose={() => setPicker(false)}>
          <div className="sv-pick">
            {ENGINES.map((e) => (
              <button
                key={e.key}
                className={engine === e.key ? 'on' : ''}
                onClick={() => {
                  setEngine(e.key);
                  try {
                    localStorage.setItem(ENGINE_KEY, JSON.stringify(e.key));
                  } catch {
                    /* 무시 */
                  }
                  setPicker(false);
                }}
              >
                <span>
                  <b>{e.name}</b>
                  <small>{e.desc}</small>
                </span>
                <span className="sv-right">
                  {countText(e.key) && <small className={usage?.out[e.key] ? 'bad' : ''}>{countText(e.key)}</small>}
                  {engine === e.key && <span className="sv-check">✓</span>}
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {history && (
        <Sheet title="지난 대화" onClose={() => setHistory(false)}>
          <div className="sv-pick">
            {!load<Chat[]>(CHATS_KEY, []).length && <p className="st-muted">아직 없어요.</p>}
            {load<Chat[]>(CHATS_KEY, []).map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setChat(c);
                  setHistory(false);
                }}
              >
                <span>
                  <b>{c.title}</b>
                  <small>{new Date(c.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
