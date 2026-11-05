// AI(Gemini) 로 읽기: 문제 사진 → 오답 노트 칸 · 받아쓴 일기 → 칸 나누기. 답은 JSON 으로 받는다
const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const obj = (text: string): Record<string, unknown> => {
  const m = text.match(/\{[\s\S]*\}/);
  try {
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const json = { responseMimeType: 'application/json', temperature: 0 };

export interface NoteRead {
  subject: string | null;
  number: string | null;
  question: string | null;
}
export function noteBody(mime: string, data: string, subjects: string[]) {
  const prompt = [
    'This is a photo of a problem from a Korean high-school workbook or exam. Read ONLY what is printed. Never guess.',
    'Return JSON with exactly these keys:',
    `"subject": which of these subjects the problem belongs to: ${JSON.stringify(subjects)} (exactly one of them), or null if unsure;`,
    '"number": the problem number as printed (e.g. "12", "B-3"), or null;',
    '"question": the full problem text as printed, in the original language, including choices (①~⑤). Write math in LaTeX between $...$. null if unreadable.',
  ].join('\n');
  return { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: prompt }] }], generationConfig: json };
}
export function parseNote(text: string, subjects: string[]): NoteRead {
  const j = obj(text);
  const subject = str(j.subject, 20);
  // 모델이 줄바꿈을 글자 그대로(\\n) 쓰는 때가 있어 진짜 줄바꿈으로
  const q = str(j.question, 4000)?.replace(/\\n/g, '\n') ?? null;
  return { subject: subject && subjects.includes(subject) ? subject : null, number: str(j.number, 20), question: q };
}

export const DIARY_KEYS = ['good', 'hard', 'thanks', 'learned', 'fix', 'worry', 'tomorrow', 'dream'] as const;
export type DiaryRead = Partial<Record<(typeof DIARY_KEYS)[number], string>>;
export function diaryBody(text: string) {
  const prompt = [
    '아래는 한국 고등학생이 쓰거나 말로 한 일기예요 (받아쓰기라서 띄어쓰기 · 맞춤법 · 비슷한 소리 오타가 있을 수 있어요).',
    '1) 받아쓰기 오타는 문맥에 맞게 바로잡되, 뜻은 바꾸지 마세요.',
    '2) 글에 실제로 있는 내용 중 아래 칸에 맞는 것만 골라 넣으세요 (일과 자체는 본문에 남으니 넣지 마세요). 없는 내용은 절대 지어내지 말고, 해당하는 말이 없으면 그 칸은 null.',
    '3) 한 문장이 여러 칸에 맞으면 가장 알맞은 한 칸에만 넣으세요. 칸마다 여러 줄이면 줄바꿈으로 나누세요.',
    '4) 말투는 원래 글 그대로 (반말이면 반말). 요약하지 말고 다듬기만 하세요.',
    'JSON 칸 (모두 문자열 또는 null):',
    '"good": 좋았던 일 · 기뻤던 순간',
    '"hard": 힘들었던 일 · 속상했던 일',
    '"thanks": 고마운 사람 · 일',
    '"learned": 새로 알게 된 것 · 배운 것',
    '"fix": 다음엔 고칠 점 · 반성',
    '"worry": 고민 · 잡생각 · 걱정',
    '"tomorrow": 내일 할 것 · 계획',
    '"dream": 잠잘 때 꾼 꿈 이야기 (장래희망 말고)',
    '',
    text,
  ].join('\n');
  return { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: json };
}
export function parseDiary(text: string): DiaryRead {
  const j = obj(text);
  const out: DiaryRead = {};
  for (const k of DIARY_KEYS) {
    const v = str(j[k], 1000);
    if (v) out[k] = v;
  }
  return out;
}

export interface ReceiptRead {
  amount: number | null;
  date: string | null;
  store: string | null;
  items: string[];
}
export function receiptBody(mime: string, data: string) {
  const prompt = [
    'This is a photo of a Korean receipt (영수증) or a payment screen. Read ONLY what is printed. Never guess.',
    'Return JSON with exactly these keys:',
    '"amount": the total paid amount in won as an integer (합계 / 결제금액 / 받을금액), or null;',
    '"date": the purchase date as YYYY-MM-DD, or null;',
    '"store": the store or merchant name as printed, or null;',
    '"items": up to 5 item names as printed (short), [] if none.',
  ].join('\n');
  return { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: prompt }] }], generationConfig: json };
}
export function parseReceipt(text: string): ReceiptRead {
  const j = obj(text);
  const amt = typeof j.amount === 'number' ? j.amount : typeof j.amount === 'string' ? Number(j.amount.replace(/[^\d]/g, '')) : NaN;
  const date = typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null;
  return {
    amount: Number.isFinite(amt) && amt > 0 && amt < 100_000_000 ? Math.round(amt) : null,
    date,
    store: str(j.store, 40),
    items: (Array.isArray(j.items) ? j.items : [])
      .map((x) => str(x, 40))
      .filter((x): x is string => !!x)
      .slice(0, 5),
  };
}

