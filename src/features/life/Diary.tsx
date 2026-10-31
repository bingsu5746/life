// 일기: 하루에 하나, 기분과 글. 달별로 모아 보고 찾기
import { canListen, listen } from '../../lib/listen';
import { useEffect, useRef, useState } from 'react';
import { addPhoto, photoUrl, removePhoto } from '../study/photos';
import { addDays, longDate, shortDate } from '../study/dates';
import { alive, type DiaryEntry } from '../study/model';
import { getStudy, put, putMany, remove, setSettings, useStudy } from '../study/store';
import { confirmDelete, go, tap, toast, useToday } from '../study/ui';
import { monthLabel, monthOf, shiftMonth } from './calc';
import { daySummary, DIARY_PARTS, dreamDates, formOf, sleepSummary, studySummary } from './diaryForm';
import { diarySplit, isLoggedIn, speechToText } from '../auth/api';
import { LineChart } from '../study/charts';
import { RecapPage } from './Recap';
import { NotifyTime } from './NotifyTime';

/** 기분 점: 좋을수록 진하게 */
const Mood = ({ m }: { m?: number }) => (m ? <i className={`dy-mood m${m}`} aria-hidden /> : null);
const MOOD_NAME = ['', '나쁨', '별로', '보통', '좋음', '최고'];

/** sub: 날짜(YYYY-MM-DD) 면 그날 쓰기, 'YYYY-MM' 이면 그 달 목록 */
export function Diary({ sub }: { sub?: string }) {
  const today = useToday();
  if (sub === 'dream') return <Dreams />;
  if (sub === 'form') return <Form />;
  if (sub === 'recap') return <RecapPage />;
  if (sub && /^\d{4}-\d{2}-\d{2}$/.test(sub)) return <Write key={sub > today ? today : sub} date={sub > today ? today : sub} today={today} />;
  return <List month={sub && /^\d{4}-\d{2}$/.test(sub) ? sub : monthOf(today)} today={today} />;
}

