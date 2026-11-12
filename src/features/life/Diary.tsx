// 일기: 하루에 하나, 기분과 글. 달별로 모아 보고 찾기
import { Highlight } from './Highlight';
import { Dictate } from '../study/Dictate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addPhoto, photoUrl, removePhoto } from '../study/photos';
import { addVideo, MAX_SEC, removeVideo, shrinkVideo, videoUrl } from '../study/videos';
import { addDays, longDate, shortDate } from '../study/dates';
import { alive, type DiaryEntry } from '../study/model';
import { getStudy, put, putMany, remove, setSettings, useStudy } from '../study/store';
import { confirmDelete, go, setLeaveGuard, tap, toast, useToday } from '../study/ui';
import { monthLabel, monthOf, shiftMonth } from './calc';
import { daySummary, DIARY_PARTS, dreamDates, formOf, sleepSummary, studySummary } from './diaryForm';
import { diarySplit, diaryTitles, isLoggedIn } from '../auth/api';
import { LineChart } from '../study/charts';
import { RecapPage } from './Recap';
import { DiarySearchPage, PastMePage } from './DiarySearch';
import { LettersPage, MoodWordsPage, PeoplePage } from './DiaryMore';
import { NotifyTime } from './NotifyTime';

/** 기분 점: 좋을수록 진하게 */
const Mood = ({ m }: { m?: number }) => (m ? <i className={`dy-mood m${m}`} aria-hidden /> : null);
const MOOD_NAME = ['', '나쁨', '별로', '보통', '좋음', '최고'];

/** sub: 날짜(YYYY-MM-DD) 면 그날 쓰기, 'YYYY-MM' 이면 그 달 목록 */
export function Diary({ sub }: { sub?: string }) {
  const today = useToday();
  if (sub === 'search') return <DiarySearchPage />;
  if (sub === 'ask') return <PastMePage />;
  if (sub === 'letter') return <LettersPage />;
  if (sub === 'people') return <PeoplePage />;
  if (sub === 'words') return <MoodWordsPage />;
  if (sub === 'dream') return <Dreams />;
  if (sub === 'form') return <Form />;
  if (sub === 'recap') return <RecapPage />;
  if (sub === 'highlight' || sub?.startsWith('highlight-')) return <Highlight month={sub.slice(10)} />;
  if (sub && /^\d{4}-\d{2}-\d{2}$/.test(sub)) return <Write key={sub > today ? today : sub} date={sub > today ? today : sub} today={today} />;
  return <List month={sub && /^\d{4}-\d{2}$/.test(sub) ? sub : monthOf(today)} today={today} />;
}