/** 목차 사진 → 단원 · 쪽 */
export interface TocRead {
  units: { name: string; from: number | null; to: number | null }[];
}
export function tocBody(images: { mime: string; data: string }[]) {
  const prompt = [
    'These are photos of the table of contents (목차) of a Korean workbook or textbook. Read ONLY what is printed, exactly as written (Korean text must be copied character by character). Never guess.',
    'Return JSON: {"units": [{"name": unit title as printed including its number like "1. 집합", "from": start page number or null, "to": end page number or null if not printed}]} in printed order.',
    'Page numbers are usually printed at the FAR RIGHT of the same row, often after dot leaders (……) or a wide gap, sometimes in a separate right column or on the left edge. Pair each title with the number on the SAME row; read multi-column pages column by column.',
    'Page numbers may have leading zeros (008 = 8) or a "p." / "쪽" mark. Item numbers inside titles (like "01", "현대시 01~11") are NOT pages.',
    'Include every unit row in order. If a row truly has no page number printed, set "from": null (do not invent). Big chapter headings without pages may be included with null.',
  ].join('\n');
  return { contents: [{ role: 'user', parts: [...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })), { text: prompt }] }], generationConfig: json };
}
export function parseTocRead(text: string): TocRead {
  const j = obj(text);
  const units = (Array.isArray(j.units) ? j.units : [])
    .map((u) => u as { name?: unknown; from?: unknown; to?: unknown })
    .map((u) => ({ name: str(u.name, 80) ?? '', from: u.from === null || u.from === undefined || u.from === '' ? null : Number(u.from), to: u.to === null || u.to === undefined || u.to === '' ? null : Number(u.to) }))
    .filter((u) => u.name && (u.from === null || (Number.isInteger(u.from) && u.from > 0 && u.from < 5000)) && (u.to === null || (u.from !== null && Number.isInteger(u.to) && u.to >= u.from && u.to < 5000)))
    .slice(0, 200);
  return { units };
}

/** AI 코치: 기록 글 → 잘한 점 · 고칠 점 · 먼저 할 것 · 요일별 계획 */
export interface CoachRead {
  good: string | null;
  fix: string | null;
  focus: string[];
  plan: { day: string; items: { subject: string; minutes: number; what: string }[] }[];
  tip: string | null;
}
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
export function coachBody(record: string) {
  const prompt = [
    '너는 한국 고등학생의 공부 코치야. 아래 기록만 보고 다음 주(월~일) 공부 계획을 짜 줘. 기록에 없는 사실은 지어내지 마.',
    '- 요일마다 할 과목 · 분 · 할 일 (실제로 공부한 양에서 크게 벗어나지 않게, 평일은 학교가 있으니 적게)',
    '- 시험이 가까운 과목과 오답이 많은 과목을 먼저',
    '- 말투는 친근한 반말, 짧게',
    'JSON: {"good": 이번 주 잘한 점 한 문장, "fix": 고칠 점 한 문장, "focus": [다음 주 가장 먼저 할 것 1~3개 (짧게)], "plan": [{"day": "월"~"일", "items": [{"subject": 과목, "minutes": 분(정수), "what": 할 일 (짧게)}]}] (7일 모두), "tip": 한 줄 조언}',
    '',
    record,
  ].join('\n');
  return { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } };
}
export function parseCoach(text: string): CoachRead {
  const j = obj(text);
  const plan = (Array.isArray(j.plan) ? j.plan : [])
    .map((p) => p as { day?: unknown; items?: unknown })
    .filter((p) => typeof p.day === 'string' && DAYS.includes(p.day.trim().slice(0, 1)))
    .map((p) => ({
      day: (p.day as string).trim().slice(0, 1),
      items: (Array.isArray(p.items) ? p.items : [])
        .map((x) => x as { subject?: unknown; minutes?: unknown; what?: unknown })
        .map((x) => ({ subject: str(x.subject, 20) ?? '', minutes: Math.max(0, Math.min(600, Math.round(Number(x.minutes) || 0))), what: str(x.what, 80) ?? '' }))
        .filter((x) => x.subject || x.what)
        .slice(0, 6),
    }))
    .slice(0, 7);
  return {
    good: str(j.good, 200),
    fix: str(j.fix, 200),
    focus: (Array.isArray(j.focus) ? j.focus : [])
      .map((x) => str(x, 80))
      .filter((x): x is string => !!x)
      .slice(0, 3),
    plan,
    tip: str(j.tip, 200),
  };
}
