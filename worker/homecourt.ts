// 홈코트(HomeCourt) 앱 운동 결과 화면 사진 → 숫자 읽기 (Gemini 무료). 점 위치는 기기에서 색으로 찾는다 (src/features/life/homecourt.ts)
export interface HcRead {
  /** 'chart' 슛 점 차트 · 'zones' 구역 % 차트 · 'other' 홈코트 화면이 아님 */
  kind: 'chart' | 'zones' | 'other';
  when: string | null;
  duration: string | null;
  make: number | null;
  attempt: number | null;
  paint: number | null;
  mid: number | null;
  three: number | null;
  /** 구역 차트의 칸들 (넣은 수 · 던진 수) */
  zones: { made: number; att: number }[];
}

export const HC_PROMPT = [
  'This is a screenshot of a workout result in the HomeCourt basketball app. Read ONLY what is printed on the screen. Never guess: use null for anything not visible.',
  'Return JSON with exactly these keys:',
  '"kind": "chart" if it shows a half-court with orange dots and blue X marks (with MAKE / ATTEMPT / ACCURACY numbers), "zones" if it shows court zones with percentages like "46% (11-24)" (with IN THE PAINT / MID RANGE / 3 POINT percentages), otherwise "other";',
  '"when": the date/time text exactly as printed (e.g. "Yesterday at 6:58 PM") or null;',
  '"duration": the workout length text exactly as printed (e.g. "17m 36s") or null;',
  '"make": the MAKE number or null; "attempt": the ATTEMPT number or null;',
  '"paint", "mid", "three": the IN THE PAINT, MID RANGE and 3 POINT percentages as integers, or null;',
  '"zones": for a zones chart, every zone box that shows "(made-attempted)" as {"made": int, "att": int}; boxes showing only "-" are skipped; [] otherwise.',
].join('\n');

const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100000 ? Math.round(v) : typeof v === 'string' && /^\d+%?$/.test(v.trim()) ? Number(v.trim().replace('%', '')) : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);

/** AI 답(JSON 글) → 읽은 값. 앞뒤에 ``` 가 붙어도 된다 */
export function parseHc(text: string): HcRead {
  const m = text.match(/\{[\s\S]*\}/);
  let j: Record<string, unknown> = {};
  try {
    j = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
  } catch {
    j = {};
  }
  const kind = j.kind === 'chart' || j.kind === 'zones' ? j.kind : 'other';
  const zones = (Array.isArray(j.zones) ? j.zones : []).map((z) => ({ made: int((z as { made?: unknown })?.made), att: int((z as { att?: unknown })?.att) })).filter((z): z is { made: number; att: number } => z.made !== null && z.att !== null && z.att > 0 && z.made <= z.att);
  const pct = (v: unknown) => {
    const x = int(v);
    return x !== null && x <= 100 ? x : null;
  };
  return { kind, when: str(j.when), duration: str(j.duration), make: int(j.make), attempt: int(j.attempt), paint: pct(j.paint), mid: pct(j.mid), three: pct(j.three), zones };
}

export function hcBody(mime: string, data: string) {
  return { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: HC_PROMPT }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } };
}
