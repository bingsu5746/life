// 여행 지도 (카카오맵): 장소 핀 · 이름으로 찾기 · 근처 맛집/카페/관광지/숙소 · 길찾기. 못 불러오면 OpenStreetMap 지도로
import { useEffect, useRef, useState } from 'react';
import { toast } from '../study/ui';
import { loadKakao, nearby, routeUrl, searchPlaces, type Kakao, type KPlace } from './kakao';
import PlaceMap, { type Pin } from './PlaceMap';

const HOME = { lat: 37.654, lon: 127.056 };
const NEAR: ['FD6' | 'CE7' | 'AT4' | 'AD5', string][] = [
  ['FD6', '맛집'],
  ['CE7', '카페'],
  ['AT4', '관광지'],
  ['AD5', '숙소'],
];
const dist = (m?: number) => (m === undefined ? '' : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

export default function KakaoMap({ pins, onOpen, onAdd }: { pins: Pin[]; onOpen: (id: string) => void; onAdd: (p: KPlace) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Kakao>(null);
  const pinOv = useRef<Kakao[]>([]);
  const foundOv = useRef<Kakao[]>([]);
  const [ready, setReady] = useState(false);
  const [fail, setFail] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<KPlace[] | null>(null);
  const [sel, setSel] = useState<KPlace | null>(null);
  const [busy, setBusy] = useState(false);
  const cb = useRef({ onOpen, onAdd });
  cb.current = { onOpen, onAdd };

  useEffect(() => {
    let live = true;
    loadKakao()
      .then((k) => {
        if (!live || !el.current) return;
        const c = pins[0] ?? HOME;
        map.current = new k.maps.Map(el.current, { center: new k.maps.LatLng(c.lat, c.lon), level: 6 });
        map.current.addControl(new k.maps.ZoomControl(), k.maps.ControlPosition.RIGHT);
        setReady(true);
      })
      .catch(() => live && setFail(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlay = (k: Kakao, lat: number, lon: number, text: string, cls: string, click: () => void) => {
    const b = document.createElement('button');
    b.className = `km-pin ${cls}`;
    b.textContent = text;
    b.onclick = click;
    const o = new k.maps.CustomOverlay({ position: new k.maps.LatLng(lat, lon), content: b, yAnchor: 1.2, clickable: true });
    o.setMap(map.current);
    return o;
  };
  const fit = (k: Kakao, pts: { lat: number; lon: number }[]) => {
    if (!pts.length) return;
    if (pts.length === 1) return map.current.setCenter(new k.maps.LatLng(pts[0].lat, pts[0].lon));
    const b = new k.maps.LatLngBounds();
    for (const p of pts) b.extend(new k.maps.LatLng(p.lat, p.lon));
    map.current.setBounds(b, 40, 40, 40, 40);
  };

  // 내 장소 핀
  useEffect(() => {
    if (!ready) return;
    const k = window.kakao;
    for (const o of pinOv.current) o.setMap(null);
    pinOv.current = pins.map((p) => overlay(k, p.lat, p.lon, p.name, p.done ? 'done' : '', () => cb.current.onOpen(p.id)));
    if (!found) fit(k, pins);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pins.map((p) => `${p.id}${p.lat}${p.lon}${p.done}${p.name}`).join()]);

  // 찾은 곳 핀
  useEffect(() => {
    if (!ready) return;
    const k = window.kakao;
    for (const o of foundOv.current) o.setMap(null);
    foundOv.current = (found ?? []).map((p) => overlay(k, p.lat, p.lon, p.name, `found ${sel?.id === p.id ? 'on' : ''}`, () => setSel(p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, found, sel]);

  const center = () => {
    const c = map.current.getCenter();
    return { lat: c.getLat(), lon: c.getLng() };
  };
  const show = (list: KPlace[]) => {
    setFound(list);
    setSel(null);
    if (!list.length) toast('찾은 곳이 없어요');
    else fit(window.kakao, list);
  };
  const run = (job: () => Promise<KPlace[]>) => {
    setBusy(true);
    job()
      .then(show)
      .catch((e) => toast(e instanceof Error ? e.message : '찾지 못했어요'))
      .finally(() => setBusy(false));
  };
  const here = () =>
    navigator.geolocation?.getCurrentPosition(
      (g) => map.current?.setCenter(new window.kakao.maps.LatLng(g.coords.latitude, g.coords.longitude)),
      () => toast('위치를 받지 못했어요'),
    );

  if (fail) return <PlaceMap pins={pins} onOpen={onOpen} />;
  return (
    <div className="km">
      <form
        className="km-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length > 1 && ready) run(() => searchPlaces(q.trim(), center()));
        }}
      >
        <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="장소 · 주소 찾기" aria-label="장소 찾기" enterKeyHint="search" />
        <button className="btn" disabled={!ready || busy || q.trim().length < 2}>
          {busy ? '…' : '찾기'}
        </button>
      </form>
      <div className="st-chips km-near">
        {NEAR.map(([code, label]) => (
          <button key={code} type="button" className="st-chip" disabled={!ready || busy} onClick={() => run(() => nearby(code, center()))}>
            근처 {label}
          </button>
        ))}
        <button type="button" className="st-chip" disabled={!ready} onClick={here}>
          내 위치
        </button>
        {found && (
          <button type="button" className="st-chip" onClick={() => (setFound(null), setSel(null))}>
            지우기
          </button>
        )}
      </div>
      <div ref={el} className="pm-map km-map" />
      {sel && <PlaceCard p={sel} onAdd={() => cb.current.onAdd(sel)} />}
      {found && found.length > 0 && (
        <ul className="km-list">
          {found.map((p) => (
            <li key={p.id}>
              <button
                className={`km-row ${sel?.id === p.id ? 'on' : ''}`}
                onClick={() => {
                  setSel(p);
                  map.current?.panTo(new window.kakao.maps.LatLng(p.lat, p.lon));
                }}
              >
                <b>{p.name}</b>
                <small className="st-muted">{[p.cat, dist(p.dist), p.addr].filter(Boolean).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaceCard({ p, onAdd }: { p: KPlace; onAdd: () => void }) {
  return (
    <div className="km-card">
      <div className="km-card-main">
        <b>{p.name}</b>
        <small className="st-muted">{[p.cat, p.addr, p.phone].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="st-inline wrap">
        <button className="btn btn-sm btn-primary" onClick={onAdd}>
          가 볼 곳에 넣기
        </button>
        {p.url && (
          <a className="btn btn-sm" href={p.url} target="_blank" rel="noreferrer">
            자세히
          </a>
        )}
        <a className="btn btn-sm" href={routeUrl(p.name, p.lat, p.lon)} target="_blank" rel="noreferrer">
          길찾기
        </a>
      </div>
    </div>
  );
}
