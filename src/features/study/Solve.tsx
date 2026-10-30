// 문제 풀이: AI 대화 화면. ＋ 로 사진 넣기 · 모델 고르기 · 보내기. 대화는 이 기기에만 저장(글만)
import { useEffect, useRef, useState } from 'react';
import { ApiError, isLoggedIn, solveAsk, solveImgPut, solveImgUrl, solveUsage, type SolveEngine, type SolveTurn } from '../auth/api';
import { MathText } from '../../lib/mathText';
import { compressProblemImage } from '../../lib/imageCompress';
import { Icon, Sheet, subjectsOf, SubjectDot, toast } from './ui';
import { useStudy } from './store';
import { guessNoteSubject } from './mistakes';

const ENGINES: { key: SolveEngine; name: string; desc: string }[] = [
  { key: 'gemini', name: 'Gemini Flash', desc: '무료 · 전 과목 올라운더' },
  { key: 'siliconflow', name: 'SiliconFlow', desc: '무료 · 수학/물리 고난도 계산 특화' },
  { key: 'mistral', name: 'Mistral', desc: '무료 · 과학 표/그래프 · 복잡한 수식 사진 읽기 특화' },
  { key: 'groq', name: 'Groq', desc: '무료 · 영어 독해 · 초고속 답변' },
  { key: 'nvidia', name: 'NVIDIA NIM', desc: '무료 · 고3 4점 킬러 문항용 초대형 모델' },
  { key: 'openrouter', name: 'OpenRouter', desc: '무료 모델 자동 선택 · 사진 읽기' },
  { key: 'cloudflare', name: 'Cloudflare AI', desc: '무료 · 사진은 Llama 3.2 Vision (어려운 문제는 약해요)' },
];

interface Msg extends SolveTurn {
  /** 사진 미리보기 (이 화면에서만) */
  thumbs?: string[];
  /** R2 에 올린 사진 (지난 대화에서도 보이게) */
  imgKeys?: string[];
  model?: string;
  error?: boolean;
}
interface Chat {
  id: string;
  at: number;
  title: string;
  /** 과목 (나중에 문제 저장소로 모을 때) */
  subjectId?: string;
  msgs: Msg[];
}

