// 나이스(NEIS) 교육정보 개방 포털: 학교 찾기 · 급식 · 학사일정 · 고등학교 시간표. 키는 비밀값 NEIS_KEY (Cloudflare 에 「Nice」 로 넣은 것도 받는다).
const BASE = 'https://open.neis.go.kr/hub';

export interface SchoolCodes {
  office: string;
  school: string;
  name: string;
}
export interface Meal {
  date: string;
  kind: string;
  dishes: string[];
  cal?: string;
}
export interface SchoolEvent {
  date: string;
  name: string;
  /** 휴업일·공휴일 (수업 없는 날) */
  off: boolean;
}
export interface Period {
  date: string;
  period: number;
  subject: string;
}

type Row = Record<string, unknown>;

/** 나이스 응답에서 줄 목록 꺼내기. 자료가 없으면(INFO-200) 빈 목록, 그 밖의 오류는 던진다 */
export function rowsOf(j: unknown, service: string): Row[] {
  const o = j as Record<string, unknown>;
  const top = o?.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
  if (top?.CODE) {
    if (top.CODE === 'INFO-200') return [];
    throw new Error(`나이스 응답: ${top.MESSAGE ?? top.CODE}`);
  }
  const parts = o?.[service];
  if (!Array.isArray(parts)) return [];
  for (const p of parts) if (Array.isArray((p as { row?: unknown }).row)) return (p as { row: Row[] }).row;
  return [];
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** 20261029 → 2026-10-29 */
const ymd = (v: unknown) => (/^\d{8}$/.test(s(v)) ? `${s(v).slice(0, 4)}-${s(v).slice(4, 6)}-${s(v).slice(6, 8)}` : '');

/** 메뉴 한 줄의 알레르기 번호 떼기: 「김치찌개 (5.9.13.)」, 「김치찌개5.9.」 → 「김치찌개」 */
export function cleanDish(t: string): string {
  return t
    .replace(/\s*\((?:\d{1,2}\.?\s*)+\)\s*$/, '')
    .replace(/(?<=[가-힣a-zA-Z)])(?:\d{1,2}\.)+$/, '')
    .trim();
}

export function parseMeals(rows: Row[]): Meal[] {
  return rows
    .map((r) => ({
      date: ymd(r.MLSV_YMD),
      kind: s(r.MMEAL_SC_NM) || '급식',
      dishes: s(r.DDISH_NM)
        .split(/<br\s*\/?>/i)
        .map(cleanDish)
        .filter(Boolean),
      cal: s(r.CAL_INFO) || undefined,
    }))
    .filter((m) => m.date && m.dishes.length);
}

export function parseEvents(rows: Row[]): SchoolEvent[] {
  return rows.map((r) => ({ date: ymd(r.AA_YMD), name: s(r.EVENT_NM), off: /휴업|공휴/.test(s(r.SBTR_DD_SC_NM)) })).filter((e) => e.date && e.name && e.name !== '토요휴업일');
}

export function parseTimetable(rows: Row[]): Period[] {
  return rows
    .map((r) => ({ date: ymd(r.ALL_TI_YMD), period: Number(s(r.PERIO)), subject: s(r.ITRT_CNTNT).replace(/^-/, '').trim() }))
    .filter((p) => p.date && p.period > 0 && p.subject)
    .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
}

async function call(key: string, service: string, params: Record<string, string>): Promise<Row[]> {
  const q = new URLSearchParams({ KEY: key, Type: 'json', pIndex: '1', pSize: '1000', ...params });
  // 일부 공공 서버는 브라우저 정보(User-Agent)가 없는 요청을 막아서 붙인다
  const res = await fetch(`${BASE}/${service}?${q}`, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; LifeStudyApp/1.0)' } });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(`나이스(${service}) 응답 ${res.status}${body ? `: ${body}` : ''}`);
  }
  return rowsOf(await res.json(), service);
}

export async function findSchool(key: string, name: string): Promise<SchoolCodes | null> {
  const rows = await call(key, 'schoolInfo', { SCHUL_NM: name });
  const exact = rows.find((r) => s(r.SCHUL_NM) === name) ?? rows[0];
  return exact ? { office: s(exact.ATPT_OFCDC_SC_CODE), school: s(exact.SD_SCHUL_CODE), name: s(exact.SCHUL_NM) } : null;
}

const flat = (d: string) => d.replace(/-/g, '');

export async function fetchMeals(key: string, c: SchoolCodes, from: string, to: string): Promise<Meal[]> {
  return parseMeals(await call(key, 'mealServiceDietInfo', { ATPT_OFCDC_SC_CODE: c.office, SD_SCHUL_CODE: c.school, MLSV_FROM_YMD: flat(from), MLSV_TO_YMD: flat(to) }));
}

export async function fetchEvents(key: string, c: SchoolCodes, from: string, to: string): Promise<SchoolEvent[]> {
  return parseEvents(await call(key, 'SchoolSchedule', { ATPT_OFCDC_SC_CODE: c.office, SD_SCHUL_CODE: c.school, AA_FROM_YMD: flat(from), AA_TO_YMD: flat(to) }));
}

export async function fetchTimetable(key: string, c: SchoolCodes, grade: number, cls: string, from: string, to: string): Promise<Period[]> {
  return parseTimetable(await call(key, 'hisTimetable', { ATPT_OFCDC_SC_CODE: c.office, SD_SCHUL_CODE: c.school, GRADE: String(grade), CLASS_NM: cls, TI_FROM_YMD: flat(from), TI_TO_YMD: flat(to) }));
}
