// 날씨: Open-Meteo (키 없음 · 비상업 무료). 기본 위치는 서울 노원구, 설정에서 바꿀 수 있다.
export interface Weather {
  temp: number;
  code: number;
  max: number;
  min: number;
  rain: number | null;
  at: number;
}

export const DEFAULT_PLACE = { lat: 37.654, lon: 127.056, name: '노원구' };

/** WMO 날씨 코드 → 한국어 · 그림 */
export function weatherText(code: number): { text: string; icon: string } {
  if (code === 0) return { text: '맑음', icon: '☀️' };
  if (code <= 2) return { text: '구름 조금', icon: '🌤️' };
  if (code === 3) return { text: '흐림', icon: '☁️' };
  if (code === 45 || code === 48) return { text: '안개', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { text: '이슬비', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { text: '비', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { text: '눈', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { text: '소나기', icon: '🌦️' };
  if (code === 85 || code === 86) return { text: '눈', icon: '🌨️' };
  if (code >= 95) return { text: '뇌우', icon: '⛈️' };
  return { text: '', icon: '🌡️' };
}

/** 응답 → 필요한 것만 (모양이 다르면 null) */
export function parseWeather(j: unknown, now = Date.now()): Weather | null {
  const o = j as { current?: { temperature_2m?: unknown; weather_code?: unknown }; daily?: { temperature_2m_max?: unknown[]; temperature_2m_min?: unknown[]; precipitation_probability_max?: unknown[] } };
  const t = o?.current?.temperature_2m;
  const c = o?.current?.weather_code;
  const max = o?.daily?.temperature_2m_max?.[0];
  const min = o?.daily?.temperature_2m_min?.[0];
  const rain = o?.daily?.precipitation_probability_max?.[0];
  if (typeof t !== 'number' || typeof c !== 'number' || typeof max !== 'number' || typeof min !== 'number') return null;
  return { temp: Math.round(t), code: c, max: Math.round(max), min: Math.round(min), rain: typeof rain === 'number' ? rain : null, at: now };
}

const KEY = 'my-study.weather';

export async function getWeather(lat: number, lon: number): Promise<Weather | null> {
  const ck = `${KEY}.${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    const c = JSON.parse(localStorage.getItem(ck) ?? 'null') as Weather | null;
    if (c && Date.now() - c.at < 30 * 60_000) return c;
  } catch {
    /* 무시 */
  }
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: 'temperature_2m,weather_code', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'Asia/Seoul', forecast_days: '1' });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) return null;
  const w = parseWeather(await res.json());
  if (w)
    try {
      localStorage.setItem(ck, JSON.stringify(w));
    } catch {
      /* 무시 */
    }
  return w;
}

/** 앞으로 며칠 날마다 비 · 눈 올 확률 (%) 과 날씨 코드. 3시간 동안 이 기기에 기억 */
export async function getForecast(lat: number, lon: number, days = 8): Promise<Record<string, { rain: number; code: number }> | null> {
  const ck = `${KEY}.fc.${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    const c = JSON.parse(localStorage.getItem(ck) ?? 'null') as { at: number; v: Record<string, { rain: number; code: number }> } | null;
    if (c && Date.now() - c.at < 3 * 3_600_000) return c.v;
  } catch {
    /* 무시 */
  }
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), daily: 'precipitation_probability_max,weather_code', timezone: 'Asia/Seoul', forecast_days: String(days) });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) return null;
  const v = parseForecast(await res.json());
  try {
    localStorage.setItem(ck, JSON.stringify({ at: Date.now(), v }));
  } catch {
    /* 무시 */
  }
  return v;
}
export function parseForecast(j: unknown): Record<string, { rain: number; code: number }> {
  const o = j as { daily?: { time?: unknown[]; precipitation_probability_max?: unknown[]; weather_code?: unknown[] } };
  const out: Record<string, { rain: number; code: number }> = {};
  (o?.daily?.time ?? []).forEach((t, i) => {
    const r = o.daily?.precipitation_probability_max?.[i];
    const c = o.daily?.weather_code?.[i];
    if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && typeof r === 'number') out[t] = { rain: r, code: typeof c === 'number' ? c : -1 };
  });
  return out;
}