function List({ month, today }: { month: string; today: string }) {
  const d = useStudy();
  const [q, setQ] = useState('');
  const all = alive(d.diary).sort((a, b) => b.id.localeCompare(a.id));
  const list = q.trim() ? all.filter((e) => `${e.title ?? ''}\n${e.text}\n${Object.values(e.parts ?? {}).join('\n')}`.toLowerCase().includes(q.trim().toLowerCase())) : all.filter((e) => monthOf(e.id) === month);
  const wrote = d.diary[today] && !d.diary[today].deleted;
  // 이번 달 기분 칸 (날마다)
  const days = Array.from({ length: 31 }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter((x) => x.slice(0, 7) === month && !Number.isNaN(Date.parse(x)) && new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>일기</h2>
        <button className="btn btn-sm btn-primary" onClick={() => go(`/diary/${today}`)}>
          {wrote ? '오늘 일기 고치기' : '오늘 일기 쓰기'}
        </button>
      </div>
      <section className="st-card">
        <div className="st-inline between">
          <button className="btn btn-sm" onClick={() => go(`/diary/${shiftMonth(month, -1)}`)} aria-label="지난달">
            ‹
          </button>
          <b>{monthLabel(month)}</b>
          <button className="btn btn-sm" disabled={month >= monthOf(today)} onClick={() => go(`/diary/${shiftMonth(month, 1)}`)} aria-label="다음 달">
            ›
          </button>
        </div>
        <div className="dy-month" aria-label="날마다 기분">
          {days.map((x) => {
            const e = d.diary[x] && !d.diary[x].deleted ? d.diary[x] : undefined;
            return (
              <button key={x} className={`dy-day ${x === today ? 'today' : ''} ${x > today ? 'future' : ''}`} disabled={x > today} onClick={() => go(`/diary/${x}`)} aria-label={`${shortDate(x)} ${e ? `일기 ${e.mood ? MOOD_NAME[e.mood] : ''}` : '일기 없음'}`}>
                <small>{Number(x.slice(8))}</small>
                <span>{e ? e.mood ? <Mood m={e.mood} /> : <i className="dy-mood m0" aria-hidden /> : null}</span>
              </button>
            );
          })}
        </div>
        {(() => {
          // 이 달 기분 흐름 (기분을 고른 날만)
          const pts = days.filter((x) => x <= today).map((x) => ({ label: String(Number(x.slice(8))), title: shortDate(x), y: d.diary[x] && !d.diary[x].deleted && d.diary[x].mood ? d.diary[x].mood! : null }));
          const n = pts.filter((p) => p.y !== null).length;
          if (n < 2) return null;
          const avg = pts.reduce((a, p) => a + (p.y ?? 0), 0) / n;
          return (
            <>
              <LineChart label="이 달 기분" height={130} domain={[1, 5]} ticks={[1, 3, 5]} points={pts} format={(v) => MOOD_NAME[Math.round(v)] ?? ''} />
              <p className="st-muted sm">
                기분을 남긴 {n}일 평균: {MOOD_NAME[Math.round(avg)]} ({avg.toFixed(1)})
              </p>
            </>
          );
        })()}
      </section>
      {month === monthOf(today) &&
        [1, 2, 3].map((y) => {
          // 1년 전 · 2년 전 · 3년 전 오늘
          const day = `${Number(today.slice(0, 4)) - y}${today.slice(4)}`;
          const e = d.diary[day] && !d.diary[day].deleted ? d.diary[day] : undefined;
          return e ? (
            <section key={y} className="st-card dy-entry dy-ago st-tap" {...tap(() => go(`/diary/${day}`))}>
              <small className="st-muted">
                📅 {y}년 전 오늘 · {shortDate(day)}
              </small>
              <b>
                <Mood m={e.mood} /> {e.title || ''}
              </b>
              <p className="dy-preview">{e.text || Object.values(e.parts ?? {})[0]}</p>
            </section>
          ) : null;
        })}
      <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="모든 일기에서 찾기" aria-label="일기 찾기" />
      {!list.length ? (
        <p className="st-hint">{q ? '찾는 글이 있는 일기가 없어요.' : '이 달에 쓴 일기가 없어요.'}</p>
      ) : (
        list.map((e) => (
          <section key={e.id} className="st-card dy-entry st-tap" {...tap(() => go(`/diary/${e.id}`))}>
            <div className="st-inline between">
              <b>
                <Mood m={e.mood} /> {e.title || shortDate(e.id)}
              </b>
              {e.title && <small className="st-muted">{shortDate(e.id)}</small>}
            </div>
            <p className="dy-preview">{e.text || Object.values(e.parts ?? {})[0]}</p>
            {e.photos?.[0] && (
              <div className="dy-thumb">
                <Photo id={e.photos[0]} />
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

/** 임시저장 (이 기기): 저장 안 하고 나가도 다시 열면 이어 쓰기 */
interface Draft {
  mood: number;
  title: string;
  text: string;
  parts: Record<string, string>;
  photos: string[];
  at: number;
}
const draftKey = (date: string) => `my-study.diary.draft.${date}`;
function loadDraft(date: string): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(date)) ?? 'null') as Draft | null;
  } catch {
    return null;
  }
}
function setDraft(date: string, v: Draft | null) {
  try {
    if (v) localStorage.setItem(draftKey(date), JSON.stringify(v));
    else localStorage.removeItem(draftKey(date));
  } catch {
    /* 저장 공간이 없으면 임시저장만 못 함 */
  }
}

function Write({ date, today }: { date: string; today: string }) {
  const d = useStudy();
  const cur = d.diary[date] && !d.diary[date].deleted ? d.diary[date] : undefined;
  const [draft0] = useState(() => loadDraft(date));
  const [fromDraft, setFromDraft] = useState(!!draft0);
  const [mood, setMood] = useState(draft0?.mood ?? cur?.mood ?? 0);
  const [photos, setPhotos] = useState<string[]>(draft0?.photos ?? cur?.photos ?? []);
  const [title, setTitle] = useState(draft0?.title ?? cur?.title ?? '');
  const [text, setText] = useState(draft0?.text ?? cur?.text ?? '');
  const form = formOf(d);
  const lines = daySummary(d, date);
  const studyLines = studySummary(d, date);
  const sleepLines = sleepSummary(d, date);
  // 새 일기: 「오늘 한 것」 칸을 앱 기록으로 미리 채운다 (끄면 링크로만). 「공부」 칸은 비어 있으면 늘 공부 기록으로 채운다
  const [parts, setParts] = useState<Record<string, string>>(() => draft0?.parts ?? ({
    ...(cur?.parts ?? {}),
    ...(!cur && form.autoFill && form.parts.includes('done') && lines.length ? { done: lines.join('\n') } : {}),
    ...(form.parts.includes('study') && studyLines.length && !cur?.parts?.study?.trim() ? { study: studyLines.join('\n') } : {}),
    ...(form.parts.includes('sleep') && sleepLines.length && !cur?.parts?.sleep?.trim() ? { sleep: sleepLines.join('\n') } : {}),
  }));
  // 받아쓴 본문을 AI 가 칸마다 나눠 준다 (빈 칸만 채우고, 이미 쓴 칸은 뒤에 붙임). 글에 없는 말은 안 넣게 했다
  const [splitting, setSplitting] = useState(false);
  const split = async () => {
    setSplitting(true);
    try {
      const got = await diarySplit(text);
      const keys = Object.keys(got) as (keyof typeof got)[];
      if (!keys.length) return toast('나눌 만한 내용을 찾지 못했어요');
      setParts((p) => {
        const next = { ...p };
        for (const k of keys) next[k] = p[k]?.trim() ? `${p[k].trim()}\n${got[k]}` : got[k]!;
        return next;
      });
      // 나눈 칸이 양식에 없어도 보이게
      toast(`${keys.length}칸에 나눠 넣었어요. 확인하고 저장해 주세요`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'AI 가 나누지 못했어요');
    } finally {
      setSplitting(false);
    }
  };
  const shownParts = DIARY_PARTS.filter((p) => form.parts.includes(p.key) || parts[p.key]?.trim() || (p.key === 'photo' && photos.length));
  const clean = (x: Record<string, string>) => Object.fromEntries(Object.entries(x).filter(([, v]) => v.trim()));
  const [busy, setBusy] = useState(false);
  // 이 화면에서 넣은 사진: 저장하지 않고 나가면 지운다
  const added = useRef<string[]>([]);
  const savedRef = useRef(false);
  // 저장도 임시저장도 없이 나가면 넣은 사진을 지운다 (임시저장이 있으면 그대로 둔다)
  useEffect(
    () => () => {
      if (!savedRef.current && !loadDraft(date)) for (const p of added.current) void removePhoto(p);
    },
    [date],
  );
  async function addPhotos(files: FileList) {
    setBusy(true);
    const ids: string[] = [];
    for (const f of [...files].slice(0, 4 - photos.length)) {
      try {
        const r = await addPhoto(f);
        ids.push(r.id);
        added.current.push(r.id);
        if (r.error) toast(`이 기기에는 저장했어요. 서버에는 나중에 올려요 (${r.error})`);
      } catch {
        toast('사진을 넣지 못했어요');
      }
    }
    setPhotos((x) => [...x, ...ids].slice(0, 4));
    setBusy(false);
  }
  const changed = JSON.stringify(photos) !== JSON.stringify(cur?.photos ?? []) || mood !== (cur?.mood ?? 0) || title !== (cur?.title ?? '') || text !== (cur?.text ?? '') || JSON.stringify(clean(parts)) !== JSON.stringify(clean(cur?.parts ?? {}));
  // 바뀌면 0.5초 뒤 이 기기에 임시저장
  useEffect(() => {
    if (savedRef.current) return;
    const t = setTimeout(() => setDraft(date, changed ? { mood, title, text, parts, photos, at: Date.now() } : null), 500);
    return () => clearTimeout(t);
  }, [date, changed, mood, title, text, parts, photos]);
  function discardDraft() {
    for (const p of photos) if (!(cur?.photos ?? []).includes(p)) void removePhoto(p);
    setDraft(date, null);
    setFromDraft(false);
    setMood(cur?.mood ?? 0);
    setTitle(cur?.title ?? '');
    setText(cur?.text ?? '');
    setParts(cur?.parts ?? {});
    setPhotos(cur?.photos ?? []);
  }
  function save() {
    // 실제 저장: 양식에 있는데 비어 있는 칸은 「안 해서 / 없어서 안 쓴 것」으로 X 를 적는다
    const filled = { ...parts };
    for (const k of form.parts) if (!filled[k]?.trim()) filled[k] = 'X';
    const p = clean(filled);
    if (!text.trim() && !mood && !Object.keys(p).length && !photos.length) return toast('한 줄이라도 써 주세요');
    savedRef.current = true;
    setDraft(date, null);
    for (const old of cur?.photos ?? []) if (!photos.includes(old)) void removePhoto(old);
    put('diary', { id: date, mood: mood || undefined, title: title.trim() || undefined, text, parts: Object.keys(p).length ? p : undefined, photos: photos.length ? photos : undefined } as DiaryEntry);
    toast('일기를 저장했어요');
    go(`/diary/${monthOf(date)}`);
  }
  const photoBox = (
      <div className="dy-photos">
          {photos.map((id) => (
            <div key={id} className="dy-photo">
              <Photo id={id} />
              <button type="button" className="dy-photo-x" aria-label="사진 빼기" onClick={() => setPhotos(photos.filter((x) => x !== id))}>
                ✕
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <label className="dy-photo-add">
              {busy ? '넣는 중…' : '＋ 사진'}
              <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => e.target.files?.length && void addPhotos(e.target.files)} />
            </label>
          )}
        </div>
  );
  // 글자 수: 제목 · 칸 · 본문을 모두 (자동으로 채운 공부 · 잠 칸과 X 는 빼고)
  const written = [title, text, ...Object.entries(parts).filter(([k, v]) => k !== 'study' && k !== 'sleep' && v.trim() !== 'X').map(([, v]) => v)].join('');
  const count = written.length;
  const countNoSpace = written.replace(/\s/g, '').length;
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go(`/diary/${monthOf(date)}`)} aria-label="일기 목록">
          ‹
        </button>
        <h2>{longDate(date)}</h2>
      </div>
      <div className="st-inline between">
        <button className="btn btn-sm" onClick={() => go(`/diary/${addDays(date, -1)}`)}>
          ‹ 전날
        </button>
        <button className="btn btn-sm" disabled={date >= today} onClick={() => go(`/diary/${addDays(date, 1)}`)}>
          다음 날 ›
        </button>
      </div>
      {fromDraft && changed && (
        <p className="st-hint">
          임시저장한 글을 불러왔어요.{' '}
          <button className="st-link" onClick={discardDraft}>
            버리기
          </button>
        </p>
      )}
      <section className="st-card st-form">
        <span className="st-label">오늘의 기분</span>
        <div className="st-seg dy-moods" role="radiogroup" aria-label="오늘의 기분">
          {[1, 2, 3, 4, 5].map((m) => (
            <button key={m} role="radio" aria-checked={mood === m} className={mood === m ? 'on' : ''} onClick={() => setMood(mood === m ? 0 : m)}>
              <Mood m={m} /> {MOOD_NAME[m]}
            </button>
          ))}
        </div>
        <input className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (선택)" aria-label="제목" />
        {shownParts.map((p) => (
          <label key={p.key} className="st-field">
            <span className="st-label">
              {p.label}
              {(p.key === 'done' || p.key === 'study') && (p.key === 'done' ? lines : studyLines).length > 0 && parts[p.key]?.trim() !== (p.key === 'done' ? lines : studyLines).join('\n') && (
                <button type="button" className="st-link dy-load" onClick={() => setParts({ ...parts, [p.key]: (p.key === 'done' ? lines : studyLines).join('\n') })}>
                  {p.key === 'study' ? '공부 기록으로 다시 채우기' : '기록에서 불러오기'}
                </button>
              )}
            </span>
            <AutoText rows={2} value={parts[p.key] ?? ''} onChange={(v) => setParts({ ...parts, [p.key]: v })} placeholder={p.hint} label={p.label} />
            {p.key === 'photo' && photoBox}
          </label>
        ))}
        <span className="st-label">일기</span>
        <AutoText className="dy-text" rows={shownParts.length ? 6 : 10} value={text} onChange={setText} placeholder="하고 싶은 말을 자유롭게…" label="일기" />
        <Dictate onText={(t) => setText((x) => (x.trim() ? `${x.replace(/\s+$/, '')} ${t}` : t))} />
        {text.trim().length >= 20 && (
          <button type="button" className="btn btn-sm" disabled={splitting} onClick={() => void split()}>
            {splitting ? 'AI 가 나누는 중…' : 'AI 로 칸 나누기'}
          </button>
        )}
        {!shownParts.some((p) => p.key === 'photo') && photoBox}
        <div className="st-row dy-foot">
          <small className="st-muted dy-count">
            {count.toLocaleString()}자 <span>(공백 빼고 {countNoSpace.toLocaleString()}자)</span>
          </small>
          {cur && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`${shortDate(date)} 일기`)) return;
                for (const ph of cur.photos ?? []) void removePhoto(ph);
                remove('diary', date);
                go(`/diary/${monthOf(date)}`);
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!changed} onClick={save}>
            저장
          </button>
        </div>
      </section>
    </div>
  );
}

function Dreams() {
  const d = useStudy();
  const [q, setQ] = useState('');
  const dates = dreamDates(d).filter((x) => !q.trim() || (d.diary[x].parts?.dream ?? '').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>꿈</h2>
      </div>
      {dates.length > 0 || q ? <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="꿈에서 찾기" aria-label="꿈 찾기" /> : null}
      {!dates.length ? (
        <p className="st-hint">{q ? '찾는 꿈이 없어요.' : '일기의 「꿈」 칸에 쓴 꿈이 여기에 모여요. 일기 양식에서 「꿈」 칸을 켜 두세요.'}</p>
      ) : (
        dates.map((x) => (
          <section key={x} className="st-card dy-entry st-tap" {...tap(() => go(`/diary/${x}`))}>
            <small className="st-muted">{longDate(x)}</small>
            <p className="dy-preview">{d.diary[x].parts!.dream}</p>
          </section>
        ))
      )}
    </div>
  );
}

function Form() {
  const d = useStudy();
  const form = formOf(d);
  const set = (parts: string[], autoFill = form.autoFill) => setSettings({ diaryForm: { parts: DIARY_PARTS.map((p) => p.key).filter((k) => parts.includes(k)), autoFill, known: DIARY_PARTS.map((p) => p.key) } });
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>일기 양식</h2>
      </div>
      <ImportDiary />
      <YearShift />
      <section className="st-card st-form">
        <p className="st-sub">제목과 본문, 기분은 항상 있어요. 아래에서 매일 쓸 칸을 골라 보세요.</p>
        {DIARY_PARTS.map((p) => {
          const on = form.parts.includes(p.key);
          return (
            <label key={p.key} className="st-toggle dy-form-row">
              <input type="checkbox" checked={on} onChange={() => set(on ? form.parts.filter((k) => k !== p.key) : [...form.parts, p.key])} />
              <span>
                <b>{p.label}</b>
                <small className="st-muted"> {p.hint}</small>
              </span>
            </label>
          );
        })}
        <NotifyTime k="diaryTime" label="일기 알림" fallback="22:30" />
        {form.parts.includes('done') && (
          <label className="st-toggle">
            <input type="checkbox" checked={form.autoFill} onChange={(e) => set(form.parts, e.target.checked)} /> 새 일기를 열면 「오늘 한 것」을 앱 기록으로 미리 채우기
          </label>
        )}
      </section>
    </div>
  );
}

