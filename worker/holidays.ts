// 공휴일 · 기념일: 한국천문연구원 특일 정보 (공공데이터포털 apis.data.go.kr, SpcdeInfoService)
// getRestDeInfo(공휴일) · getAnniversaryInfo(기념일). 응답은 XML 이라 item 의 locdate · dateName · isHoliday 만 읽는다
const BASE = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

export interface SpecialDay {
  date: string; // YYYY-MM-DD
  name: string;
  /** 쉬는 날(공휴일) 인지 */
  holiday: boolean;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? '';
const unescape = (t: string) =>
  t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** XML 응답 → 날짜 목록. 오류 응답이면 그 메시지로 던진다 */
export function parseSpecialDays(xml: string): SpecialDay[] {
  const code = tag(xml, 'resultCode') || tag(xml, 'returnReasonCode');
  if (code && !/^0+$/.test(code)) throw new Error(`특일 정보 ${code} ${tag(xml, 'resultMsg') || tag(xml, 'returnAuthMsg')}`.trim());
  const out: SpecialDay[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const d = tag(m[1], 'locdate');
    const name = unescape(tag(m[1], 'dateName'));
    if (!/^\d{8}$/.test(d) || !name) continue;
    out.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, name, holiday: tag(m[1], 'isHoliday') === 'Y' });
  }
  return out;
}

/** 한 해의 공휴일 + 기념일. key 는 포털의 인증키 (인코딩된 키를 넣어도 되게 한 번 풀어서 쓴다) */
export async function fetchSpecialDays(key: string, year: number): Promise<SpecialDay[]> {
  const k = key.includes('%') ? decodeURIComponent(key) : key;
  const get = async (op: string) => {
    const q = new URLSearchParams({ serviceKey: k, solYear: String(year), numOfRows: '200', pageNo: '1' });
    const res = await fetch(`${BASE}/${op}?${q}`, { headers: { 'user-agent': 'Mozilla/5.0 (Life app)' } });
    const text = await res.text();
    if (!res.ok) throw new Error(`특일 정보 ${res.status} ${text.slice(0, 120)}`);
    return parseSpecialDays(text);
  };
  const [rest, anniv] = await Promise.all([get('getRestDeInfo'), get('getAnniversaryInfo')]);
  // 같은 날 같은 이름은 하나로 (공휴일 쪽을 남김)
  const seen = new Set(rest.map((x) => `${x.date}|${x.name}`));
  return [...rest, ...anniv.filter((x) => !seen.has(`${x.date}|${x.name}`))].sort((a, b) => a.date.localeCompare(b.date));
}