function List({ month, today }: { month: string; today: string }) {
  const d = useStudy();
  // 이 달 것만 골라서 정렬 (찾기는 「모든 일기에서 찾기」 화면에서)
  const list = useMemo(() => alive(d.diary).filter((e) => monthOf(e.id) === month).sort((a, b) => b.id.localeCompare(a.id)), [d.diary, month]);
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
      <button className="st-input dy-find" onClick={() => go('/diary/search')}>
        모든 일기에서 찾기
      </button>
      {!list.length ? (
        <p className="st-hint">이 달에 쓴 일기가 없어요.</p>
      ) : (
        list.map((e) => (
          <section key={e.id} className="st-card dy-entry st-tap" {...tap(() => go(`/diary/${e.id}`))}>
            <div className="st-inline between">
              <b>
                <Mood m={e.mood} /> {e.title || shortDate(e.id)}
              </b>
              {e.title && <small className="st-muted">{shortDate(e.id)}</small>}
              {e.auto && <small className="dy-autotag">기록만</small>}
            </div>
            <p className="dy-preview">{e.text || Object.values(e.parts ?? {})[0]}</p>
            {e.photos?.[0] ? (
              <div className="dy-thumb">
                <Photo id={e.photos[0]} />
              </div>
            ) : (
              !!e.videos?.length && <small className="st-muted">🎬 영상 {e.videos.length}개</small>
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
  videos?: string[];
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
  const form = formOf(d);
  // 그날 기록 요약은 모든 기록을 훑으니, 글자를 칠 때마다가 아니라 기록이 바뀔 때만 다시 만든다
  const lines = useMemo(() => daySummary(d, date), [d, date]);
  const studyLines = useMemo(() => studySummary(d, date), [d, date]);
  const sleepLines = useMemo(() => sleepSummary(d, date), [d, date]);
  // 새 일기: 본문 앞에 오늘 앱 기록(운동 · 영화 · 할 일 …)을 미리 채운다 (양식에서 끌 수 있음)
  // 미리 채운 글만 있으면 바뀐 것으로 치지 않는다 (임시저장 알림이 괜히 뜨지 않게)
  const [prefill] = useState(() => (!cur && form.autoFill && lines.length ? `${lines.join('\n')}\n\n` : ''));
  const [text, setText] = useState(() => draft0?.text ?? cur?.text ?? prefill);
  const [videos, setVideos] = useState<string[]>(draft0?.videos ?? cur?.videos ?? []);
  const [vBusy, setVBusy] = useState('');
  // 「공부」 · 「잠」 칸은 비어 있으면 늘 기록으로 채운다 (이렇게 채운 것만으로는 바뀐 것으로 치지 않는다)
  const [baseParts] = useState<Record<string, string>>(() => ({
    ...(cur?.parts ?? {}),
    ...(form.parts.includes('study') && studyLines.length && !cur?.parts?.study?.trim() ? { study: studyLines.join('\n') } : {}),
    ...(form.parts.includes('sleep') && sleepLines.length && !cur?.parts?.sleep?.trim() ? { sleep: sleepLines.join('\n') } : {}),
  }));
  const [parts, setParts] = useState<Record<string, string>>(() => draft0?.parts ?? baseParts);
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
  const addedV = useRef<string[]>([]);
  const savedRef = useRef(false);
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
  async function addVideos(f: File) {
    setVBusy('줄이는 중…');
    try {
      const { blob, cut } = await shrinkVideo(f, (sec) => setVBusy(`줄이는 중… ${Math.floor(sec)}/${MAX_SEC}초`));
      const r = await addVideo(blob);
      addedV.current.push(r.id);
      setVideos((x) => [...x, r.id].slice(0, 2));
      if (cut) toast(`앞 ${MAX_SEC}초만 넣었어요`);
      if (r.error) toast(`이 기기에는 저장했어요. 서버에는 나중에 올려요 (${r.error})`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '영상을 넣지 못했어요');
    } finally {
      setVBusy('');
    }
  }
  const changed =
    JSON.stringify(videos) !== JSON.stringify(cur?.videos ?? []) ||
    JSON.stringify(photos) !== JSON.stringify(cur?.photos ?? []) ||
    mood !== (cur?.mood ?? 0) ||
    title !== (cur?.title ?? '') ||
    text !== (cur?.text ?? prefill) ||
    JSON.stringify(clean(parts)) !== JSON.stringify(clean(baseParts));
  // 바뀌면 0.5초 뒤 이 기기에 임시저장
  useEffect(() => {
    if (savedRef.current) return;
    const t = setTimeout(() => setDraft(date, changed ? { mood, title, text, parts, photos, videos, at: Date.now() } : null), 500);
    return () => clearTimeout(t);
  }, [date, changed, mood, title, text, parts, photos, videos]);
  function discardDraft() {
    for (const p of photos) if (!(cur?.photos ?? []).includes(p)) void removePhoto(p);
    for (const v of videos) if (!(cur?.videos ?? []).includes(v)) void removeVideo(v);
    setVideos(cur?.videos ?? []);
    setDraft(date, null);
    setFromDraft(false);
    setMood(cur?.mood ?? 0);
    setTitle(cur?.title ?? '');
    setText(cur?.text ?? prefill);
    setParts(baseParts);
    setPhotos(cur?.photos ?? []);
  }
  /** 실제 저장 (기분이 있어야 한다). 양식에 있는데 비어 있는 칸은 「안 해서 / 없어서 안 쓴 것」으로 X 를 적는다 */
  function persist(): boolean {
    if (!mood) return false;
    const filled = { ...parts };
    for (const k of form.parts) if (!filled[k]?.trim()) filled[k] = 'X';
    const p = clean(filled);
    setDraft(date, null);
    for (const old of cur?.photos ?? []) if (!photos.includes(old)) void removePhoto(old);
    for (const old of cur?.videos ?? []) if (!videos.includes(old)) void removeVideo(old);
    put('diary', { id: date, mood, title: title.trim() || undefined, text: text.trim() ? text.replace(/\s+$/, '') : '', parts: Object.keys(p).length ? p : undefined, photos: photos.length ? photos : undefined, videos: videos.length ? videos : undefined } as DiaryEntry);
    return true;
  }
  function save() {
    if (!persist()) return toast('오늘의 기분을 골라 주세요');
    savedRef.current = true;
    toast('일기를 저장했어요');
    go(`/diary/${monthOf(date)}`);
  }
  // 나갈 때: 고친 게 있으면 기분을 골라야 나갈 수 있고, 고르면 저장 버튼 없이도 저장한다
  const live = useRef({ changed, mood, persist });
  live.current = { changed, mood, persist };
  useEffect(() => {
    const autoSave = () => {
      const l = live.current;
      return !savedRef.current && l.changed && !!l.mood && l.persist();
    };
    // 앱을 닫거나 다른 앱으로 갈 때도 (기분이 있으면) 저장. 기분이 없으면 임시저장으로 남는다
    const onHide = () => document.visibilityState === 'hidden' && autoSave();
    window.addEventListener('pagehide', autoSave);
    document.addEventListener('visibilitychange', onHide);
    const guard = () => {
      const l = live.current;
      if (savedRef.current || !l.changed || l.mood) return true;
      toast('오늘의 기분을 골라야 나갈 수 있어요');
      return false;
    };
    setLeaveGuard(guard);
    return () => {
      window.removeEventListener('pagehide', autoSave);
      document.removeEventListener('visibilitychange', onHide);
      setLeaveGuard(null, guard);
      if (autoSave()) toast('일기를 자동 저장했어요');
      // 저장도 임시저장도 없이 나가면 넣은 사진을 지운다 (임시저장이 있으면 그대로 둔다)
      else if (!savedRef.current && !loadDraft(date)) {
        for (const p of added.current) void removePhoto(p);
        for (const v of addedV.current) void removeVideo(v);
      }
    };
  }, [date]);
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
      {videos.map((id) => (
        <div key={id} className="dy-photo">
          <Video id={id} />
          <button type="button" className="dy-photo-x" aria-label="영상 빼기" onClick={() => setVideos(videos.filter((x) => x !== id))}>
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
      {videos.length < 2 && (
        <label className="dy-photo-add">
          {vBusy || `＋ 영상 (${MAX_SEC}초)`}
          <input
            type="file"
            accept="video/*"
            hidden
            disabled={!!vBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void addVideos(f);
            }}
          />
        </label>
      )}
    </div>
  );
  // 글자 수: 제목 · 칸 · 본문을 모두 (자동으로 채운 공부 · 잠 칸과 X 는 빼고)
  const written = [
    title,
    text,
    ...Object.entries(parts)
      .filter(([k, v]) => k !== 'study' && k !== 'sleep' && v.trim() !== 'X')
      .map(([, v]) => v),
  ].join('');
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
      {changed && (fromDraft || !mood) && (
        <p className="st-hint">
          {fromDraft ? '임시저장한 글을 불러왔어요.' : '기분을 고르면 나갈 때 저절로 저장돼요.'}{' '}
          <button className="st-link" onClick={discardDraft}>
            버리기
          </button>
        </p>
      )}
      <section className="st-card st-form">
        <span className="st-label">
          오늘의 기분 <small className="st-muted">(꼭 골라 주세요)</small>
        </span>
        <div className="st-seg dy-moods" role="radiogroup" aria-label="오늘의 기분">
          {[1, 2, 3, 4, 5].map((m) => (
            <button key={m} role="radio" aria-checked={mood === m} className={mood === m ? 'on' : ''} onClick={() => setMood(m)}>
              <Mood m={m} /> {MOOD_NAME[m]}
            </button>
          ))}
        </div>
        <TitleSuggest date={date} title={title} body={[text, ...Object.values(parts)].filter((x) => x?.trim()).join('\n')} onPick={setTitle} />
        {shownParts.map((p) => (
          <label key={p.key} className="st-field">
            <span className="st-label">
              {p.label}
              {p.key === 'study' && studyLines.length > 0 && parts.study?.trim() !== studyLines.join('\n') && (
                <button type="button" className="st-link dy-load" onClick={() => setParts({ ...parts, study: studyLines.join('\n') })}>
                  공부 기록으로 다시 채우기
                </button>
              )}
            </span>
            <AutoText rows={2} value={parts[p.key] ?? ''} onChange={(v) => setParts({ ...parts, [p.key]: v })} placeholder={p.hint} label={p.label} />
            {p.key === 'photo' && photoBox}
          </label>
        ))}
        <span className="st-label">
          일기
          {lines.length > 0 && !text.includes(lines.join('\n')) && (
            <button type="button" className="st-link dy-load" onClick={() => setText((x) => `${lines.join('\n')}${x.trim() ? `\n\n${x}` : '\n\n'}`)}>
              오늘 기록 불러오기
            </button>
          )}
        </span>
        <DayQuestion date={date} onPick={(q) => setText((x) => (x.includes(q) ? x : `${x.trim() ? `${x.replace(/\s+$/, '')}\n\n` : ''}Q. ${q}\n`))} />
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
                savedRef.current = true;
                setDraft(date, null);
                for (const ph of cur.photos ?? []) void removePhoto(ph);
                for (const v of cur.videos ?? []) void removeVideo(v);
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
        <label className="st-toggle">
          <input type="checkbox" checked={d.settings.diaryNag !== false} onChange={(e) => setSettings({ diaryNag: e.target.checked ? undefined : false })} /> 일기를 안 쓴 날은 밤 10시부터 새벽 2시까지 한 시간마다 알림
        </label>
        <label className="st-toggle">
          <input type="checkbox" checked={form.autoFill} onChange={(e) => set(form.parts, e.target.checked)} /> 새 일기를 열면 본문에 오늘 기록(운동 · 영화 · 할 일)을 미리 채우기
        </label>
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

function Video({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    void videoUrl(id).then((u) => on && setUrl(u));
    return () => {
      on = false;
    };
  }, [id]);
  if (url === undefined) return <div className="dy-img loading" />;
  if (!url) return <div className="dy-img missing">영상 없음</div>;
  return <video className="dy-img" src={url} controls playsInline preload="metadata" />;
}

/** 말로 쓰기 버튼 (음성 인식을 지원하는 브라우저에서만) */

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

/** 제목 칸 + AI 제목 추천: 제목이 비었고 일기가 조금 쓰였으면, 제목 칸을 누를 때 지금까지 쓴 제목 느낌으로 3개를 잠깐 띄운다 */
function TitleSuggest({ date, title, body, onPick }: { date: string; title: string; body: string; onPick: (t: string) => void }) {
  const d = useStudy();
  const [list, setList] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef('');
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  const can = isLoggedIn() && body.trim().length >= 20;
  const ask = (force = false) => {
    if (!can || busy || (!force && (title.trim() || asked.current === body))) return;
    asked.current = body;
    setBusy(true);
    const past = alive(d.diary)
      .filter((e) => e.id !== date && e.title?.trim())
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 30)
      .map((e) => e.title!.trim());
    diaryTitles(body.slice(0, 3000), past)
      .then((r) => {
        if (!r.titles.length) return;
        setList(r.titles);
        clearTimeout(hide.current);
        // 잠깐 띄웠다가 닫는다
        hide.current = setTimeout(() => setList(null), 20_000);
      })
      .catch((e) => force && toast(e instanceof Error ? e.message : '제목을 받지 못했어요'))
      .finally(() => setBusy(false));
  };
  useEffect(() => () => clearTimeout(hide.current), []);
  return (
    <div className="dy-title">
      <div className="dy-title-row">
        <input className="st-input" value={title} onChange={(e) => onPick(e.target.value)} onFocus={() => ask()} placeholder="제목 (선택)" aria-label="제목" />
        {can && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => ask(true)} aria-label="제목 추천">
            {busy ? '…' : '✨ 추천'}
          </button>
        )}
      </div>
      {list && (
        <div className="dy-title-pop" role="listbox" aria-label="추천 제목">
          {list.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={title === t}
              className="st-chip"
              onClick={() => {
                onPick(t);
                setList(null);
              }}
            >
              {t}
            </button>
          ))}
          <button type="button" className="st-link" onClick={() => setList(null)}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

/** 쓰기 막힐 때: 날마다 다른 질문 하나 (같은 날엔 같은 질문, 「다른 질문」으로 넘김). 누르면 본문에 질문을 넣는다 */
const DAY_QUESTIONS = [
  '오늘 제일 웃겼던 순간은?',
  '오늘 나를 조금 귀찮게 한 일은?',
  '오늘 먹은 것 중 제일 맛있었던 건?',
  '오늘 누구와 가장 많이 이야기했어?',
  '오늘 새로 알게 된 것 하나',
  '오늘 내가 잘한 일 하나',
  '오늘 다시 할 수 있다면 바꾸고 싶은 순간은?',
  '요즘 계속 생각나는 노래 · 영상은?',
  '오늘 가장 집중이 잘 된 때는 언제였어?',
  '오늘 고마웠던 사람은?',
  '내일 꼭 하고 싶은 일 하나',
  '오늘 기분을 날씨로 말하면?',
  '오늘 들은 말 중 기억에 남는 말은?',
  '요즘 가장 기대되는 일은?',
  '요즘 가장 걱정되는 일은? 정말 걱정할 만한 일일까?',
  '오늘 공부하면서 막혔던 부분은?',
  '오늘 몸 상태는 어땠어? 잠은 잘 잤어?',
  '1년 전의 나에게 해 주고 싶은 말',
  '오늘 쓴 돈 중 가장 잘 쓴 돈은?',
  '오늘 하루를 한 단어로 말하면?',
  '최근에 본 것(영화 · 책 · 경기) 중 남은 장면은?',
  '오늘 나를 웃게 한 사람은?',
  '오늘 미룬 일이 있다면 왜 미뤘을까?',
  '요즘 나를 가장 힘나게 하는 건?',
  '오늘 처음 해 본 일이 있어?',
  '이번 주에 가장 잘한 선택은?',
  '지금 가장 갖고 싶은 것과 그 이유',
  '오늘 들은 수업 중 제일 재밌던 건?',
  '만약 내일 하루가 자유라면 뭘 할래?',
  '오늘 나에게 점수를 준다면 몇 점? 왜?',
];
function DayQuestion({ date, onPick }: { date: string; onPick: (q: string) => void }) {
  const base = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const [k, setK] = useState(0);
  const q = DAY_QUESTIONS[(((base + k * 7) % DAY_QUESTIONS.length) + DAY_QUESTIONS.length) % DAY_QUESTIONS.length];
  return (
    <div className="dy-q">
      <button type="button" className="dy-q-main" onClick={() => onPick(q)} title="본문에 넣기">
        💭 <span>{q}</span>
      </button>
      <button type="button" className="st-link" onClick={() => setK(k + 1)}>
        다른 질문
      </button>
    </div>
  );
}
