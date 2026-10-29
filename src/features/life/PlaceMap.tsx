// 여행 지도 (OpenStreetMap 타일 · 키 없음). 장소 핀 보기 · 눌러서 위치 찍기
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface Pin {
  id: string;
  lat: number;
  lon: number;
  name: string;
  done?: boolean;
}

const SEOUL: [number, number] = [37.654, 127.056];

function makeMap(el: HTMLElement, center: [number, number], zoom: number) {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

const pinStyle = (done?: boolean): L.CircleMarkerOptions => ({ radius: 8, weight: 2, color: '#fff', fillColor: done ? '#111' : '#c2410c', fillOpacity: 1 });

/** 장소들을 핀으로. 누르면 이름, 이름을 누르면 onOpen */
export default function PlaceMap({ pins, onOpen }: { pins: Pin[]; onOpen: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = makeMap(el.current, pins[0] ? [pins[0].lat, pins[0].lon] : SEOUL, 12);
    for (const p of pins) {
      const m = L.circleMarker([p.lat, p.lon], pinStyle(p.done)).addTo(map);
      const b = document.createElement('button');
      b.className = 'pm-name';
      b.textContent = p.name;
      b.onclick = () => onOpen(p.id);
      m.bindPopup(b, { closeButton: false });
    }
    if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 15 });
    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins.map((p) => `${p.id}${p.lat}${p.lon}${p.done}`).join()]);
  return <div ref={el} className="pm-map" />;
}

/** 지도를 눌러 한 곳 고르기 */
export function PickMap({ value, onChange }: { value?: { lat: number; lon: number }; onChange: (v: { lat: number; lon: number }) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!el.current) return;
    const map = makeMap(el.current, value ? [value.lat, value.lon] : SEOUL, value ? 16 : 12);
    const set = (ll: L.LatLng) => {
      if (marker.current) marker.current.setLatLng(ll);
      else marker.current = L.circleMarker(ll, pinStyle()).addTo(map);
    };
    if (value) set(L.latLng(value.lat, value.lon));
    map.on('click', (e: L.LeafletMouseEvent) => {
      set(e.latlng);
      cb.current({ lat: Math.round(e.latlng.lat * 1e6) / 1e6, lon: Math.round(e.latlng.lng * 1e6) / 1e6 });
    });
    return () => {
      marker.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={el} className="pm-map pick" />;
}
