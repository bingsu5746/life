// 말로 넣은 할 일: 「내일까지 수학 숙제 그리고 금요일까지 영어 단어」 → 할 일 + 마감 날 (기기에서 계산, AI 없음)
import { addDays, weekday } from './dates';
import type { DateStr } from './model';

const WD: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const NUM: Record<string, number> = { 하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6, 이레: 7, 일주일: 7, 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };

export interface VoiceTodo {
  title: string;
  due?: DateStr;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 한 덩어리 말 → 할 일 하나 */
export function parseVoiceTodo(raw: string, today: DateStr): VoiceTodo {
  let t = ` ${raw.replace(/[.!?。]+$/g, '').replace(/\s+/g, ' ').trim()} `;
  let due: DateStr | undefined;
  const take = (re: RegExp, f: (m: RegExpMatchArray) => DateStr | undefined) => {
    if (due) return;
    const m = t.match(re);
    if (!m) return;
    const v = f(m);
    if (!v) return;
    due = v;
    t = t.replace(m[0], ' ');
  };
  const tail = String.raw`\s*(?:까지|에|안에|전까지|중에|중으로)?`;
  // 3일 뒤 · 이틀 후 · 일주일 안에
  take(new RegExp(String.raw`\s(\d{1,2}|하루|이틀|사흘|나흘|닷새|엿새|이레|일주일|한|두|세|네|다섯)\s*(일|주|주일)?\s*(?:뒤|후|안에|이내)${tail}`), (m) => {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1]];
    const unit = m[1] === '일주일' ? 1 : m[2] === '주' || m[2] === '주일' ? 7 : 1;
    return n ? addDays(today, n * unit) : undefined;
  });
  // 11월 20일 · 20일
  take(new RegExp(String.raw`\s(\d{1,2})\s*월\s*(\d{1,2})\s*일${tail}`), (m) => {
    const y = Number(today.slice(0, 4));
    let d = `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
    if (d < today) d = `${y + 1}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
    return Number.isNaN(Date.parse(d)) ? undefined : d;
  });
  take(new RegExp(String.raw`\s(\d{1,2})\s*일${tail}(?=\s)`), (m) => {
    const day = Number(m[1]);
    if (day < 1 || day > 31) return undefined;
    let [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    if (day < Number(today.slice(8, 10))) [y, mo] = mo === 12 ? [y + 1, 1] : [y, mo + 1];
    const d = `${y}-${pad(mo)}-${pad(day)}`;
    return new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d ? d : undefined;
  });
  // 다음 주 금요일 · 이번 주 토요일 · 금요일
  take(new RegExp(String.raw`\s(다음\s*주|담주|이번\s*주|이번)?\s*([일월화수목금토])요일${tail}`), (m) => {
    const w = WD[m[2]];
    const cur = weekday(today);
    const toMon = (cur + 6) % 7;
    const mon = addDays(today, -toMon);
    if (m[1] && /다음|담/.test(m[1])) return addDays(mon, 7 + ((w + 6) % 7));
    if (m[1]) return addDays(mon, (w + 6) % 7);
    // 요일만: 오늘부터 가장 가까운 그 요일 (오늘이면 오늘)
    return addDays(today, (w - cur + 7) % 7);
  });
  // 오늘 · 내일 · 모레 · 글피 · 다음 주 · 주말
  take(new RegExp(String.raw`\s(오늘|내일|낼|모레|글피|다음\s*주|담주|이번\s*주말|주말)${tail}`), (m) => {
    const k = m[1].replace(/\s/g, '');
    if (k === '오늘') return today;
    if (k === '내일' || k === '낼') return addDays(today, 1);
    if (k === '모레') return addDays(today, 2);
    if (k === '글피') return addDays(today, 3);
    if (k === '다음주' || k === '담주') return addDays(today, 7);
    // 주말: 다가오는 토요일
    return addDays(today, (6 - weekday(today) + 7) % 7);
  });
  const title = t
    // 「써야 돼」 「해야 함」 같은 끝말은 뺀다 (할 일 이름만)
    .replace(/\s\S*야\s*(?:돼|되|함|해|된다|합니다|지)(?=\s|$)/g, ' ')
    .replace(/\s(?:까지|하기|할\s*것|해야지|하자)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:그리고|그다음|또)\s+/, '');
  return { title: title || raw.trim(), due };
}

/** 여러 개를 한 번에: 「그리고」 · 쉼표 · 「다음에」로 나눈다 */
export function parseVoiceTodos(raw: string, today: DateStr): VoiceTodo[] {
  return raw
    .split(/\s*(?:,|，|\s그리고\s|\s그다음에?\s|\s또\s)\s*/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .map((x) => parseVoiceTodo(x, today))
    .filter((x) => x.title.length >= 1);
}
