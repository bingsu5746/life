// 한 줄로 일정 넣기: 「내일 오후 3시 치과」 「금요일 7시~9시 학원」 「12/24 크리스마스」 → 날짜 · 시각 · 제목
import { addDays, weekday } from '../study/dates';
import type { DateStr } from '../study/model';

export interface QuickEvent {
  title: string;
  date: DateStr;
  allDay: boolean;
  start?: string;
  end?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const WD = '일월화수목금토';
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 시 · 분 → HH:MM. ampm 이 없으면 1~7시는 오후로 본다 (학교 끝난 뒤 일정이 많아서) */
function hhmm(h: number, min: number, ampm: string | undefined): string | null {
  if (h > 24 || min > 59) return null;
  if (ampm && /오후|저녁|밤/.test(ampm) && h < 12) h += 12;
  else if (ampm && /오전|아침|새벽/.test(ampm) && h === 12) h = 0;
  else if (!ampm && h >= 1 && h <= 7) h += 12;
  return `${pad(h % 24)}:${pad(min)}`;
}

export function parseQuick(text: string, today: DateStr): QuickEvent | null {
  let s = ` ${text.trim()} `;
  if (!s.trim()) return null;
  let date: DateStr | null = null;
  const take = (re: RegExp, f: (m: RegExpMatchArray) => DateStr | null) => {
    if (date) return;
    const m = s.match(re);
    if (!m) return;
    const v = f(m);
    if (!v) return;
    date = v;
    s = s.replace(m[0], ' ');
  };
  const y0 = Number(today.slice(0, 4));
  take(/\s(오늘)\s/, () => today);
  take(/\s(내일)\s/, () => addDays(today, 1));
  take(/\s(모레)\s/, () => addDays(today, 2));
  take(/\s(글피)\s/, () => addDays(today, 3));
  // 12월 24일 · 12/24 (지났으면 내년)
  const md = (mo: number, da: number) => {
    let y = y0;
    if (!valid(y, mo, da)) return null;
    if (`${y}-${pad(mo)}-${pad(da)}` < today) y++;
    return valid(y, mo, da) ? `${y}-${pad(mo)}-${pad(da)}` : null;
  };
  take(/\s(\d{1,2})월\s?(\d{1,2})일\s/, (m) => md(Number(m[1]), Number(m[2])));
  take(/\s(\d{1,2})\/(\d{1,2})\s/, (m) => md(Number(m[1]), Number(m[2])));
  // 다음 주 금요일 · 이번 주 금요일 · 금요일 (오늘이거나 다가오는 날)
  take(/\s(다음\s?주|이번\s?주|담주)?\s?([일월화수목금토])요일?\s/, (m) => {
    const w = WD.indexOf(m[2]);
    const sun = addDays(today, -weekday(today));
    if (m[1] && /다음|담/.test(m[1])) return addDays(sun, 7 + w);
    if (m[1]) return addDays(sun, w);
    return addDays(today, (w - weekday(today) + 7) % 7);
  });
  // 15일 (이번 달, 지났으면 다음 달)
  take(/\s(\d{1,2})일\s/, (m) => {
    const da = Number(m[1]);
    let y = y0;
    let mo = Number(today.slice(5, 7));
    if (`${y}-${pad(mo)}-${pad(da)}` < today) (mo = mo === 12 ? 1 : mo + 1), (y = mo === 1 ? y + 1 : y);
    return valid(y, mo, da) ? `${y}-${pad(mo)}-${pad(da)}` : null;
  });
  // 시각: (오후) 3시 (30분|반) ~ (오후) 5시 · 15:00-17:00
  const T = String.raw`(오전|오후|아침|저녁|밤|새벽)?\s?(\d{1,2})(?:시\s?(?:(\d{1,2})분|(반))?|:(\d{2}))`;
  const range = s.match(new RegExp(String.raw`\s${T}\s?(?:부터)?\s?(?:~|-|–)?\s?${T}\s?(?:까지)?\s`));
  const one = range ? null : s.match(new RegExp(String.raw`\s${T}\s?(?:에|부터)?\s`));
  let start: string | undefined;
  let end: string | undefined;
  const at = (m: RegExpMatchArray, i: number, ampm?: string) => hhmm(Number(m[i + 1]), m[i + 3] ? 30 : Number(m[i + 2] ?? m[i + 4] ?? 0), m[i] || ampm);
  if (range) {
    start = at(range, 1) ?? undefined;
    // 끝에 오전 · 오후가 없으면 시작을 따른다 (오후 3시~5시)
    end = at(range, 6, range[1]) ?? undefined;
    if (start && end && end <= start && !range[6]) {
      const h = Number(end.slice(0, 2)) + 12;
      if (h < 24) end = `${pad(h)}:${end.slice(3)}`;
    }
    s = s.replace(range[0], ' ');
  } else if (one) {
    start = at(one, 1) ?? undefined;
    s = s.replace(one[0], ' ');
  }
  if (start && !end) end = `${pad(Math.min(23, Number(start.slice(0, 2)) + 1))}:${start.slice(3)}`;
  const title = s.replace(/\s+/g, ' ').trim().replace(/^(에|에는)\s/, '');
  if (!title) return null;
  return { title, date: date ?? today, allDay: !start, start, end: start ? end : undefined };
}
