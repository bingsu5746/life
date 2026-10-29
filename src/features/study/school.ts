// 나이스에서 받은 학교 정보를 앱 자료로: 시간표 → 요일별 과목, 학사일정 → 시험 · 쉬는 날
import type { SchoolEvent, SchoolPeriod } from '../auth/api';
import { diffDays, weekday } from './dates';
import type { Id, Subject } from './model';

const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** 나이스 과목 이름 → 내 과목 (이름이 같거나, 한쪽이 다른 쪽으로 시작하면: 「수학」 ↔ 「수학Ⅰ」) */
export function matchSubject(name: string, subjects: Pick<Subject, 'id' | 'name'>[]): Id | null {
  const n = norm(name);
  const exact = subjects.find((s) => norm(s.name) === n);
  if (exact) return exact.id;
  const near = subjects.filter((s) => norm(s.name).length >= 2 && (n.startsWith(norm(s.name)) || norm(s.name).startsWith(n))).sort((a, b) => b.name.length - a.name.length);
  return near[0]?.id ?? null;
}

/** 받은 시간표(며칠치) → 요일마다 교시 순서의 과목 이름 (같은 요일이 여럿이면 가장 최근 날) */
export function weekPattern(periods: SchoolPeriod[]): Record<string, string[]> {
  const lastDate: Record<string, string> = {};
  for (const p of periods) {
    const w = String(weekday(p.date));
    if (!lastDate[w] || p.date > lastDate[w]) lastDate[w] = p.date;
  }
  const out: Record<string, string[]> = {};
  for (const [w, date] of Object.entries(lastDate))
    out[w] = periods
      .filter((p) => p.date === date)
      .sort((a, b) => a.period - b.period)
      .map((p) => p.subject);
  return out;
}

/** 시험 같은 학사일정 (지필평가 · 고사 · 모의고사): 이름이 같고 사흘 안으로 이어지면 한 시험으로 */
export function examEvents(events: SchoolEvent[]): { name: string; date: string; end?: string }[] {
  const exams = events.filter((e) => /지필|고사|모의고사|학력평가|모의평가/.test(e.name)).sort((a, b) => a.date.localeCompare(b.date));
  const out: { name: string; date: string; end?: string }[] = [];
  for (const e of exams) {
    const last = out[out.length - 1];
    if (last && last.name === e.name && diffDays(last.end ?? last.date, e.date) <= 3) last.end = e.date;
    else out.push({ name: e.name, date: e.date });
  }
  return out;
}

/** 수업 없는 날 (휴업일 · 공휴일), 겹침 없이 */
export const offDays = (events: SchoolEvent[]) => [...new Set(events.filter((e) => e.off).map((e) => e.date))].sort();