const ENGINE_KEY = 'my-study.solve.engine';
const SUBJECT_KEY = 'my-study.solve.subject';
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
    const slim: Chat = { ...c, msgs: c.msgs.map((m) => ({ role: m.role, text: m.text, model: m.model, error: m.error, imgKeys: m.imgKeys, images: undefined, thumbs: undefined })) };
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
  const d = useStudy();
  const [chat, setChat] = useState<Chat>(() => ({ id: Date.now().toString(36), at: Date.now(), title: '', subjectId: load<string>(SUBJECT_KEY, '') || undefined, msgs: [] }));
  const [subPick, setSubPick] = useState(false);
  const subject = chat.subjectId && d.subjects[chat.subjectId] && !d.subjects[chat.subjectId].deleted ? d.subjects[chat.subjectId] : undefined;
  const setSubject = (id: string | undefined) => {
    setChat((c) => {
      const next = { ...c, subjectId: id };
      if (c.msgs.length) saveChat(next);
      return next;
    });
    try {
      localStorage.setItem(SUBJECT_KEY, JSON.stringify(id ?? ''));
    } catch {
      /* 무시 */
    }
  };
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
    if (isLoggedIn())
      solveUsage()
        .then((u) => {
          setUsage(u);
          // 고른 모델의 키가 없어졌으면 쓸 수 있는 첫 모델로
          if (u.available.length && !u.available.includes(engine)) setEngine(u.available[0]);
        })
        .catch(() => setUsage(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, busy === '']);
  const shown = usage ? ENGINES.filter((e) => usage.available.includes(e.key)) : ENGINES;
  /** 오늘 쓴 횟수 · 남은 횟수 (한도를 알 때만) */
  const countText = (k: SolveEngine) => {
    if (!usage) return '';
    if (usage.out[k]) return '오늘은 다 썼어요';
    const n = usage.used[k] ?? 0;
    const left = usage.left[k];
    const mine = d.settings.solveLimits?.[k];
    if (k === 'gemini' && usage.gemini) return `Flash ${usage.gemini.flash} · Lite ${usage.gemini.lite} · Gemma ${usage.gemini.gemma.toLocaleString('ko-KR')}번`;
    if (typeof left === 'number') return `남은 ${left}번`;
    if (mine) return `남은 ${Math.max(0, mine - n)}번 / ${mine}`;
    return `오늘 ${n}번 씀`;
  };
  const [topic, setTopic] = useState('');
  /** 한도에 걸린 질문: 다른 모델을 고르면 이걸 다시 보낸다 */
  const [retry, setRetry] = useState<Chat | null>(null);
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
    if (!chat.msgs.length && !topic.trim()) return toast('문제 이름을 먼저 써 주세요 (예: 쎈 수학Ⅰ p.45 12번)');
    const pics = files;
    const q = text.trim();
    setText('');
    setFiles([]);
    let images: SolveTurn['images'];
    try {
      if (pics.length) {
        setBusy('사진 준비 중');
        images = await Promise.all(pics.map(async (p) => ({ mime: p.blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg', data: await toB64(p.blob) })));
      }
    } catch {
      setBusy('');
      return toast('사진을 준비하지 못했어요');
    }
    // 사진은 R2 에도 올려 둔다 (연결돼 있고 무료 한도 안일 때만)
    let imgKeys: string[] | undefined;
    if (images?.length && usage?.r2) {
      setBusy('사진 저장 중');
      try {
        imgKeys = (await Promise.all(images.map((i) => solveImgPut(i.mime, i.data)))).map((r) => r.key);
      } catch (e) {
        toast(e instanceof Error ? e.message : '사진을 저장하지 못했어요');
      }
    }
    const user: Msg = { role: 'user', text: q, images, thumbs: pics.map((p) => p.url), imgKeys };
    const msgs = [...chat.msgs, user];
    // 과목을 안 골랐으면 글·지금 공부 중인 과목으로 짐작
    const guess = !chat.subjectId ? guessNoteSubject(d, Date.now(), undefined, q) : null;
    const next = { ...chat, subjectId: chat.subjectId ?? guess?.id, title: chat.title || topic.trim().slice(0, 60) || q.slice(0, 40) || '사진 문제', msgs };
    setChat(next);
    await ask(engine, next);
  }

  /** 대화(마지막이 질문)를 그 모델로 보낸다. 한도에 걸리면 모델 고르는 창을 띄우고, 고르면 바로 다시 보낸다 */
  async function ask(eng: SolveEngine, next: Chat) {
    const msgs = next.msgs;
    setBusy('푸는 중');
    try {
      // 앞 대화는 글만 (사진은 이번 질문 것만 보내서 무겁지 않게)
      const turns: SolveTurn[] = msgs.filter((m) => !m.error).map((m, i, all) => ({ role: m.role, text: m.text, images: i === all.length - 1 ? m.images : undefined }));
      const r = await solveAsk(eng, turns);
      const done = { ...next, at: Date.now(), msgs: [...msgs, { role: 'assistant' as const, text: r.text, model: r.model }] };
      setChat(done);
      saveChat(done);
    } catch (e) {
      const done = { ...next, msgs: [...msgs, { role: 'assistant' as const, text: e instanceof Error ? e.message : '풀지 못했어요', error: true }] };
      setChat(done);
      if (e instanceof ApiError && e.status === 429) {
        setRetry(next);
        setPicker(true);
      }
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
          <button className="st-link" onClick={() => setChat({ id: Date.now().toString(36), at: Date.now(), title: '', subjectId: chat.subjectId, msgs: [] })}>
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
              {(m.thumbs?.length ? m.thumbs : (m.imgKeys?.map(solveImgUrl) ?? [])).length > 0 && (
                <div className="sv-thumbs">
                  {(m.thumbs?.length ? m.thumbs : m.imgKeys!.map(solveImgUrl)).map((u) => (
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
        {!chat.msgs.length && <input className="sv-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="문제 이름 (예: 쎈 수학Ⅰ p.45 12번 · 이차함수 최댓값)" aria-label="문제 이름" />}
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
              const picked = [...(e.target.files ?? [])].slice(0, 4 - files.length);
              e.target.value = '';
              // 넣는 순간 줄인다 (가로 1400px · WebP, 안 되는 기기는 JPEG)
              void Promise.all(picked.map((f) => compressProblemImage(f).catch(() => null))).then((blobs) => {
                // 못 읽은 사진은 원본 그대로 보내지 않고 알려 준다 (형식이 맞지 않는 사진은 AI 가 거절함)
                if (blobs.some((b) => !b)) toast('읽지 못한 사진이 있어요. 스크린샷이나 다른 사진으로 넣어 주세요');
                const ok = blobs.filter((b): b is Blob => !!b);
                setFiles((cur) => [...cur, ...ok.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(0, 4));
              });
            }}
          />
          <button className="sv-model" onClick={() => setPicker(true)}>
            {eng.name} ▾
          </button>
          <button className="sv-model" onClick={() => setSubPick(true)}>
            {subject ? (
              <>
                <SubjectDot id={subject.id} d={d} /> {subject.name}
              </>
            ) : (
              '과목'
            )}{' '}
            ▾
          </button>
          <button className="sv-send" aria-label="보내기" disabled={!!busy || (!text.trim() && !files.length) || (!chat.msgs.length && !topic.trim())} onClick={() => void send()}>
            <Icon name="up" />
          </button>
        </div>
      </div>

      {picker && (
        <Sheet
          title={retry ? '다른 모델로 다시 보내기' : '모델 고르기'}
          onClose={() => {
            setPicker(false);
            setRetry(null);
          }}
        >
          <div className="sv-pick">
            {retry && <p className="sv-retry">이 모델은 지금 못 써요. 다른 모델을 고르면 같은 질문을 바로 다시 보내요.</p>}
            {shown.map((e) => (
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
                  if (retry) {
                    const again = retry;
                    setRetry(null);
                    setChat(again);
                    void ask(e.key, again);
                  }
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
            {usage?.r2 && (
              <div className="sv-r2">
                사진 저장소 {(usage.r2.bytes / 1024 ** 2).toFixed(1)}MB / {(usage.r2.free.bytes / 1024 ** 3).toFixed(0)}GB · 이번 달 올리기 {usage.r2.a.toLocaleString('ko-KR')} / {usage.r2.free.a.toLocaleString('ko-KR')} · 보기 {usage.r2.b.toLocaleString('ko-KR')} /{' '}
                {usage.r2.free.b.toLocaleString('ko-KR')}
                <br />
                무료 한도의 90%가 되면 저절로 막아요.
              </div>
            )}
          </div>
        </Sheet>
      )}
      {subPick && (
        <Sheet title="과목" onClose={() => setSubPick(false)}>
          <div className="sv-pick">
            {subjectsOf(d).map((x) => (
              <button
                key={x.id}
                className={subject?.id === x.id ? 'on' : ''}
                onClick={() => {
                  setSubject(x.id);
                  setSubPick(false);
                }}
              >
                <span>
                  <b>
                    <SubjectDot id={x.id} d={d} /> {x.name}
                  </b>
                </span>
                {subject?.id === x.id && <span className="sv-check">✓</span>}
              </button>
            ))}
            <button
              onClick={() => {
                setSubject(undefined);
                setSubPick(false);
              }}
            >
              <span>
                <b>과목 없음</b>
                <small>보낼 때 문제 글로 짐작해요</small>
              </span>
            </button>
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
                  <small>
                    {c.subjectId && d.subjects[c.subjectId] ? `${d.subjects[c.subjectId].name} · ` : ''}
                    {new Date(c.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
