// 일기 더: 미래의 나에게 편지 · 일기 속 사람 · 기분별 자주 쓴 말
import { useMemo, useState } from 'react';
import { addDays, diffDays, longDate, shortDate } from '../study/dates';
import { alive, newId, type DiaryEntry, type Letter } from '../study/model';
import { put, remove, setSettings, useStudy } from '../study/store';
import { confirmDelete, Empty, go, tap, toast, useToday } from '../study/ui';
import { entryText, moodWords, nameCandidates, personEntries, snippetOf } from './diarySearch';

const MOOD_NAME = ['', '나쁨', '별로', '보통', '좋음', '최고'];
const Mood = ({ m }: { m?: number }) => (m ? <i className={`dy-mood m${m}`} aria-hidden /> : null);

// ===== 미래의 나에게 편지 =====

const ylong = (x: string) => `${x.slice(0, 4)}년 ${longDate(x)}`;

const PRESETS: [string, (t: string) => string][] = [
  ['한 달 뒤', (t) => addDays(t, 30)],
  ['100일 뒤', (t) => addDays(t, 100)],
  ['1년 뒤', (t) => `${Number(t.slice(0, 4)) + 1}${t.slice(4) === '-02-29' ? '-02-28' : t.slice(4)}`],
];

export function LettersPage() {
  const d = useStudy();
  const today = useToday();
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [openOn, setOpenOn] = useState(() => PRESETS[0][1](today));
  const [reading, setReading] = useState<Letter | null>(null);
  const letters = alive(d.letters ?? {}).sort((a, b) => a.openOn.localeCompare(b.openOn));
  const arrived = letters.filter((l) => l.openOn <= today).reverse();
  const waiting = letters.filter((l) => l.openOn > today);
  const send = () => {
    if (!text.trim()) return toast('편지를 적어 주세요');
    if (openOn <= today) return toast('열리는 날은 내일 뒤로 골라 주세요');
    put('letters', { id: newId(), written: today, openOn, title: title.trim() || undefined, text: text.trim(), created: Date.now() } as Letter);
    setTitle('');
    setText('');
    setWriting(false);
    toast(`${ylong(openOn)}에 열려요`);
  };
  const open = (l: Letter) => {
    if (!l.openedAt) put('letters', { ...l, openedAt: Date.now() });
    setReading(l);
  };
  if (reading)
    return (
      <div className="st-page narrow">
        <div className="st-page-head">
          <button className="st-back" onClick={() => setReading(null)} aria-label="편지 목록">
            ‹
          </button>
          <h2>{reading.title || '과거의 나에게서 온 편지'}</h2>
        </div>
        <section className="st-card dy-letter">
          <small className="st-muted">
            {ylong(reading.written)}에 씀 · {diffDays(reading.written, reading.openOn)}일 만에 도착
          </small>
          <p>{reading.text}</p>
        </section>
        <button className="btn" onClick={() => go(`/diary/${reading.written}`)}>
          그날 일기 보기
        </button>
      </div>
    );
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>미래의 나에게</h2>
        {!writing && (
          <button className="btn btn-sm btn-primary" onClick={() => setWriting(true)}>
            편지 쓰기
          </button>
        )}
      </div>
      {writing && (
        <section className="st-card st-form">
          <input className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (선택)" aria-label="편지 제목" />
          <textarea className="st-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="그때의 나는 어떻게 지내고 있을까?" aria-label="편지" />
          <div className="st-chips">
            {PRESETS.map(([label, f]) => (
              <button key={label} className={`st-chip ${openOn === f(today) ? 'on' : ''}`} onClick={() => setOpenOn(f(today))}>
                {label}
              </button>
            ))}
            <input className="st-input sm" type="date" min={addDays(today, 1)} value={openOn} onChange={(e) => e.target.value && setOpenOn(e.target.value)} aria-label="열리는 날" />
          </div>
          <p className="st-hint">{ylong(openOn)}이 되기 전에는 나도 다시 읽을 수 없어요. 그날 아침 9시에 알림이 가요(알림을 켰을 때).</p>
          <div className="st-row end">
            <button className="btn" onClick={() => setWriting(false)}>
              그만두기
            </button>
            <button className="btn btn-primary" onClick={send}>
              보내기
            </button>
          </div>
        </section>
      )}
      {!letters.length && !writing && (
        <Empty title="미래의 나에게 편지를 보내 보세요">
          <p>정한 날이 될 때까지 잠겨 있다가, 그날 열려요.</p>
        </Empty>
      )}
      {arrived.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">도착한 편지</h3>
          {arrived.map((l) => (
            <button key={l.id} className="dy-hit" onClick={() => open(l)}>
              <small className="st-muted">
                {shortDate(l.written)} {l.written.slice(0, 4)}에 씀 · {shortDate(l.openOn)} 도착{!l.openedAt ? ' · 새 편지' : ''}
              </small>
              <b>{l.title || '과거의 나에게서 온 편지'}</b>
            </button>
          ))}
        </section>
      )}
      {waiting.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">가는 중</h3>
          {waiting.map((l) => (
            <div key={l.id} className="mt-row">
              <span>
                <b>{l.title || '편지'}</b>
                <small>
                  {shortDate(l.written)}에 씀 · {ylong(l.openOn)}에 열림
                </small>
              </span>
              <em className="dy-dday">D-{diffDays(today, l.openOn)}</em>
              <button className="st-link" onClick={() => confirmDelete('이 편지') && remove('letters', l.id)}>
                지우기
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** 메인: 도착했는데 아직 안 읽은 편지 */
export function LetterBanner({ today }: { today: string }) {
  const d = useStudy();
  const n = alive(d.letters ?? {}).filter((l) => l.openOn <= today && !l.openedAt).length;
  if (!n) return null;
  return (
    <button className="hm-ago" onClick={() => go('/diary/letter')}>
      <small>미래의 나에게</small>
      <b>과거의 나에게서 편지 {n}통이 도착했어요</b>
    </button>
  );
}

// ===== 일기 속 사람 =====

export function PeoplePage() {
  const d = useStudy();
  const people = d.settings.diaryPeople ?? [];
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo(() => alive(d.diary).filter((e) => !e.auto).sort((a, b) => b.id.localeCompare(a.id)), [d.diary]);
  const known = people.flatMap((p) => [p.name, ...p.aliases]);
  const cands = useMemo(() => nameCandidates(all, known), [all, known.join('|')]);
  const birthday = (d.settings.birthdays ?? []).map((b) => b.name).filter((n) => !known.includes(n));
  const add = (n: string) => {
    const v = n.trim();
    if (!v || known.includes(v)) return;
    setSettings({ diaryPeople: [...people, { id: newId(), name: v.slice(0, 20), aliases: [] }] });
    setName('');
  };
  const stats = people
    .map((p) => {
      const es = personEntries(all, [p.name, ...p.aliases]);
      const moods = es.map((e) => e.mood).filter((m): m is number => !!m);
      return { p, es, avg: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null };
    })
    .sort((a, b) => b.es.length - a.es.length);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>일기 속 사람</h2>
      </div>
      <form
        className="st-inline"
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
        }}
      >
        <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 민수)" aria-label="사람 이름" />
        <button className="btn btn-sm btn-primary" type="submit" disabled={!name.trim()}>
          넣기
        </button>
      </form>
      {(cands.length > 0 || birthday.length > 0) && (
        <div className="dy-cands">
          <small className="st-muted">일기에 자주 나온 이름</small>
          <div className="st-chips">
            {[...birthday.map((n) => ({ name: n, n: 0 })), ...cands].map((c) => (
              <button key={c.name} className="st-chip" onClick={() => add(c.name)}>
                + {c.name}
                {c.n ? <small className="st-muted"> {c.n}</small> : null}
              </button>
            ))}
          </div>
        </div>
      )}
      {!people.length && (
        <Empty title="일기에 나오는 사람을 넣어 보세요">
          <p>그 사람이 나온 일기를 모아 보고, 함께한 날 기분이 어땠는지 보여 줘요.</p>
        </Empty>
      )}
      {stats.map(({ p, es, avg }) => (
        <section key={p.id} className="st-card">
          <div className="st-inline between st-tap" {...tap(() => setOpen(open === p.id ? null : p.id))}>
            <b>{p.name}</b>
            <small className="st-muted">
              {es.length}편{es.length ? ` · 마지막 ${shortDate(es[0].id)}` : ''}
              {avg !== null ? ` · 기분 ${MOOD_NAME[Math.round(avg)]}` : ''}
            </small>
          </div>
          {open === p.id && (
            <>
              <PersonEdit p={p} />
              {es.slice(0, 50).map((e) => (
                <EntryRow key={e.id} e={e} word={[p.name, ...p.aliases].find((n) => entryText(e).includes(n)) ?? p.name} />
              ))}
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function PersonEdit({ p }: { p: { id: string; name: string; aliases: string[] } }) {
  const d = useStudy();
  const people = d.settings.diaryPeople ?? [];
  const [al, setAl] = useState(p.aliases.join(', '));
  const save = (patch: Partial<typeof p> | null) => setSettings({ diaryPeople: patch ? people.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) : people.filter((x) => x.id !== p.id) });
  return (
    <div className="st-inline wrap dy-person-edit">
      <input
        className="st-input sm"
        value={al}
        onChange={(e) => setAl(e.target.value)}
        onBlur={() =>
          save({
            aliases: al
              .split(/[,\s]+/)
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 8),
          })
        }
        placeholder="다르게 부르는 말 (쉼표로)"
        aria-label="다르게 부르는 말"
      />
      <button className="st-link" onClick={() => confirmDelete(p.name) && save(null)}>
        빼기
      </button>
    </div>
  );
}

function EntryRow({ e, word }: { e: DiaryEntry; word: string }) {
  return (
    <button className="dy-hit" onClick={() => go(`/diary/${e.id}`)}>
      <small className="st-muted">
        {shortDate(e.id)} {e.id.slice(0, 4)}
      </small>
      <b>
        <Mood m={e.mood} /> {e.title || shortDate(e.id)}
      </b>
      <span className="dy-preview">{snippetOf(entryText(e), word, 50)}</span>
    </button>
  );
}

// ===== 기분별 자주 쓴 말 =====

export function MoodWordsPage() {
  const d = useStudy();
  const all = useMemo(() => alive(d.diary).filter((e) => !e.auto), [d.diary]);
  const r = useMemo(() => moodWords(all), [all]);
  const find = (w: string) => {
    try {
      sessionStorage.setItem('my-study.diary.q', w);
    } catch {
      /* 무시 */
    }
    go('/diary/search');
  };
  const Col = ({ title, days, list, good }: { title: string; days: number; list: { w: string; g: number; b: number }[]; good: boolean }) => (
    <section className="st-card">
      <h3 className="st-h">
        {title} <small className="st-muted">{days}편</small>
      </h3>
      {!list.length ? (
        <p className="st-muted">아직 일기가 적어서 못 찾았어요.</p>
      ) : (
        <div className="dy-words">
          {list.map((x) => (
            <button key={x.w} className="dy-word" onClick={() => find(x.w)}>
              <b>{x.w}</b>
              <small>
                {good ? x.g : x.b}편{(good ? x.b : x.g) ? ` · ${good ? '나쁜' : '좋은'} 날 ${good ? x.b : x.g}편` : ''}
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>기분별 자주 쓴 말</h2>
      </div>
      <p className="st-hint">기분이 좋은 날(좋음 · 최고)과 나쁜 날(나쁨 · 별로)의 일기에서 한쪽에 더 자주 나온 말이에요. 두 편 이상 나온 말만 세고, 누르면 그 말이 나온 일기를 찾아요.</p>
      <Col title="기분 좋은 날" days={r.goodDays} list={r.good} good />
      <Col title="기분 나쁜 날" days={r.badDays} list={r.bad} good={false} />
    </div>
  );
}
