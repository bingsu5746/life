// 일기 찾기 · 과거의 나 (고민과 비슷했던 지난 일기에서 그때 한 일)
import { useMemo, useState } from 'react';
import { shortDate } from '../study/dates';
import { alive, type DiaryEntry } from '../study/model';
import { useStudy } from '../study/store';
import { go, tap, toast } from '../study/ui';
import { diaryAsk, isLoggedIn } from '../auth/api';
import { diaryTags, entryText, onThisDay, parseQuery, searchDiary, similarEntries, snippetOf } from './diarySearch';
import { useToday } from '../study/ui';

const MOOD_NAME = ['', '나쁨', '별로', '보통', '좋음', '최고'];
const Mood = ({ m }: { m?: number }) => (m ? <i className={`dy-mood m${m}`} aria-hidden /> : null);

/** 찾은 말에 형광펜 */
function Marked({ text, words }: { text: string; words: string[] }) {
  const ws = words.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!ws.length) return <>{text}</>;
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return (
    <>
      {text.split(re).map((p, i) =>
        ws.some((w) => w.toLowerCase() === p.toLowerCase()) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

type Sort = 'new' | 'old' | 'most';

export function DiarySearchPage() {
  const d = useStudy();
  const today = useToday();
  const [q, setQ] = useState(() => {
    try {
      return sessionStorage.getItem('my-study.diary.q') ?? '';
    } catch {
      return '';
    }
  });
  const [mood, setMood] = useState(0);
  const [year, setYear] = useState('');
  const [photo, setPhoto] = useState(false);
  const [sort, setSort] = useState<Sort>('new');
  const all = useMemo(() => alive(d.diary).filter((e) => !e.auto), [d.diary]);
  const years = [...new Set(all.map((e) => e.id.slice(0, 4)))].sort().reverse();
  const tags = useMemo(() => diaryTags(all).slice(0, 30), [all]);
  const setQuery = (v: string) => {
    setQ(v);
    try {
      sessionStorage.setItem('my-study.diary.q', v);
    } catch {
      /* 무시 */
    }
  };
  const pool = all.filter((e) => (!mood || e.mood === mood) && (!year || e.id.startsWith(year)) && (!photo || !!e.photos?.length));
  const filtered = !!(mood || year || photo);
  const hits = q.trim() ? searchDiary(pool, q) : filtered ? pool.map((e) => ({ e, count: 0, snippet: snippetOf(entryText(e), ''), inTitle: false })) : [];
  hits.sort((a, b) => (sort === 'old' ? a.e.id.localeCompare(b.e.id) : sort === 'most' ? b.count - a.count || b.e.id.localeCompare(a.e.id) : b.e.id.localeCompare(a.e.id)));
  const words = parseQuery(q).must;
  const ago = onThisDay(d.diary, today);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>일기 찾기</h2>
      </div>
      <input className="st-input dy-search" type="search" autoFocus value={q} onChange={(e) => setQuery(e.target.value)} placeholder="제목이나 내용에서 찾기" aria-label="일기 찾기" />
      <p className="st-hint">띄어 쓴 말은 모두 들어간 일기만, "따옴표"는 그대로 한 덩어리, -말 은 그 말이 없는 일기만 찾아요.</p>
      <div className="dy-filters">
        <div className="st-chips" role="group" aria-label="기분">
          {[0, 1, 2, 3, 4, 5].map((m) => (
            <button key={m} className={`st-chip ${mood === m ? 'on' : ''}`} aria-pressed={mood === m} onClick={() => setMood(m)}>
              {m ? (
                <>
                  <Mood m={m} /> {MOOD_NAME[m]}
                </>
              ) : (
                '모든 기분'
              )}
            </button>
          ))}
        </div>
        <div className="st-inline wrap">
          <select className="st-input sm" value={year} onChange={(e) => setYear(e.target.value)} aria-label="연도">
            <option value="">모든 해</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select className="st-input sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="new">최근 것부터</option>
            <option value="old">오래된 것부터</option>
            <option value="most">많이 나온 것부터</option>
          </select>
          <label className="st-toggle">
            <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /> 사진 있는 것만
          </label>
        </div>
      </div>
      {!q.trim() && !filtered ? (
        <>
          {tags.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">내가 쓴 태그</h3>
              <div className="st-chips">
                {tags.map((t) => (
                  <button key={t.tag} className="st-chip" onClick={() => setQuery(t.tag)}>
                    {t.tag} <small className="st-muted">{t.n}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          {ago.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">지난 해 이맘때</h3>
              {ago.map((x) => (
                <button key={x.e.id} className="dy-hit" onClick={() => go(`/diary/${x.e.id}`)}>
                  <small className="st-muted">
                    {x.years}년 전 {x.exact ? '오늘' : '이맘때'} · {shortDate(x.e.id)}
                  </small>
                  <b>
                    <Mood m={x.e.mood} /> {x.e.title || shortDate(x.e.id)}
                  </b>
                  <span className="dy-preview">{snippetOf(entryText(x.e), '', 60)}</span>
                </button>
              ))}
            </section>
          )}
          <p className="st-muted">일기 {all.length}편에서 찾아요.</p>
        </>
      ) : (
        <>
          <p className="st-muted">{hits.length}편</p>
          {hits.slice(0, 100).map((h) => (
            <button key={h.e.id} className="dy-hit" onClick={() => go(`/diary/${h.e.id}`)}>
              <small className="st-muted">
                {shortDate(h.e.id)} {h.e.id.slice(0, 4)}
                {h.count > 1 ? ` · ${h.count}번 나옴` : ''}
              </small>
              <b>
                <Mood m={h.e.mood} /> <Marked text={h.e.title || shortDate(h.e.id)} words={words} />
              </b>
              <span className="dy-preview">
                <Marked text={h.snippet} words={words} />
              </span>
            </button>
          ))}
          {hits.length > 100 && <p className="st-muted">처음 100편만 보여요. 말을 더 넣어 좁혀 보세요.</p>}
        </>
      )}
    </div>
  );
}

/** 과거의 나: 고민을 적으면 비슷했던 지난 일기와, 그때 한 일 (AI 정리는 로그인했을 때) */
export function PastMePage() {
  const d = useStudy();
  const today = useToday();
  const [worry, setWorry] = useState('');
  const [asked, setAsked] = useState('');
  const [ai, setAi] = useState<Awaited<ReturnType<typeof diaryAsk>> | null>(null);
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => alive(d.diary).filter((e) => !e.auto && e.id < today), [d.diary, today]);
  const found = asked ? similarEntries(all, asked, 8) : [];
  const byId = (id: string): DiaryEntry | undefined => all.find((e) => e.id === id);
  const runAi = async () => {
    if (!found.length) return;
    setBusy(true);
    try {
      setAi(await diaryAsk(asked, found.map(({ e }) => ({ date: e.id, text: entryText(e).slice(0, 900) }))));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'AI 로 정리하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>과거의 나</h2>
      </div>
      <p className="st-hint">지금 고민을 적으면, 비슷한 일을 겪었던 지난 일기를 찾아 그때 어떤 상황이었고 무엇을 했는지 보여 줘요. 일기에 쓴 내용만 보여 줘요.</p>
      <form
        className="st-form"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(worry.trim());
          setAi(null);
        }}
      >
        <textarea className="st-input" rows={3} value={worry} onChange={(e) => setWorry(e.target.value)} placeholder="예: 시험을 망쳐서 너무 속상해" aria-label="지금 고민" />
        <button className="btn btn-primary" type="submit" disabled={worry.trim().length < 2}>
          지난 일기에서 찾기
        </button>
      </form>
      {asked && !found.length && <p className="st-muted">비슷한 일기를 못 찾았어요. 다른 말로 적어 보세요.</p>}
      {found.length > 0 && (
        <>
          {ai ? (
            <section className="st-card dy-ai">
              <h3 className="st-h">그때의 나는</h3>
              {ai.summary && <p>{ai.summary}</p>}
              {ai.items.map((x) => (
                <button key={x.date} className="dy-hit" onClick={() => go(`/diary/${x.date}`)}>
                  <small className="st-muted">
                    {shortDate(x.date)} {x.date.slice(0, 4)}
                    {byId(x.date)?.title ? ` · ${byId(x.date)!.title}` : ''}
                  </small>
                  {x.situation && <span>상황: {x.situation}</span>}
                  {x.did && <span>한 일: {x.did}</span>}
                  {x.result && <span>그 뒤: {x.result}</span>}
                  {x.quote && <q className="dy-quote">{x.quote}</q>}
                </button>
              ))}
              {!ai.items.length && <p className="st-muted">지난 일기에서 대처한 일을 찾지 못했어요.</p>}
            </section>
          ) : (
            isLoggedIn() && (
              <button className="btn" disabled={busy} onClick={runAi}>
                {busy ? '정리하는 중…' : 'AI 로 그때 한 일 정리하기'}
              </button>
            )
          )}
          {!ai && isLoggedIn() && <p className="st-hint">누르면 아래 일기 {found.length}편이 AI(Gemini)로 보내져요.</p>}
          <section className="st-card">
            <h3 className="st-h">비슷했던 일기 {found.length}편</h3>
            {found.map(({ e }) => {
              const words = [...new Set(asked.split(/\s+/).filter((w) => w.length >= 2 && entryText(e).includes(w.slice(0, 2))).map((w) => w.slice(0, 2)))];
              return (
                <div key={e.id} className="dy-hit st-tap" {...tap(() => go(`/diary/${e.id}`))}>
                  <small className="st-muted">
                    {shortDate(e.id)} {e.id.slice(0, 4)}
                  </small>
                  <b>
                    <Mood m={e.mood} /> {e.title || shortDate(e.id)}
                  </b>
                  <span className="dy-preview">
                    <Marked text={snippetOf(entryText(e), words[0] ?? '', 70)} words={words} />
                  </span>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
