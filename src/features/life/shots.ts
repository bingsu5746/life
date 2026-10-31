// 슛 분석 (홈코트 사진에서 읽은 슛 위치로): 구역별 성공률 · 슛 분포 · eFG% · 기록 흐름
import { alive, type DateStr, type StudyData, type Workout } from '../study/model';
import { COURT, kindOf, zoneOf, ZONES, type ZoneKey } from './homecourt';

export type ShotRec = [number, number, 0 | 1];
export interface Line {
  m: number;
  a: number;
}
export const pct = (l: Line) => (l.a ? (l.m / l.a) * 100 : 0);

/** 슛 위치가 있는 농구 기록 (오래된 것부터) */
export function shotSessions(d: Pick<StudyData, 'workouts'>, from?: DateStr): Workout[] {
  return alive(d.workouts)
    .filter((w) => w.kind === '농구' && w.bb?.shots?.length && (!from || w.date >= from))
    .sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
}

/** 림까지 거리 (m) */
export function distance(s: ShotRec): number {
  const fx = (s[0] / 1000) * COURT.w - COURT.w / 2;
  const fy = (s[1] / 1000) * COURT.h;
  return Math.hypot(fx, fy - COURT.rimY);
}

export interface ShotReport {
  total: Line;
  two: Line;
  three: Line;
  kinds: Record<'paint' | 'mid' | 'three', Line>;
  zones: Record<ZoneKey, Line>;
  /** 유효 야투율: (넣은 슛 + 0.5 × 넣은 3점) ÷ 던진 슛 */
  efg: number;
  /** 던진 슛 평균 거리 · 넣은 슛 중 가장 먼 거리 (m) */
  avgDist: number;
  longest: number;
  /** 거리 구간별 (1m 단위, 0~1, 1~2, …) */
  byDist: Line[];
}

export function report(shots: ShotRec[]): ShotReport {
  const z = Object.fromEntries(ZONES.map((x) => [x.key, { m: 0, a: 0 }])) as Record<ZoneKey, Line>;
  const kinds = { paint: { m: 0, a: 0 }, mid: { m: 0, a: 0 }, three: { m: 0, a: 0 } };
  const byDist: Line[] = Array.from({ length: 9 }, () => ({ m: 0, a: 0 }));
  let dist = 0,
    longest = 0;
  for (const s of shots) {
    const k = zoneOf(s[0] / 1000, s[1] / 1000);
    const made = s[2] === 1 ? 1 : 0;
    z[k].a++;
    z[k].m += made;
    const kind = kindOf(k);
    kinds[kind].a++;
    kinds[kind].m += made;
    const dd = distance(s);
    dist += dd;
    if (made) longest = Math.max(longest, dd);
    const b = byDist[Math.min(byDist.length - 1, Math.floor(dd))];
    b.a++;
    b.m += made;
  }
  const total = { m: kinds.paint.m + kinds.mid.m + kinds.three.m, a: shots.length };
  const two = { m: kinds.paint.m + kinds.mid.m, a: kinds.paint.a + kinds.mid.a };
  return { total, two, three: kinds.three, kinds, zones: z, efg: total.a ? ((total.m + 0.5 * kinds.three.m) / total.a) * 100 : 0, avgDist: shots.length ? dist / shots.length : 0, longest, byDist };
}

/** 구역 색: 내 전체 성공률보다 얼마나 높고 낮은지 (-1 ~ 1). 5개 안 던진 곳은 null */
export function heat(l: Line, overall: number): number | null {
  if (l.a < 5) return null;
  return Math.max(-1, Math.min(1, (pct(l) - overall) / 20));
}

/** 가장 잘 · 못 넣는 구역 (5개 이상 던진 곳만) */
export function bestWorst(r: ShotReport): { best?: ZoneKey; worst?: ZoneKey } {
  const list = ZONES.filter((x) => r.zones[x.key].a >= 5).sort((a, b) => pct(r.zones[b.key]) - pct(r.zones[a.key]));
  if (list.length < 2) return {};
  return { best: list[0].key, worst: list[list.length - 1].key };
}

/** 「17m 36s」「1h 2m」 → 초 */
export function durationSecs(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const h = Number(text.match(/(\d+)\s*h/)?.[1] ?? 0);
  const m = Number(text.match(/(\d+)\s*m(?!s)/)?.[1] ?? 0);
  const s = Number(text.match(/(\d+)\s*s/)?.[1] ?? 0);
  const t = h * 3600 + m * 60 + s;
  return t > 0 ? t : undefined;
}

/** 「Yesterday at 6:58 PM」「Today …」「Oct 29 …」 → 날짜 (모르면 today) */
export function whenDate(text: string | null | undefined, today: DateStr): DateStr {
  if (!text) return today;
  const back = (n: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  if (/yesterday|어제/i.test(text)) return back(1);
  if (/today|오늘/i.test(text)) return today;
  const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const m = text.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (m) {
    const y = Number(m[3] ?? today.slice(0, 4));
    const out = `${y}-${String(mon.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    // 연도가 없는데 오늘보다 뒤면 작년
    return !m[3] && out > today ? `${y - 1}${out.slice(4)}` : out;
  }
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = days.findIndex((x) => text.toLowerCase().includes(x));
  if (wd >= 0) {
    const now = new Date(`${today}T12:00:00`).getDay();
    return back((now - wd + 7) % 7 || 7);
  }
  return today;
}
