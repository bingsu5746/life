// 여행: 가 볼 곳 · 다녀온 곳 (맛집 · 카페 · 관광지 · 숙소)
import { lazy, Suspense, useState } from 'react';
import { shortDate } from '../study/dates';
import { alive, newId, type TravelPlace } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { confirmDelete, Empty, Field, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { StarInput, starText } from './MovieParts';
import { routeUrl, searchPlaces, type KPlace } from './kakao';

const KakaoMap = lazy(() => import('./KakaoMap'));
const PickMap = lazy(() => import('./PlaceMap').then((m) => ({ default: m.PickMap })));

const KIND: Record<TravelPlace['kind'], string> = { food: '맛집', cafe: '카페', sight: '관광지', stay: '숙소', etc: '기타' };

export function Travel() {
  const d = useStudy();
  const today = useToday();
  const [tab, setTab] = useState<TravelPlace['status']>('want');
  const [kind, setKind] = useState<TravelPlace['kind'] | ''>('');
  const [edit, setEdit] = useState<Partial<TravelPlace> | null>(null);
  const [map, setMap] = useState(false);
  const all = alive(d.places);
  const list = all.filter((p) => p.status === tab && (!kind || p.kind === kind)).sort((a, b) => (tab === 'visited' ? (b.visited ?? '').localeCompare(a.visited ?? '') : (a.region ?? '').localeCompare(b.region ?? '', 'ko')) || b.created - a.created);
  const kinds = [...new Set(all.filter((p) => p.status === tab).map((p) => p.kind))];
  // 지역별로 묶어서
  const groups = new Map<string, TravelPlace[]>();
  for (const p of list) groups.set(p.region || '지역 없음', [...(groups.get(p.region || '지역 없음') ?? []), p]);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>여행</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit({ status: tab, kind: kind || 'food' })} aria-label="장소 넣기">
          <Icon name="plus" />
        </button>
      </div>
      <nav className="mv-sub" aria-label="여행">
        <button className={tab === 'want' ? 'on' : ''} onClick={() => setTab('want')}>
          가 볼 곳{all.filter((p) => p.status === 'want').length ? ` ${all.filter((p) => p.status === 'want').length}` : ''}
        </button>
        <button className={tab === 'visited' ? 'on' : ''} onClick={() => setTab('visited')}>
          다녀온 곳{all.filter((p) => p.status === 'visited').length ? ` ${all.filter((p) => p.status === 'visited').length}` : ''}
        </button>
        <button className={map ? 'on' : ''} onClick={() => setMap(!map)}>
          지도
        </button>
      </nav>
      {map && (
        <Suspense fallback={<div className="pm-map" />}>
          <KakaoMap pins={all.filter((p) => p.lat !== undefined && p.lon !== undefined && (!kind || p.kind === kind)).map((p) => ({ id: p.id, lat: p.lat!, lon: p.lon!, name: p.name, done: p.status === 'visited' }))} onOpen={(id) => setEdit(d.places[id])} onAdd={(k) => setEdit(fromKakao(k, all))} />
        </Suspense>
      )}
      {map
        ? null
        : kinds.length > 1 && (
            <div className="st-chips">
              {kinds.map((k) => (
                <button key={k} className={`st-chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>
                  {KIND[k]}
                </button>
              ))}
            </div>
          )}
      {map ? null : !list.length ? (
        <Empty title={tab === 'want' ? '가 보고 싶은 곳을 모아 두세요' : '다녀온 곳을 남겨 보세요'}></Empty>
      ) : (
        [...groups].map(([region, ps]) => (
          <section key={region} className="st-card">
            <small className="aw-label">{region}</small>
            {ps.map((p) => (
              <div key={p.id} className="st-item st-tap" {...tap(() => setEdit(p))}>
                <span className="st-pill">{KIND[p.kind]}</span>
                <div className="st-item-main">
                  <div className="st-item-title">{p.name}</div>
                  {(p.note || p.visited || p.rating || p.addr) && <div className="st-item-sub">{[p.rating && starText(p.rating), p.visited && shortDate(p.visited), p.note?.split('\n')[0] || p.addr].filter(Boolean).join(' · ')}</div>}
                </div>
                {p.lat !== undefined && p.lon !== undefined && (
                  <a className="st-link" href={routeUrl(p.name, p.lat, p.lon)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    길찾기
                  </a>
                )}
                {p.status === 'want' && (
                  <button
                    className="st-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEdit({ ...p, status: 'visited', visited: today });
                    }}
                  >
                    다녀왔어요
                  </button>
                )}
              </div>
            ))}
          </section>
        ))
      )}
      {edit && <PlaceSheet item={edit} today={today} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** 카카오에서 찾은 곳 → 장소 칸 (이미 넣은 곳이면 그걸 연다) */
function fromKakao(k: KPlace, all: TravelPlace[]): Partial<TravelPlace> {
  const had = all.find((p) => (p.url && p.url === k.url) || (p.name === k.name && p.lat !== undefined && Math.abs(p.lat - k.lat) < 0.0005 && Math.abs((p.lon ?? 0) - k.lon) < 0.0005));
  return had ?? { status: 'want', name: k.name, kind: k.kind, region: k.region, lat: k.lat, lon: k.lon, addr: k.addr || undefined, url: k.url || undefined };
}

function PlaceSheet({ item, today, onClose }: { item: Partial<TravelPlace>; today: string; onClose: () => void }) {
  const d = useStudy();
  const [name, setName] = useState(item.name ?? '');
  const [kind, setKind] = useState<TravelPlace['kind']>(item.kind ?? 'food');
  const [region, setRegion] = useState(item.region ?? '');
  const [status, setStatus] = useState<TravelPlace['status']>(item.status ?? 'want');
  const [visited, setVisited] = useState(item.visited ?? today);
  const [rating, setRating] = useState(item.rating ?? 0);
  const [note, setNote] = useState(item.note ?? '');
  const [pos, setPos] = useState(item.lat !== undefined && item.lon !== undefined ? { lat: item.lat, lon: item.lon } : undefined);
  const [picking, setPicking] = useState(false);
  const [addr, setAddr] = useState(item.addr);
  const [url, setUrl] = useState(item.url);
  const [found, setFound] = useState<KPlace[] | null>(null);
  const [finding, setFinding] = useState(false);
  const find = () => {
    setFinding(true);
    searchPlaces(name.trim() + (region.trim() ? ` ${region.trim()}` : ''))
      .then((r) => (setFound(r), !r.length && toast('찾은 곳이 없어요')))
      .catch((e) => toast(e instanceof Error ? e.message : '찾지 못했어요'))
      .finally(() => setFinding(false));
  };
  const pick = (k: KPlace) => {
    setName(k.name);
    setKind(k.kind);
    setRegion(k.region);
    setPos({ lat: k.lat, lon: k.lon });
    setAddr(k.addr || undefined);
    setUrl(k.url || undefined);
    setFound(null);
  };
  const regions = [
    ...new Set(
      alive(d.places)
        .map((p) => p.region)
        .filter(Boolean),
    ),
  ] as string[];
  return (
    <Sheet title={item.id ? '장소 고치기' : '장소 넣기'} onClose={onClose}>
      <div className="st-form">
        <div className="km-search">
          <input className="st-input" autoFocus={!item.id} value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: ○○ 국밥)" aria-label="이름" />
          <button type="button" className="btn" disabled={name.trim().length < 2 || finding} onClick={find}>
            {finding ? '…' : '찾기'}
          </button>
        </div>
        {found && found.length > 0 && (
          <ul className="km-list">
            {found.map((k) => (
              <li key={k.id}>
                <button type="button" className="km-row" onClick={() => pick(k)}>
                  <b>{k.name}</b>
                  <small className="st-muted">{[k.cat, k.addr].filter(Boolean).join(' · ')}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {addr && (
          <small className="st-muted">
            {addr}
            {url && (
              <>
                {' '}
                ·{' '}
                <a href={url} target="_blank" rel="noreferrer">
                  카카오맵
                </a>
              </>
            )}
          </small>
        )}
        <div className="st-chips">
          {(Object.keys(KIND) as TravelPlace['kind'][]).map((k) => (
            <button key={k} type="button" className={`st-chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND[k]}
            </button>
          ))}
        </div>
        <input className="st-input" list="tr-regions" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="지역 (예: 부산 해운대)" aria-label="지역" />
        <datalist id="tr-regions">
          {regions.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="st-seg">
          <button type="button" className={status === 'want' ? 'on' : ''} aria-pressed={status === 'want'} onClick={() => setStatus('want')}>
            가 볼 곳
          </button>
          <button type="button" className={status === 'visited' ? 'on' : ''} aria-pressed={status === 'visited'} onClick={() => setStatus('visited')}>
            다녀왔어요
          </button>
        </div>
        {status === 'visited' && (
          <>
            <input className="st-input sm" type="date" max={today} value={visited} onChange={(e) => setVisited(e.target.value)} aria-label="다녀온 날" />
            <Field group label="별점">
              <StarInput value={rating} onChange={setRating} />
            </Field>
          </>
        )}
        <textarea className="st-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="메뉴 · 가격 · 팁" aria-label="메모" />
        {picking ? (
          <Suspense fallback={<div className="pm-map pick" />}>
            <PickMap value={pos} onChange={setPos} />
          </Suspense>
        ) : null}
        <div className="st-inline wrap">
          <button type="button" className="btn btn-sm" onClick={() => setPicking(!picking)}>
            <Icon name="pin" /> {pos ? '위치 고치기' : '지도에 위치 찍기'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition(
                (g) => {
                  setPos({ lat: Math.round(g.coords.latitude * 1e6) / 1e6, lon: Math.round(g.coords.longitude * 1e6) / 1e6 });
                  toast('지금 위치를 넣었어요');
                },
                () => toast('위치를 받지 못했어요'),
              )
            }
          >
            지금 여기
          </button>
          {pos && (
            <button type="button" className="st-link" onClick={() => setPos(undefined)}>
              위치 빼기
            </button>
          )}
        </div>
        <div className="st-row end">
          {item.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.name}」`) && (remove('places', item.id!), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              put('places', {
                ...item,
                id: item.id ?? newId(),
                created: item.created ?? Date.now(),
                name: name.trim(),
                kind,
                region: region.trim() || undefined,
                status,
                visited: status === 'visited' ? visited || undefined : undefined,
                rating: status === 'visited' && rating ? rating : undefined,
                note: note.trim() || undefined,
                lat: pos?.lat,
                lon: pos?.lon,
                addr,
                url,
              } as TravelPlace);
              toast('저장했어요');
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
