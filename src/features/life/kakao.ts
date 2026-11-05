// 카카오맵 SDK 불러오기 (키는 서버 비밀값 kakaomap) · 장소 찾기 (SDK services)
import { kakaoKey } from '../auth/api';
import type { TravelPlace } from '../study/model';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Kakao = any;
declare global {
  interface Window {
    kakao?: Kakao;
  }
}

let loading: Promise<Kakao> | null = null;
/** 한 번만 불러온다. 실패하면 다음에 다시 */
export function loadKakao(): Promise<Kakao> {
  if (loading) return loading;
  loading = (async () => {
    if (!window.kakao?.maps) {
      const { key } = await kakaoKey();
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
        s.onload = () => res();
        s.onerror = () => rej(new Error('카카오맵을 불러오지 못했어요'));
        document.head.appendChild(s);
      });
    }
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error('카카오맵이 답하지 않아요')), 10_000);
      window.kakao.maps.load(() => {
        clearTimeout(t);
        res();
      });
    });
    return window.kakao;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export interface KPlace {
  id: string;
  name: string;
  cat: string;
  kind: TravelPlace['kind'];
  addr: string;
  region: string;
  phone: string;
  url: string;
  lat: number;
  lon: number;
  dist?: number;
}
const KIND_OF: Record<string, TravelPlace['kind']> = { FD6: 'food', CE7: 'cafe', AT4: 'sight', AD5: 'stay', CT1: 'sight' };
const toPlace = (d: Record<string, string>): KPlace => ({
  id: d.id,
  name: d.place_name,
  cat: (d.category_name ?? '').split(' > ').slice(-1)[0] ?? '',
  kind: KIND_OF[d.category_group_code] ?? 'etc',
  addr: d.road_address_name || d.address_name || '',
  region: (d.address_name ?? '').split(' ').slice(0, 2).join(' '),
  phone: d.phone || '',
  url: (d.place_url || '').replace(/^http:/, 'https:'),
  lat: Number(d.y),
  lon: Number(d.x),
  dist: d.distance ? Number(d.distance) : undefined,
});

/** 이름으로 찾기 (near 가 있으면 그 근처 먼저) */
export async function searchPlaces(q: string, near?: { lat: number; lon: number }): Promise<KPlace[]> {
  const k = await loadKakao();
  return new Promise((res, rej) => {
    new k.maps.services.Places().keywordSearch(
      q,
      (data: Record<string, string>[], status: string) => (status === k.maps.services.Status.OK ? res(data.map(toPlace)) : status === k.maps.services.Status.ZERO_RESULT ? res([]) : rej(new Error('장소를 찾지 못했어요'))),
      near ? { location: new k.maps.LatLng(near.lat, near.lon), size: 15 } : { size: 15 },
    );
  });
}
/** 근처 맛집 · 카페 · 관광지 · 숙소 (반경 m) */
export async function nearby(code: 'FD6' | 'CE7' | 'AT4' | 'AD5', at: { lat: number; lon: number }, radius = 1000): Promise<KPlace[]> {
  const k = await loadKakao();
  return new Promise((res, rej) => {
    new k.maps.services.Places().categorySearch(code, (data: Record<string, string>[], status: string) => (status === k.maps.services.Status.OK ? res(data.map(toPlace)) : status === k.maps.services.Status.ZERO_RESULT ? res([]) : rej(new Error('주변을 찾지 못했어요'))), {
      location: new k.maps.LatLng(at.lat, at.lon),
      radius,
      sort: k.maps.services.SortBy.DISTANCE,
    });
  });
}

/** 카카오맵 앱 · 웹으로 길찾기 */
export const routeUrl = (name: string, lat: number, lon: number) => `https://map.kakao.com/link/to/${encodeURIComponent(name.replace(/,/g, ' '))},${lat},${lon}`;
