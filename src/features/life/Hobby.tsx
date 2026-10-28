// 취미: 내 취미와 한 시간 기록 · 하고 싶은 것 (책·영화·드라마·게임·장소)
import { useEffect, useState } from 'react';
import { BarChart } from '../study/charts';
import { shortDate, weekStart } from '../study/dates';
import { alive, newId, type Hobby as HobbyT, type HobbyLog, type WishItem } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { Bar, confirmDelete, Empty, Field, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { hobbyWeek, weeklyMinutes } from './calc';

const WISH_KIND: Record<WishItem['kind'], string> = {
  book: '책',
  movie: '영화',
  show: '드라마',
  game: '게임',
  place: '가 볼 곳',
  other: '그 밖',
};
// 영화는 「영화」 칸에서 따로 (예전에 넣은 영화만 여기 남는다)
const STATUS: Record<WishItem['status'], string> = {
  want: '하고 싶은 것',
  doing: '하는 중',
  done: '끝낸 것',
};
const md = (x: string) => shortDate(x).replace(/\(.\)/, '');

/** sub: 'new' 이면 기록 넣기 창. 예전 주소 /hobby/movies 는 영화 영역으로 */
export function Hobby({ sub, sub2 }: { sub?: string; sub2?: string }) {
  if (sub === 'movies') return <MovedToMovies sub={sub2} />;
  return <HobbyMain sub={sub} />;
}

function MovedToMovies({ sub }: { sub?: string }) {
  useEffect(() => window.location.replace(sub ? `#/movies/${sub}` : '#/movies'), [sub]);
  return null;
}

function HobbyMain({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [log, setLog] = useState<HobbyLog | 'new' | null>(sub === 'new' ? 'new' : null);
  const [hobbyEdit, setHobbyEdit] = useState<HobbyT | 'new' | null>(null);
  const [wish, setWish] = useState<WishItem | 'new' | null>(null);
  const [status, setStatus] = useState<WishItem['status']>('want');
  const hobbies = alive(d.hobbies).sort((a, b) => a.order - b.order);
  const logs = alive(d.hobbyLogs).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const week = hobbyWeek(logs, weekStart(today));
  const weeks = weeklyMinutes(logs, today, 8);
  const wishes = alive(d.wishes)
    .filter((w) => w.status === status)
    .sort((a, b) => (status === 'done' ? (b.doneDate ?? '').localeCompare(a.doneDate ?? '') : b.created - a.created));
  const h = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}시간` : `${m}분`);
  const close = () => {
    setLog(null);
    if (sub) go('/hobby');
  };
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>취미</h2>
        <button className="btn btn-sm btn-primary" onClick={() => (hobbies.length ? setLog('new') : setHobbyEdit('new'))}>
          <Icon name="plus" /> {hobbies.length ? '한 것 넣기' : '취미 만들기'}
        </button>
      </div>

      <section className="st-card">
        <div className="st-inline between">
          <h3 className="st-h">내 취미 · 이번 주</h3>
          <button className="st-link" onClick={() => setHobbyEdit('new')}>
            ＋ 취미
          </button>
        </div>
        {!hobbies.length && <p className="st-hint">기타·그림·독서·게임처럼 꾸준히 하고 싶은 취미를 만들고, 한 시간을 적어 보세요.</p>}
        {hobbies.map((x) => (
          <div key={x.id} className="st-subj-row">
            <span className="st-tap" {...tap(() => setHobbyEdit(x))}>
              {x.name}
            </span>
            <Bar value={week.get(x.id) ?? 0} max={x.weeklyGoal || Math.max(60, ...hobbies.map((y) => week.get(y.id) ?? 0))} label={`${x.name} 이번 주`} />
            <small>
              {minutesText(week.get(x.id) ?? 0)}
              {x.weeklyGoal ? ` / ${minutesText(x.weeklyGoal)}` : ''}
            </small>
          </div>
        ))}
        {logs.length > 0 && (
          <BarChart
            label="주별 취미 시간"
            height={130}
            bars={weeks.map((w, i) => ({
              label: md(w.start),
              title: `${shortDate(w.start)} 주`,
              value: w.min,
              strong: i === weeks.length - 1,
            }))}
            format={h}
            tickUnit={Math.max(...weeks.map((w) => w.min)) >= 120 ? 60 : 1}
          />
        )}
      </section>

      {logs.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">최근 한 것</h3>
          {logs.slice(0, 15).map((l) => (
            <div key={l.id} className="st-item st-tap" {...tap(() => setLog(l))}>
              <small className="st-muted nowrap">{shortDate(l.date)}</small>
              <div className="st-item-main">
                <div className="st-item-title">
                  {d.hobbies[l.hobbyId]?.name ?? '취미'}
                  {l.minutes ? ` · ${minutesText(l.minutes)}` : ''}
                </div>
                {l.memo && <div className="st-item-sub">{l.memo}</div>}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="st-card">
        <div className="st-inline between wrap">
          <div className="st-seg" aria-label="하고 싶은 것">
            {(Object.keys(STATUS) as WishItem['status'][]).map((s) => (
              <button key={s} className={status === s ? 'on' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>
                {STATUS[s]} {alive(d.wishes).filter((w) => w.status === s).length || ''}
              </button>
            ))}
          </div>
          <button className="st-link" onClick={() => setWish('new')}>
            ＋ 넣기
          </button>
        </div>
        {!wishes.length ? (
          <p className="st-hint">{status === 'want' ? '읽고 싶은 책, 보고 싶은 드라마, 가 보고 싶은 곳을 적어 두세요. 영화는 「영화」 칸에서 따로 모아요.' : status === 'doing' ? '하는 중인 것이 없어요.' : '아직 끝낸 것이 없어요.'}</p>
        ) : (
          wishes.map((w) => (
            <div key={w.id} className="st-item">
              <span className="st-pill">{WISH_KIND[w.kind]}</span>
              <div className="st-item-main st-tap" {...tap(() => setWish(w))}>
                <div className="st-item-title">{w.title}</div>
                {(w.note || w.rating) && (
                  <div className="st-item-sub">
                    {w.rating ? '★'.repeat(w.rating) + '☆'.repeat(5 - w.rating) : ''} {w.note}
                  </div>
                )}
              </div>
              {w.status !== 'done' && (
                <button className="btn btn-sm" onClick={() => (w.status === 'want' ? put('wishes', { ...w, status: 'doing' }) : setWish({ ...w, status: 'done', doneDate: today }))}>
                  {w.status === 'want' ? '시작' : '끝냈어요'}
                </button>
              )}
            </div>
          ))
        )}
      </section>

      {!hobbies.length && !alive(d.wishes).length && (
        <Empty icon="🎸" title="좋아하는 것을 넣어 보세요">
          <p>공부만 하면 지쳐요. 취미에 쓴 시간도 적어 두면 한 주를 돌아볼 때 도움이 돼요.</p>
        </Empty>
      )}

      {log && <LogSheet item={log === 'new' ? undefined : log} today={today} onClose={close} />}
      {hobbyEdit && <HobbySheet item={hobbyEdit === 'new' ? undefined : hobbyEdit} onClose={() => setHobbyEdit(null)} />}
      {wish && <WishSheet item={wish === 'new' ? undefined : wish} today={today} onClose={() => setWish(null)} />}
    </div>
  );
}

function LogSheet({ item, today, onClose }: { item?: HobbyLog; today: string; onClose: () => void }) {
  const d = useStudy();
  const hobbies = alive(d.hobbies).sort((a, b) => a.order - b.order);
  const [hobbyId, setHobbyId] = useState(item?.hobbyId ?? hobbies[0]?.id ?? '');
  const [date, setDate] = useState(item?.date ?? today);
  const [minutes, setMinutes] = useState(item?.minutes?.toString() ?? '30');
  const [memo, setMemo] = useState(item?.memo ?? '');
  return (
    <Sheet title={item ? '고치기' : '취미 한 것 넣기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-chips">
          {hobbies.map((x) => (
            <button key={x.id} type="button" className={`st-chip ${hobbyId === x.id ? 'on' : ''}`} aria-pressed={hobbyId === x.id} onClick={() => setHobbyId(x.id)}>
              {x.name}
            </button>
          ))}
        </div>
        <div className="st-inline wrap">
          <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
          <input className="st-input xs" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="시간 (분)" />분
        </div>
        <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="무엇을 했나 (예: 새 곡 연습)" aria-label="메모" />
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete('이 기록') && (remove('hobbyLogs', item.id), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!hobbyId || !date}
            onClick={() => {
              const m = Number(minutes);
              put('hobbyLogs', {
                ...(item ?? { created: Date.now() }),
                id: item?.id ?? newId(),
                hobbyId,
                date,
                minutes: m > 0 && m <= 1440 ? m : undefined,
                memo: memo.trim() || undefined,
              } as HobbyLog);
              toast(item ? '고쳤어요' : '기록했어요');
              onClose();
            }}
          >
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function HobbySheet({ item, onClose }: { item?: HobbyT; onClose: () => void }) {
  const d = useStudy();
  const [name, setName] = useState(item?.name ?? '');
  const [goal, setGoal] = useState(item?.weeklyGoal ? String(Math.round((item.weeklyGoal / 60) * 10) / 10) : '');
  return (
    <Sheet title={item ? '취미 고치기' : '취미 만들기'} onClose={onClose}>
      <div className="st-form">
        <Field label="이름">
          <input className="st-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 기타, 그림, 독서" />
        </Field>
        <div className="st-inline">
          일주일 목표
          <input className="st-input xs" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="일주일 목표 (시간)" />
          시간 (선택)
        </div>
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.name}」 취미`) && (remove('hobbies', item.id), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              const g = Number(goal);
              put('hobbies', {
                ...(item ?? { order: alive(d.hobbies).length }),
                id: item?.id ?? newId(),
                name: name.trim().slice(0, 30),
                weeklyGoal: g > 0 ? Math.round(g * 60) : undefined,
              } as HobbyT);
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function WishSheet({ item, today, onClose }: { item?: WishItem; today: string; onClose: () => void }) {
  const [kind, setKind] = useState<WishItem['kind']>(item?.kind ?? 'book');
  const [title, setTitle] = useState(item?.title ?? '');
  const [status, setStatus] = useState<WishItem['status']>(item?.status ?? 'want');
  const [rating, setRating] = useState(item?.rating ?? 0);
  const [note, setNote] = useState(item?.note ?? '');
  return (
    <Sheet title={item?.id ? '고치기' : '하고 싶은 것 넣기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-chips">
          {(Object.keys(WISH_KIND) as WishItem['kind'][])
            .filter((k) => k !== 'movie' || kind === 'movie')
            .map((k) => (
              <button key={k} type="button" className={`st-chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {WISH_KIND[k]}
              </button>
            ))}
        </div>
        <input className="st-input" autoFocus={!item} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 · 이름" aria-label="제목" />
        <div className="st-seg">
          {(Object.keys(STATUS) as WishItem['status'][]).map((s) => (
            <button key={s} type="button" className={status === s ? 'on' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {STATUS[s]}
            </button>
          ))}
        </div>
        {status === 'done' && (
          <div className="st-inline" role="radiogroup" aria-label="별점">
            {[1, 2, 3, 4, 5].map((r) => (
              <button key={r} type="button" className="hb-star" role="radio" aria-checked={rating === r} aria-label={`${r}점`} onClick={() => setRating(r)}>
                {r <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        )}
        <textarea className="st-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'done' ? '한 줄 감상' : '메모 (누가 추천했는지 등)'} aria-label="메모" />
        <div className="st-row end">
          {item?.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('wishes', item.id), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!title.trim()}
            onClick={() => {
              put('wishes', {
                ...(item ?? { created: Date.now() }),
                id: item?.id ?? newId(),
                kind,
                title: title.trim().slice(0, 80),
                status,
                rating: status === 'done' && rating ? rating : undefined,
                note: note.trim() || undefined,
                doneDate: status === 'done' ? (item?.doneDate ?? today) : undefined,
              } as WishItem);
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}
