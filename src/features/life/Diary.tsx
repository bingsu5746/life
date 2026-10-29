// 일기: 하루에 하나, 기분과 글. 달별로 모아 보고 찾기
import { useState } from 'react';
import { addDays, longDate, shortDate } from '../study/dates';
import { alive, type DiaryEntry } from '../study/model';
import { put, remove, setSettings, useStudy } from '../study/store';
import { confirmDelete, go, tap, toast, useToday } from '../study/ui';
import { monthLabel, monthOf, shiftMonth } from './calc';
import { daySummary, DIARY_PARTS, dreamDates, formOf } from './diaryForm';

/** 기분 점: 좋을수록 진하게 */
const Mood = ({ m }: { m?: number }) => (m ? <i className={`dy-mood m${m}`} aria-hidden /> : null);
const MOOD_NAME = ['', '나쁨', '별로', '보통', '좋음', '최고'];

/** sub: 날짜(YYYY-MM-DD) 면 그날 쓰기, 'YYYY-MM' 이면 그 달 목록 */
export function Diary({ sub }: { sub?: string }) {
  const today = useToday();
  if (sub === 'dream') return <Dreams />;
  if (sub === 'form') return <Form />;
  if (sub && /^\d{4}-\d{2}-\d{2}$/.test(sub)) return <Write date={sub > today ? today : sub} today={today} />;
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
      </section>
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
          </section>
        ))
      )}
      <p className="st-hint">일기는 이 기기에 저장되고, 로그인하면 내 계정 서버에도 저장돼요 (다른 사람은 볼 수 없어요).</p>
    </div>
  );
}

function Write({ date, today }: { date: string; today: string }) {
  const d = useStudy();
  const cur = d.diary[date] && !d.diary[date].deleted ? d.diary[date] : undefined;
  const [mood, setMood] = useState(cur?.mood ?? 0);
  const [title, setTitle] = useState(cur?.title ?? '');
  const [text, setText] = useState(cur?.text ?? '');
  const form = formOf(d);
  const lines = daySummary(d, date);
  // 새 일기: 양식의 「오늘 한 것」 칸을 앱 기록으로 미리 채운다 (끄면 링크로만)
  const [parts, setParts] = useState<Record<string, string>>(() => ({ ...(cur?.parts ?? {}), ...(!cur && form.autoFill && form.parts.includes('done') && lines.length ? { done: lines.join('\n') } : {}) }));
  const shownParts = DIARY_PARTS.filter((p) => form.parts.includes(p.key) || parts[p.key]?.trim());
  const clean = (x: Record<string, string>) => Object.fromEntries(Object.entries(x).filter(([, v]) => v.trim()));
  const changed = mood !== (cur?.mood ?? 0) || title !== (cur?.title ?? '') || text !== (cur?.text ?? '') || JSON.stringify(clean(parts)) !== JSON.stringify(clean(cur?.parts ?? {}));
  function save() {
    const p = clean(parts);
    if (!text.trim() && !mood && !Object.keys(p).length) return toast('한 줄이라도 써 주세요');
    put('diary', { id: date, mood: mood || undefined, title: title.trim() || undefined, text, parts: Object.keys(p).length ? p : undefined } as DiaryEntry);
    toast('일기를 저장했어요');
    go(`/diary/${monthOf(date)}`);
  }
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={() => (!changed || window.confirm('저장하지 않고 나갈까요?')) && go(`/diary/${monthOf(date)}`)} aria-label="일기 목록">
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
      <section className="st-card st-form">
        <div className="st-seg dy-moods" role="radiogroup" aria-label="오늘 기분">
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
              {p.key === 'done' && lines.length > 0 && parts.done?.trim() !== lines.join('\n') && (
                <button type="button" className="st-link dy-load" onClick={() => setParts({ ...parts, done: lines.join('\n') })}>
                  기록에서 불러오기
                </button>
              )}
            </span>
            <textarea className="st-input" rows={p.key === 'done' ? 3 : 2} value={parts[p.key] ?? ''} onChange={(e) => setParts({ ...parts, [p.key]: e.target.value })} placeholder={p.hint} aria-label={p.label} />
          </label>
        ))}
        <textarea className="st-input dy-text" rows={shownParts.length ? 8 : 12} value={text} onChange={(e) => setText(e.target.value)} placeholder="하고 싶은 말을 자유롭게…" aria-label="일기" />
        <div className="st-row end">
          {cur && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`${shortDate(date)} 일기`)) return;
                remove('diary', date);
                go(`/diary/${monthOf(date)}`);
              }}
            >
              지우기
            </button>
          )}
          <small className="st-muted">{text.length.toLocaleString()}자</small>
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
  const set = (parts: string[], autoFill = form.autoFill) => setSettings({ diaryForm: { parts: DIARY_PARTS.map((p) => p.key).filter((k) => parts.includes(k)), autoFill } });
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>일기 양식</h2>
      </div>
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
        {form.parts.includes('done') && (
          <label className="st-toggle">
            <input type="checkbox" checked={form.autoFill} onChange={(e) => set(form.parts, e.target.checked)} /> 새 일기를 열면 「오늘 한 것」을 앱 기록으로 미리 채우기
          </label>
        )}
      </section>
    </div>
  );
}