function Photo({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void photoUrl(id).then((u) => on && setUrl(u));
    return () => {
      on = false;
    };
  }, [id]);
  if (url === undefined) return <div className="dy-img loading" />;
  if (!url) return <div className="dy-img missing">사진 없음</div>;
  return <img className="dy-img" src={url} alt="일기 사진" />;
}

/** 말로 쓰기 버튼 (음성 인식을 지원하는 브라우저에서만) */
function Dictate({ onText }: { onText: (t: string) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const rec = useRef<{ stop: () => void } | null>(null);
  const [stopListen, setStopListen] = useState<(() => void) | null>(null);
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && isLoggedIn();
  // 녹음 → 서버 Whisper 받아쓰기 (브라우저 음성 인식보다 훨씬 정확). 녹음이 안 되면 브라우저 음성 인식
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('busy');
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          const b64 = await new Promise<string>((ok, no) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result).split(',')[1] ?? '');
            r.onerror = () => no(new Error('녹음을 읽지 못했어요'));
            r.readAsDataURL(blob);
          });
          const t = await speechToText(b64);
          if (t) onText(t);
          else toast('알아들은 말이 없어요');
        } catch (e) {
          toast(e instanceof Error ? e.message : '받아쓰지 못했어요');
        } finally {
          setState('idle');
        }
      };
      mr.start();
      const timer = setTimeout(() => mr.state === 'recording' && mr.stop(), 150_000);
      rec.current = { stop: () => (clearTimeout(timer), mr.state === 'recording' && mr.stop()) };
      setState('rec');
    } catch {
      toast('마이크를 쓸 수 있게 허용해 주세요');
    }
  }
  if (canRecord)
    return (
      <button type="button" className={`btn btn-sm dy-mic ${state === 'rec' ? 'on' : ''}`} disabled={state === 'busy'} onClick={() => (state === 'rec' ? rec.current?.stop() : void start())}>
        {state === 'rec' ? '■ 그만 (2분 30초까지)' : state === 'busy' ? '받아쓰는 중…' : '🎙 말로 쓰기'}
      </button>
    );
  if (!canListen()) return null;
  return (
    <button
      type="button"
      className={`btn btn-sm dy-mic ${stopListen ? 'on' : ''}`}
      onClick={() => {
        if (stopListen) return stopListen();
        const st = listen(onText, (e) => {
          setStopListen(null);
          if (e && e !== 'no-speech' && e !== 'aborted') toast(e === 'not-allowed' ? '마이크를 쓸 수 있게 허용해 주세요' : '음성 인식이 멈췄어요');
        });
        setStopListen(() => st);
      }}
    >
      {stopListen ? '■ 그만 듣기' : '🎙 말로 쓰기'}
    </button>
  );
}

