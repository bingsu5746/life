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

export const DIARY_KEYS = ['good', 'hard', 'thanks', 'tomorrow', 'dream'] as const;
export type DiaryRead = Partial<Record<(typeof DIARY_KEYS)[number], string>>;
export function diaryBody(text: string) {
  const prompt = [
    '아래는 고등학생이 말로 한 일기를 받아쓴 글이에요. 글에 있는 내용만 골라 칸에 나눠 주세요. 없는 내용은 절대 지어내지 말고, 해당하는 말이 없으면 그 칸은 null 로 두세요.',
    '말투는 원래 글 그대로 (반말이면 반말), 짧게 다듬기만 하세요.',
    'JSON 칸: "good"(좋았던 것), "hard"(힘들었던 것), "thanks"(고마운 것), "tomorrow"(내일 할 것), "dream"(꿈 이야기).',
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
