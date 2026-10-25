// 일기: 하루에 하나, 기분과 글. 달별로 모아 보고 찾기
import { useState } from 'react';
import { addDays, longDate, shortDate } from '../study/dates';
import { alive, type DiaryEntry } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { confirmDelete, go, tap, toast, useToday } from '../study/ui';
import { monthLabel, monthOf, shiftMonth } from './calc';

/** 기분 점: 좋을수록 진하게 */
const Mood = ({ m }: { m?: number }) => (m ? <i className={`dy-mood m${m}`} aria-hidden /> : null);
const MOOD_NAME = ['', '나쁨', '별로', '보통', '좋음', '최고'];

/** sub: 날짜(YYYY-MM-DD) 면 그날 쓰기, 'YYYY-MM' 이면 그 달 목록 */
export function Diary({ sub }: { sub?: string }) {
  const today = useToday();
  if (sub && /^\d{4}-\d{2}-\d{2}$/.test(sub)) return <Write date={sub > today ? today : sub} today={today} />;
  return <List month={sub && /^\d{4}-\d{2}$/.test(sub) ? sub : monthOf(today)} today={today} />;
}

function List({ month, today }: { month: string; today: string }) {
  const d = useStudy();
  const [q, setQ] = useState('');
  const all = alive(d.diary).sort((a, b) => b.id.localeCompare(a.id));
  const list = q.trim() ? all.filter((e) => `${e.title ?? ''}\n${e.text}`.toLowerCase().includes(q.trim().toLowerCase())) : all.filter((e) => monthOf(e.id) === month);
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
            <p className="dy-preview">{e.text}</p>
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
  const changed = mood !== (cur?.mood ?? 0) || title !== (cur?.title ?? '') || text !== (cur?.text ?? '');
  function save() {
    if (!text.trim() && !mood) return toast('한 줄이라도 써 주세요');
    put('diary', { id: date, mood: mood || undefined, title: title.trim() || undefined, text } as DiaryEntry);
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
        <textarea className="st-input dy-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="오늘 있었던 일, 느낀 것, 고마운 것…" aria-label="일기" />
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
