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
/** 일기 제목 추천: 지금까지 쓴 제목들의 느낌(길이 · 말투 · 기호)을 따라 3개 */
export function titleBody(text: string, past: string[]) {
  const prompt = [
    '아래 [오늘 일기]에 어울리는 제목을 3개 지어 줘.',
    '- [지금까지 쓴 제목]의 느낌을 따라 해: 길이, 말투(반말 · 명사형 · 문장형), 이모지나 기호를 쓰는지, 유머 정도.',
    '- 지금까지 쓴 제목이 없으면 짧고 담백하게 (15자 안).',
    '- 일기에 없는 일은 지어내지 마. 세 개는 서로 느낌이 조금씩 다르게.',
    'JSON: {"titles": [문자열 3개]}',
    '',
    '[지금까지 쓴 제목]',
    ...(past.length ? past.map((t) => `- ${t}`) : ['- (없음)']),
    '',
    '[오늘 일기]',
    text,
  ].join('\n');
  return { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } };
}
export function parseTitles(text: string): { titles: string[] } {
  const j = obj(text);
  const titles = (Array.isArray(j.titles) ? j.titles : [])
    .map((x) => str(x, 40))
    .filter((x): x is string => !!x)
    .slice(0, 3);
  return { titles };
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

/** 감상문 도우미: 책 · 영화 제목(과 내가 남긴 말)으로 생각을 끌어내는 질문 4개 (줄거리를 지어내지 않게) */
export function reviewQBody(kind: 'book' | 'movie', title: string, by: string, mine: string) {
  const prompt = [
    `한국 고등학생이 ${kind === 'book' ? '책' : '영화'} 「${title}」${by ? ` (${by})` : ''} 감상문을 쓰려고 해. 생각을 끌어내는 질문 4개를 만들어 줘.`,
    '- 줄거리 · 인물 · 장면을 네가 아는 것처럼 지어내지 마. 확실하지 않으면 「가장 기억에 남는 장면은?」처럼 작품 내용 없이도 답할 수 있게.',
    '- 순서: 첫인상 → 기억에 남는 부분 → 나와 연결 · 생각이 바뀐 점 → 누구에게 추천 / 아쉬운 점',
    '- 친근한 반말, 한 문장씩 짧게',
    mine ? `- 학생이 이미 남긴 말: ${mine}` : '',
    'JSON: {"questions": [문자열 4개]}',
  ]
    .filter(Boolean)
    .join('\n');
  return { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6 } };
}
export function parseReviewQ(text: string): { questions: string[] } {
  const j = obj(text);
  return {
    questions: (Array.isArray(j.questions) ? j.questions : [])
      .map((x) => str(x, 120))
      .filter((x): x is string => !!x)
      .slice(0, 5),
  };
}

