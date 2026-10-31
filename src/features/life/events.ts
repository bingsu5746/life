// 달력 일정: 반복 펼치기 · 그날 일정 · 알림 시각
import { addDays, daysBetween, diffDays, weekday, weekStart } from '../study/dates';
import { alive, type CalEvent, type DateStr, type StudyData } from '../study/model';

/** 일정 색 (이름 → 색) */
export const EVENT_COLORS: Record<string, { label: string; c: string }> = {
  blue: { label: '파랑', c: '#3b82f6' },
  green: { label: '초록', c: '#16a34a' },
  red: { label: '빨강', c: '#ef4444' },
  orange: { label: '주황', c: '#f97316' },
  yellow: { label: '노랑', c: '#eab308' },
  purple: { label: '보라', c: '#8b5cf6' },
  pink: { label: '분홍', c: '#ec4899' },
  gray: { label: '회색', c: '#6b7280' },
};
export const colorOf = (e: Pick<CalEvent, 'color'>) => EVENT_COLORS[e.color]?.c ?? EVENT_COLORS.blue.c;

export const REMIND_OPTS: [number | undefined, string][] = [
  [undefined, '알림 없음'],
  [0, '정각'],
  [5, '5분 전'],
  [10, '10분 전'],
  [30, '30분 전'],
  [60, '1시간 전'],
  [180, '3시간 전'],
  [1440, '하루 전'],
];

const len = (e: CalEvent) => (e.endDate && e.endDate > e.date ? diffDays(e.date, e.endDate) : 0);
const monthsBetween = (a: DateStr, b: DateStr) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** 이 날이 반복의 시작 날(한 번)인지 */
function startsOn(e: CalEvent, day: DateStr): boolean {
  if (day < e.date) return false;
  if (e.skip?.includes(day)) return false;
  const r = e.repeat;
  if (!r) return day === e.date;
  if (r.until && day > r.until) return false;
  const gap = diffDays(e.date, day);
  if (r.freq === 'daily') return gap % r.every === 0;
  if (r.freq === 'weekly') {
    const days = r.weekdays?.length ? r.weekdays : [weekday(e.date)];
    return days.includes(weekday(day)) && (diffDays(weekStart(e.date), weekStart(day)) / 7) % r.every === 0;
  }
  if (r.freq === 'monthly') return day.slice(8) === e.date.slice(8) && monthsBetween(e.date, day) % r.every === 0;
  return day.slice(5) === e.date.slice(5) && (Number(day.slice(0, 4)) - Number(e.date.slice(0, 4))) % r.every === 0;
}

/** from~to 사이에 걸치는 일정 (날마다). 여러 날 일정은 걸친 날 모두 */
export function eventsBetween(d: Pick<StudyData, 'events'>, from: DateStr, to: DateStr): Map<DateStr, { e: CalEvent; first: boolean; last: boolean; on: DateStr }[]> {
  const out = new Map<DateStr, { e: CalEvent; first: boolean; last: boolean; on: DateStr }[]>();
  for (const e of alive(d.events ?? {})) {
    const n = len(e);
    // 여러 날 일정이 앞에서 넘어올 수 있어 n 일 앞부터 본다
    for (const s of daysBetween(addDays(from, -n), to)) {
      if (!startsOn(e, s)) continue;
      for (let k = 0; k <= n; k++) {
        const day = addDays(s, k);
        if (day < from || day > to) continue;
        out.set(day, [...(out.get(day) ?? []), { e, first: k === 0, last: k === n, on: s }]);
      }
    }
  }
  for (const [k, v] of out)
    out.set(
      k,
      v.sort((a, b) => Number(b.e.allDay) - Number(a.e.allDay) || (a.e.start ?? '').localeCompare(b.e.start ?? '')),
    );
  return out;
}

/** 일정 시각 글 (하루 종일 · 9:00~10:30) */
export const timeText = (e: CalEvent) => (e.allDay ? '하루 종일' : `${e.start ?? ''}${e.end ? `~${e.end}` : ''}`);

/** 반복 설명 */
export function repeatText(e: CalEvent): string {
  const r = e.repeat;
  if (!r) return '';
  const W = ['일', '월', '화', '수', '목', '금', '토'];
  const every = r.every > 1 ? `${r.every}` : '';
  const base =
    r.freq === 'daily'
      ? `${every ? `${every}일마다` : '매일'}`
      : r.freq === 'weekly'
        ? `${every ? `${every}주마다` : '매주'} ${(r.weekdays?.length ? r.weekdays : [weekday(e.date)]).map((w) => W[w]).join('·')}`
        : r.freq === 'monthly'
          ? `${every ? `${every}달마다` : '매달'} ${Number(e.date.slice(8))}일`
          : `${every ? `${every}년마다` : '매년'} ${Number(e.date.slice(5, 7))}월 ${Number(e.date.slice(8))}일`;
  return r.until ? `${base} · ${r.until}까지` : base;
}

/** 앞으로 days 일 동안의 알림 (서버에 올려 두면 그 시각에 휴대폰으로) */
export function reminders(d: Pick<StudyData, 'events'>, today: DateStr, now = Date.now(), days = 14): { at: number; title: string; body: string }[] {
  const out: { at: number; title: string; body: string }[] = [];
  const map = eventsBetween(d, today, addDays(today, days));
  for (const list of map.values())
    for (const { e, first, on } of list) {
      if (!first || e.remind === undefined) continue;
      // 한국 시각 기준 (하루 종일은 아침 9시)
      const startAt = Date.parse(`${on}T${e.allDay ? '09:00' : (e.start ?? '09:00')}:00+09:00`);
      const at = startAt - e.remind * 60_000;
      if (at <= now) continue;
      const when = e.remind === 0 ? '지금' : e.remind >= 1440 ? '내일' : e.remind >= 60 ? `${e.remind / 60}시간 뒤` : `${e.remind}분 뒤`;
      out.push({
        at,
        title: e.title,
        body: `${when} · ${timeText(e)}${e.place ? ` · ${e.place}` : ''}`,
      });
    }
  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}