/** 글이 길어지면 칸이 스스로 늘어나는 입력칸 (안에서 스크롤 없이) */
function AutoText({ value, onChange, placeholder, label, rows = 2, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; rows?: number; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.style.height = 'auto';
    a.style.height = `${a.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} className={`st-input dy-auto ${className}`} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />;
}

/** 일기 파일 가져오기 (노션에서 옮긴 것 등): [{ date, title?, mood?(1~5), text, parts? }]. 이미 일기가 있는 날은 건너뛴다 */
function ImportDiary() {
  const [busy, setBusy] = useState(false);
  async function load(f: File) {
    setBusy(true);
    try {
      const list = JSON.parse(await f.text()) as { date?: string; title?: string; mood?: number; text?: string; parts?: Record<string, string> }[];
      if (!Array.isArray(list)) throw new Error('일기 파일 모양이 아니에요');
      const have = getStudy().diary;
      const items = list
        .filter((x) => x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && !(have[x.date] && !have[x.date].deleted))
        .map((x) => ({
          c: 'diary' as const,
          item: {
            id: x.date!,
            title: x.title?.trim() || undefined,
            mood: x.mood && x.mood >= 1 && x.mood <= 5 ? Math.round(x.mood) : undefined,
            text: x.text ?? '',
            parts: x.parts && Object.keys(x.parts).length ? x.parts : undefined,
          },
        }));
      putMany(items);
      toast(`일기 ${items.length}개를 가져왔어요${list.length > items.length ? ` (이미 있는 ${list.length - items.length}개는 건너뜀)` : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '가져오지 못했어요');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="st-card st-form">
      <b>일기 가져오기</b>
      <label className="btn">
        {busy ? '가져오는 중…' : '일기 파일(.json) 고르기'}
        <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
      </label>
    </section>
  );
}