/** 시험 범위 공지 사진 → 과목별 범위 줄 (적힌 것만) */
export interface ScopeRead {
  scopes: { subject: string; date: string | null; lines: string[] }[];
}
export function scopeBody(images: { mime: string; data: string }[], subjects: string[]) {
  const prompt = [
    'These are photos of a Korean high school exam scope notice (시험 범위 공지 / 출제 범위표). Read ONLY what is printed. Copy Korean text exactly. Never guess or add.',
    `The student's subjects are: ${subjects.join(', ') || '(unknown)'}. When a printed subject clearly matches one of these (e.g. 수학Ⅰ ≈ 수학), use the student's name; otherwise use the printed name.`,
    'Return JSON: {"scopes": [{"subject": subject name, "date": exam date as YYYY-MM-DD if printed else null, "lines": [each scope item as printed, one per line, e.g. "교과서 12~80쪽", "1단원 ~ 3단원", "학습지 1~5"]}]}',
    'Split a subject\'s scope into separate lines at commas, slashes or line breaks. Keep page numbers and unit names exactly. If the year is not printed, assume the nearest upcoming year.',
  ].join('\n');
  return { contents: [{ role: 'user', parts: [...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })), { text: prompt }] }], generationConfig: json };
}
export function parseScopeRead(text: string): ScopeRead {
  const j = obj(text);
  const scopes = (Array.isArray(j.scopes) ? j.scopes : [])
    .map((x) => x as { subject?: unknown; date?: unknown; lines?: unknown })
    .map((x) => ({
      subject: str(x.subject, 30) ?? '',
      date: typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null,
      lines: (Array.isArray(x.lines) ? x.lines : [])
        .map((l) => str(l, 120))
        .filter((l): l is string => !!l)
        .slice(0, 30),
    }))
    .filter((x) => x.subject && x.lines.length)
    .slice(0, 20);
  return { scopes };
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
    '너는 한국 고등학생의 공부 코치야. 아래 기록만 보고 [계획할 주](월~일) 공부 계획을 짜 줘. 기록에 없는 사실은 지어내지 마.',
    '- [그 주 일정 · 시험]에 일정 · 과외 · 시험이 있는 날은 공부 시간을 줄여 (적힌 % 만큼). 시험 날은 그 시험 과목을 짧게 복습만',
    '- 요일마다 할 과목 · 분 · 할 일 (실제로 공부한 양에서 크게 벗어나지 않게, 평일은 학교가 있으니 적게)',
    '- 시험이 가까운 과목과 오답이 많은 과목을 먼저',
    '- 숙제 · 시험 과목처럼 기록에 없는 정보는 추측하지 마 (과목을 모르면 subject 를 "숙제" 처럼 적기)',
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

/** 성적표 사진 → 성적 (내신 · 모의고사). 적힌 값만 */
export interface GradeCardRead {
  kind: 'school' | 'mock' | null;
  name: string | null;
  date: string | null;
  scores: { subject: string; raw: number | null; full: number | null; grade: number | null; average: number | null; standard: number | null; percentile: number | null }[];
}
export function gradeCardBody(images: { mime: string; data: string }[]) {
  const prompt = [
    'These are photos of a Korean high school score report: a school exam result (내신 · 중간/기말고사 성적표, 성적통지표) or a mock exam / CSAT score report (모의고사 · 학력평가 · 수능 성적표). Read ONLY what is printed. Never guess, never compute values that are not printed.',
    'Return JSON with exactly these keys:',
    '"kind": "school" for 내신 school exams, "mock" for 모의고사 · 학력평가 · 모의평가 · 수능, or null if unsure;',
    '"name": the exam name as printed (e.g. "2학년 1학기 기말고사", "2026년 6월 모의평가"), or null;',
    '"date": the exam date as YYYY-MM-DD if printed, else null;',
    '"scores": one item per subject row in printed order: {"subject": subject name exactly as printed (for 탐구 use the elective subject name like "생활과 윤리"), "raw": 원점수, "full": 만점 if printed, "grade": 등급 (1-9), "average": 과목 평균 (school only), "standard": 표준점수 (mock only), "percentile": 백분위 (mock only)}. Use numbers, or null for anything not printed.',
    'Do not include total/sum rows (합계, 총점) or rank rows (석차) as subjects.',
  ].join('\n');
  return { contents: [{ role: 'user', parts: [...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })), { text: prompt }] }], generationConfig: json };
}
export function parseGradeCard(text: string): GradeCardRead {
  const j = obj(text);
  const n = (v: unknown, lo: number, hi: number) => {
    const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[^\d.]/g, '')) : NaN;
    return Number.isFinite(x) && x >= lo && x <= hi ? x : null;
  };
  const scores = (Array.isArray(j.scores) ? j.scores : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      subject: str(x.subject, 20) ?? '',
      raw: n(x.raw, 0, 1000),
      full: n(x.full, 1, 1000),
      grade: (() => {
        const g = n(x.grade, 1, 9);
        return g !== null && Number.isInteger(g) ? g : null;
      })(),
      average: n(x.average, 0, 1000),
      standard: n(x.standard, 0, 300),
      percentile: n(x.percentile, 0, 100),
    }))
    .filter((x) => x.subject && !/^(합계|총점|평균|석차)$/.test(x.subject.replace(/\s/g, '')) && [x.raw, x.grade, x.average, x.standard, x.percentile].some((v) => v !== null))
    .slice(0, 20);
  return {
    kind: j.kind === 'school' || j.kind === 'mock' ? j.kind : null,
    name: str(j.name, 40),
    date: typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null,
    scores,
  };
}

