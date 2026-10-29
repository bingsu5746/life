// 게임: 하는 중 · 하고 싶어요 · 끝낸 것 (기기 · 한 시간 · 별점 · 한줄평)
import { useState } from 'react';
import { shortDate } from '../study/dates';
import { alive, newId, type Game } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { confirmDelete, Empty, Field, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { StarInput, starText } from './MovieParts';

type Tab = Game['status'];
const TAB_NAME: Record<Tab, string> = { playing: '하는 중', want: '하고 싶어요', done: '끝낸 것' };
const PLATFORMS = ['PC', '스위치', '플레이스테이션', 'Xbox', '폰'];

export function Games(_: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [tab, setTab] = useState<Tab>('playing');
  const [edit, setEdit] = useState<Partial<Game> | null>(null);
  const all = alive(d.games);
  const by = (s: Tab) => all.filter((g) => g.status === s).sort((a, b) => (s === 'done' ? (b.finished ?? '').localeCompare(a.finished ?? '') : b.created - a.created));
  const list = by(tab);
  const year = today.slice(0, 4);
  const hours = all.reduce((a, g) => a + (g.hours ?? 0), 0);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>게임</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit({ status: tab })} aria-label="게임 넣기">
          <Icon name="plus" />
        </button>
      </div>
      {all.length > 0 && (
        <div className="mv-summary">
          <span>
            올해 끝낸 게임 <b>{by('done').filter((g) => g.finished?.startsWith(year)).length}</b>
          </span>
          {hours > 0 && (
            <span>
              전체 <b>{Math.round(hours)}</b>시간
            </span>
          )}
        </div>
      )}
      <nav className="mv-sub" aria-label="게임">
        {(Object.keys(TAB_NAME) as Tab[]).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {TAB_NAME[k]}
            {by(k).length ? ` ${by(k).length}` : ''}
          </button>
        ))}
      </nav>
      {!list.length ? (
        <Empty title={all.length ? '이 칸에는 게임이 없어요' : '하는 게임을 넣어 보세요'}>
          <p>기기와 한 시간을 적고, 끝내면 별점과 한줄평을 남길 수 있어요.</p>
          <button className="btn btn-primary" onClick={() => setEdit({ status: tab })}>
            게임 넣기
          </button>
        </Empty>
      ) : (
        <div className="mv-list">
          {list.map((g) => (
            <article key={g.id} className="mv-card st-tap" {...tap(() => setEdit(g))}>
              <div className="mv-top">
                <b>{g.title}</b>
                {g.platform && <small className="st-muted">{g.platform}</small>}
              </div>
              <div className="mv-meta">
                {g.status === 'done' ? <span className="mv-stars">{starText(g.rating) || '별점 없음'}</span> : <small className="st-muted">{g.hours ? `${g.hours}시간` : ''}</small>}
                <small className="st-muted">{g.status === 'done' && g.finished ? `${shortDate(g.finished)} 끝냄` : g.status === 'playing' && g.started ? `${shortDate(g.started)}부터` : ''}</small>
              </div>
              {g.note && <p className="mv-comment">“{g.note.split('\n')[0]}”</p>}
            </article>
          ))}
        </div>
      )}
      {edit && <GameSheet item={edit} today={today} onClose={() => setEdit(null)} />}
    </div>
  );
}

function GameSheet({ item, today, onClose }: { item: Partial<Game>; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(item.title ?? '');
  const [platform, setPlatform] = useState(item.platform ?? '');
  const [status, setStatus] = useState<Game['status']>(item.status ?? 'playing');
  const [hours, setHours] = useState(item.hours?.toString() ?? '');
  const [rating, setRating] = useState(item.rating ?? 0);
  const [note, setNote] = useState(item.note ?? '');
  function save() {
    const h = Number(hours);
    put('games', {
      ...item,
      id: item.id ?? newId(),
      created: item.created ?? Date.now(),
      title: title.trim(),
      platform: platform.trim() || undefined,
      status,
      hours: hours && h >= 0 ? Math.round(h * 10) / 10 : undefined,
      rating: status === 'done' && rating ? rating : item.rating,
      note: note.trim() || undefined,
      started: item.started ?? (status === 'playing' ? today : undefined),
      finished: status === 'done' ? (item.finished ?? today) : undefined,
    } as Game);
    toast('저장했어요');
    onClose();
  }
  return (
    <Sheet title={item.id ? '게임 고치기' : '게임 넣기'} onClose={onClose}>
      <div className="st-form">
        <input className="st-input" autoFocus={!item.id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="게임 이름" aria-label="게임 이름" />
        <div className="st-seg">
          {(Object.keys(TAB_NAME) as Game['status'][]).map((k) => (
            <button key={k} type="button" className={status === k ? 'on' : ''} aria-pressed={status === k} onClick={() => setStatus(k)}>
              {TAB_NAME[k]}
            </button>
          ))}
        </div>
        <Field group label="기기">
          <div className="st-chips">
            {PLATFORMS.map((p) => (
              <button key={p} type="button" className={`st-chip ${platform === p ? 'on' : ''}`} aria-pressed={platform === p} onClick={() => setPlatform(platform === p ? '' : p)}>
                {p}
              </button>
            ))}
          </div>
        </Field>
        {status !== 'want' && (
          <label className="st-cond-time">
            한 시간
            <input className="st-input xs" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} aria-label="한 시간" />
          </label>
        )}
        {status === 'done' && (
          <Field group label="별점">
            <StarInput value={rating} onChange={setRating} />
          </Field>
        )}
        <textarea className="st-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'want' ? '하고 싶은 이유 · 누가 추천했는지' : '한줄평 · 메모'} aria-label="메모" />
        <div className="st-row end">
          {item.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('games', item.id!), onClose())}>
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!title.trim()} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}
