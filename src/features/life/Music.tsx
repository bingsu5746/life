// 음악: 가진 음반(LP 중심) · 사고 싶은 음반 · 들은 기록
import { useState } from 'react';
import { shortDate } from '../study/dates';
import { alive, newId, type MusicRecord } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { confirmDelete, Empty, Field, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { won } from './calc';
import { isLoggedIn, musicSimilar } from '../auth/api';
import { StarInput, starText } from './MovieParts';
import { NameSearch } from './NameSearch';

const FORMAT: Record<MusicRecord['format'], string> = { lp: 'LP', cd: 'CD', tape: '카세트', digital: '디지털' };
const CONDITIONS = ['미개봉', '민트', '아주 좋음', '좋음', '보통'];
type Sort = 'recent' | 'listened' | 'artist';

export function Music(_: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [tab, setTab] = useState<MusicRecord['status']>('have');
  const [sort, setSort] = useState<Sort>('recent');
  const [fmt, setFmt] = useState<MusicRecord['format'] | ''>('');
  const [edit, setEdit] = useState<Partial<MusicRecord> | null>(null);
  const all = alive(d.records);
  const have = all.filter((r) => r.status === 'have');
  const want = all.filter((r) => r.status === 'want');
  const lps = have.filter((r) => r.format === 'lp');
  const spent = have.reduce((a, r) => a + (r.price ?? 0), 0);
  const month = today.slice(0, 7);
  const monthListens = have.reduce((a, r) => a + (r.listens ?? []).filter((x) => x.startsWith(month)).length, 0);
  const list = (tab === 'have' ? have : want)
    .filter((r) => !fmt || r.format === fmt)
    .sort((a, b) => (sort === 'listened' ? (b.listens?.length ?? 0) - (a.listens?.length ?? 0) : sort === 'artist' ? a.artist.localeCompare(b.artist, 'ko') || a.title.localeCompare(b.title, 'ko') : 0) || (b.bought ?? '').localeCompare(a.bought ?? '') || b.created - a.created);
  const formats = [...new Set(all.map((r) => r.format))];
  const listen = (r: MusicRecord) => {
    if (r.listens?.includes(today)) return toast('오늘 이미 들은 것으로 적었어요');
    put('records', { ...r, listens: [...(r.listens ?? []), today] });
    toast(`「${r.title}」 들었어요 · ${(r.listens?.length ?? 0) + 1}번째`);
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>음악</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit({ status: tab, format: 'lp' })} aria-label="음반 넣기">
          <Icon name="plus" />
        </button>
      </div>
      {have.length > 0 && (
        <div className="mv-summary">
          <span>
            LP <b>{lps.length}</b>장{have.length > lps.length ? ` · 전체 ${have.length}` : ''}
          </span>
          {spent > 0 && (
            <span>
              모은 값 <b>{won(spent)}</b>
            </span>
          )}
          <span>
            이번 달 <b>{monthListens}</b>번 들음
          </span>
        </div>
      )}
      <nav className="mv-sub" aria-label="음악">
        <button className={tab === 'have' ? 'on' : ''} onClick={() => setTab('have')}>
          내 음반{have.length ? ` ${have.length}` : ''}
        </button>
        <button className={tab === 'want' ? 'on' : ''} onClick={() => setTab('want')}>
          사고 싶어요{want.length ? ` ${want.length}` : ''}
        </button>
      </nav>
      {(formats.length > 1 || (tab === 'have' && have.length > 3)) && (
        <div className="st-inline between wrap">
          {formats.length > 1 ? (
            <div className="st-chips">
              {formats.map((f) => (
                <button key={f} className={`st-chip ${fmt === f ? 'on' : ''}`} aria-pressed={fmt === f} onClick={() => setFmt(fmt === f ? '' : f)}>
                  {FORMAT[f]}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {tab === 'have' && have.length > 3 && (
            <select className="st-input xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
              <option value="recent">최근 산 순</option>
              <option value="listened">많이 들은 순</option>
              <option value="artist">아티스트순</option>
            </select>
          )}
        </div>
      )}
      {!list.length ? (
        <Empty title={tab === 'have' ? '가진 LP를 넣어 보세요' : '사고 싶은 음반을 적어 두세요'}>
          <p>{tab === 'have' ? '앨범 · 아티스트 · 산 값을 적고, 들을 때마다 「들었어요」를 누르면 많이 들은 판이 보여요.' : '레코드 가게에서 찾을 판을 적어 두고, 사면 「샀어요」로 옮겨요.'}</p>
          <button className="btn btn-primary" onClick={() => setEdit({ status: tab, format: 'lp' })}>
            음반 넣기
          </button>
        </Empty>
      ) : (
        <div className="lp-grid">
          {list.map((r) => (
            <article key={r.id} className="lp-card st-tap" {...tap(() => setEdit(r))}>
              <div className="lp-disc" aria-hidden>
                <i />
              </div>
              <div className="lp-info">
                <b>{r.title}</b>
                <span>{r.artist}</span>
                <small className="st-muted">{[FORMAT[r.format] !== 'LP' && FORMAT[r.format], r.year, r.condition, r.rating && starText(r.rating)].filter(Boolean).join(' · ')}</small>
              </div>
              {r.status === 'have' ? (
                <button
                  className={`btn btn-sm ${r.listens?.includes(today) ? '' : 'btn-primary'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    listen(r);
                  }}
                >
                  {r.listens?.includes(today) ? '오늘 들음 ✓' : '들었어요'}
                  {r.listens?.length ? ` ${r.listens.length}` : ''}
                </button>
              ) : (
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEdit({ ...r, status: 'have', bought: today });
                  }}
                >
                  샀어요
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {tab === 'have' && have.length > 0 && <MusicRec onPick={(artist) => setEdit({ status: 'want', format: 'lp', artist })} />}
      {edit && <RecordSheet item={edit} today={today} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** 별점 높은(없으면 많이 들은) 음반의 아티스트와 비슷한 아티스트 (Last.fm) */
function MusicRec({ onPick }: { onPick: (artist: string) => void }) {
  const d = useStudy();
  const [items, setItems] = useState<{ name: string; because: string[] }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const have = alive(d.records).filter((r) => r.status === 'have');
  const liked = [...have].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.listens?.length ?? 0) - (a.listens?.length ?? 0)).filter((r) => (r.rating ?? 0) >= 4 || (r.listens?.length ?? 0) > 0 || !have.some((x) => x.rating));
  const artists = [...new Set(liked.map((r) => r.artist))].slice(0, 8);
  if (!artists.length) return null;
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">비슷한 아티스트</h3>
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            if (!isLoggedIn()) return toast('추천은 로그인한 뒤에 쓸 수 있어요');
            setBusy(true);
            try {
              setItems((await musicSimilar(artists, [...new Set(have.map((r) => r.artist))])).items);
            } catch (e) {
              toast(e instanceof Error ? e.message : '추천을 받지 못했어요');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '찾는 중…' : items ? '다시' : '추천받기'}
        </button>
      </div>
      {items?.map((x) => (
        <div key={x.name} className="st-item st-tap" onClick={() => onPick(x.name)}>
          <div className="st-item-main">
            <div className="st-item-title">{x.name}</div>
            <div className="st-item-sub">{x.because.join(' · ')}와 비슷해요</div>
          </div>
          <span className="st-link">담기</span>
        </div>
      ))}
      {items && !items.length && <p className="st-muted">찾은 아티스트가 없어요.</p>}
    </section>
  );
}

function RecordSheet({ item, today, onClose }: { item: Partial<MusicRecord>; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(item.title ?? '');
  const [artist, setArtist] = useState(item.artist ?? '');
  const [format, setFormat] = useState<MusicRecord['format']>(item.format ?? 'lp');
  const [status, setStatus] = useState<MusicRecord['status']>(item.status ?? 'have');
  const [year, setYear] = useState(item.year?.toString() ?? '');
  const [price, setPrice] = useState(item.price ? item.price.toLocaleString('ko-KR') : '');
  const [bought, setBought] = useState(item.bought ?? (status === 'have' ? today : ''));
  const [shop, setShop] = useState(item.shop ?? '');
  const [condition, setCondition] = useState(item.condition ?? '');
  const [rating, setRating] = useState(item.rating ?? 0);
  const [note, setNote] = useState(item.note ?? '');
  function save() {
    const p = Number(price.replace(/\D/g, ''));
    const y = Number(year);
    put('records', {
      ...item,
      id: item.id ?? newId(),
      created: item.created ?? Date.now(),
      title: title.trim(),
      artist: artist.trim(),
      format,
      status,
      year: y >= 1800 && y <= 2200 ? y : undefined,
      price: p > 0 ? p : undefined,
      bought: status === 'have' ? bought || undefined : undefined,
      shop: shop.trim() || undefined,
      condition: condition || undefined,
      rating: rating || undefined,
      note: note.trim() || undefined,
    } as MusicRecord);
    toast('저장했어요');
    onClose();
  }
  return (
    <Sheet title={item.id ? '음반 고치기' : '음반 넣기'} onClose={onClose}>
      <div className="st-form">
        <NameSearch
          type="music"
          value={title}
          onChange={setTitle}
          picked={!!item.id}
          onPick={(f) => {
            setTitle(f.title);
            if (f.by) setArtist(f.by);
            if (f.year) setYear(String(f.year));
          }}
          placeholder="앨범 이름 (아티스트와 함께 치면 더 잘 찾아요)"
          label="앨범 이름"
        />
        <input className="st-input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="아티스트" aria-label="아티스트" />
        <div className="st-seg">
          {(Object.keys(FORMAT) as MusicRecord['format'][]).map((f) => (
            <button key={f} type="button" className={format === f ? 'on' : ''} aria-pressed={format === f} onClick={() => setFormat(f)}>
              {FORMAT[f]}
            </button>
          ))}
        </div>
        <div className="st-seg">
          <button type="button" className={status === 'have' ? 'on' : ''} aria-pressed={status === 'have'} onClick={() => setStatus('have')}>
            가지고 있어요
          </button>
          <button type="button" className={status === 'want' ? 'on' : ''} aria-pressed={status === 'want'} onClick={() => setStatus('want')}>
            사고 싶어요
          </button>
        </div>
        <div className="st-inline wrap">
          <input className="st-input xs" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="발매 연도" aria-label="발매 연도" />
          <input className="st-input sm" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '').slice(0, 9)).toLocaleString('ko-KR') : '')} placeholder={status === 'want' ? '예상 값' : '산 값'} aria-label="값 (원)" />원
        </div>
        {status === 'have' && (
          <>
            <div className="st-inline wrap">
              <input className="st-input sm" type="date" max={today} value={bought} onChange={(e) => setBought(e.target.value)} aria-label="산 날" />
              <input className="st-input sm" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="산 곳 (선택)" aria-label="산 곳" />
            </div>
            {format === 'lp' && (
              <Field group label="판 상태">
                <div className="st-chips">
                  {CONDITIONS.map((c) => (
                    <button key={c} type="button" className={`st-chip ${condition === c ? 'on' : ''}`} aria-pressed={condition === c} onClick={() => setCondition(condition === c ? '' : c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field group label="별점">
              <StarInput value={rating} onChange={setRating} />
            </Field>
          </>
        )}
        <textarea className="st-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="좋아하는 곡 · 메모" aria-label="메모" />
        {item.listens && item.listens.length > 0 && <small className="st-muted">들은 날 {item.listens.length}번 · 마지막 {shortDate(item.listens[item.listens.length - 1])}</small>}
        <div className="st-row end">
          {item.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('records', item.id!), onClose())}>
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!title.trim() || !artist.trim()} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}