/** 일기 연도 한꺼번에 바꾸기 (예: 잘못 넣은 2025년 일기를 2026년으로). 옮길 날에 이미 일기가 있으면 그날은 건너뛴다 */
function YearShift() {
  const d = useStudy();
  const years = [...new Set(alive(d.diary).map((e) => e.id.slice(0, 4)))].sort();
  const [from, setFrom] = useState(years[0] ?? '');
  const [to, setTo] = useState(String(Number(years[0] ?? new Date().getFullYear()) + 1));
  if (!years.length) return null;
  const src = from || years[0];
  const list = alive(d.diary).filter((e) => e.id.startsWith(`${src}-`));
  const move = () => {
    if (!/^\d{4}$/.test(to) || to === src) return toast('바꿀 연도를 확인해 주세요');
    if (!window.confirm(`${src}년 일기 ${list.length}개를 ${to}년으로 옮길까요?`)) return;
    let moved = 0,
      skipped = 0;
    const items: { c: 'diary'; item: DiaryEntry }[] = [];
    for (const e of list) {
      const id = `${to}${e.id.slice(4)}`;
      const ok = !Number.isNaN(Date.parse(`${id}T00:00:00Z`)) && new Date(`${id}T00:00:00Z`).toISOString().slice(0, 10) === id;
      if (!ok || (d.diary[id] && !d.diary[id].deleted)) {
        skipped++;
        continue;
      }
      items.push({ c: 'diary', item: { ...e, id } });
      moved++;
    }
    putMany(items as never);
    for (const it of items) remove('diary', `${src}${it.item.id.slice(4)}`);
    toast(`${moved}개를 ${to}년으로 옮겼어요${skipped ? ` (${skipped}개는 그날 일기가 있거나 없는 날이라 그대로)` : ''}`);
  };
  return (
    <section className="st-card st-form">
      <b>일기 연도 바꾸기</b>
      <div className="st-inline">
        <select className="st-input" value={src} onChange={(e) => setFrom(e.target.value)} aria-label="옮길 연도">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년 ({alive(d.diary).filter((e) => e.id.startsWith(`${y}-`)).length}개)
            </option>
          ))}
        </select>
        <span>→</span>
        <input className="st-input xs" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="바꿀 연도" />
        <button className="btn btn-sm btn-primary" onClick={move}>
          옮기기
        </button>
      </div>
    </section>
  );
}