/** 교과서 글 → 백지 복습 카드 (단원 · 소단원 이름 + 꼭 외울 핵심 줄). 글에 있는 것만 */
export interface BlankRead {
  sheets: { title: string; points: string[] }[];
}
export function blankBody(text: string, subject: string, pages: string) {
  const prompt = [
    `아래는 한국 고등학교 ${subject} 교과서 ${pages}쪽의 글이에요 (PDF 에서 뽑아 줄바꿈 · 띄어쓰기가 흐트러졌을 수 있어요).`,
    '시험 대비 백지 복습 카드를 만들어 주세요.',
    '- 소단원(또는 큰 제목)마다 카드 하나. title 은 글에 적힌 제목 그대로.',
    '- points: 그 부분에서 꼭 외울 핵심을 한 줄씩 (개념 정의, 원리, 공식, 인물 · 사건 · 연도, 특징 비교). 3~10줄, 한 줄 80자 안.',
    '- 글에 없는 내용은 절대 더하지 마세요. 용어 · 숫자 · 이름은 글에 적힌 그대로.',
    '- 학습 목표, 탐구 활동 안내, 쪽 번호, 그림 설명 같은 것은 빼세요.',
    'JSON: {"sheets": [{"title": 문자열, "points": [문자열]}]}',
    '',
    text,
  ].join('\n');
  return { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } };
}
export function parseBlank(text: string): BlankRead {
  const j = obj(text);
  const sheets = (Array.isArray(j.sheets) ? j.sheets : [])
    .map((x) => x as { title?: unknown; points?: unknown })
    .map((x) => ({
      title: str(x.title, 60) ?? '',
      points: (Array.isArray(x.points) ? x.points : [])
        .map((p) => str(p, 120))
        .filter((p): p is string => !!p)
        .slice(0, 15),
    }))
    .filter((x) => x.title && x.points.length)
    .slice(0, 12);
  return { sheets };
}

/** 고민과 비슷한 지난 일기에서 그때의 상황 · 한 일 · 결과를 뽑는다. 주어진 일기 밖의 일은 지어내지 않게 */
export function diaryAskBody(worry: string, entries: { date: string; text: string }[]) {
  const prompt = [
    '나는 고등학생이고, 아래 [지금 고민]과 비슷했던 [지난 일기]들이 있어.',
    '지난 일기에서 그때 나는 어떤 상황이었고, 무엇을 했고(대처), 어떻게 됐는지 찾아 줘.',
    '- 반드시 [지난 일기]에 실제로 쓰여 있는 내용만. 일기에 없는 대처나 결과는 지어내지 말고, 모르면 빈 문자열.',
    '- date 는 [지난 일기]의 날짜를 그대로. 관련 없는 일기는 빼.',
    '- quote 는 그 일기에서 그대로 옮긴 짧은 한 문장 (40자 안).',
    '- summary 는 지난 내가 했던 방법을 묶어 지금 해 볼 만한 것 2~3가지 (지난 일기에 있는 방법만, 반말, 120자 안).',
    'JSON: {"summary": 문자열, "items": [{"date": "YYYY-MM-DD", "situation": 문자열, "did": 문자열, "result": 문자열, "quote": 문자열}]}',
    '',
    '[지금 고민]',
    worry,
    '',
    '[지난 일기]',
    ...entries.map((e) => `<${e.date}>\n${e.text}`),
  ].join('\n');
  return { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } };
}
export interface DiaryAsk {
  summary: string;
  items: { date: string; situation: string; did: string; result: string; quote: string }[];
}
export function parseDiaryAsk(text: string, dates: string[]): DiaryAsk {
  const j = obj(text);
  const items = (Array.isArray(j.items) ? j.items : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ date: str(x.date, 10) ?? '', situation: str(x.situation, 200) ?? '', did: str(x.did, 200) ?? '', result: str(x.result, 200) ?? '', quote: str(x.quote, 80) ?? '' }))
    // 보낸 일기에 없는 날짜는 버린다 (지어낸 것)
    .filter((x) => dates.includes(x.date))
    .slice(0, 8);
  return { summary: str(j.summary, 300) ?? '', items };
}
