// 방학 계획: 기간 · 하루 공부 목표 · 목표 목록 → 지금까지 얼마나 지켰는지
import { addDays, daysBetween } from './dates';
import { alive, type DateStr, type StudyData, type StudySettings } from './model';

export function vacationView(d: Pick<StudyData, 'sessions'>, v: NonNullable<StudySettings['vacation']>, today: DateStr) {
  const end = today < v.to ? today : v.to;
  const passed = today < v.from ? [] : daysBetween(v.from, end);
  const total = daysBetween(v.from, v.to).length;
  const by = new Map<DateStr, number>();
  for (const s of alive(d.sessions)) if (s.date >= v.from && s.date <= v.to) by.set(s.date, (by.get(s.date) ?? 0) + s.minutes);
  const studied = passed.reduce((a, x) => a + (by.get(x) ?? 0), 0);
  const kept = v.dailyMin ? passed.filter((x) => (by.get(x) ?? 0) >= v.dailyMin).length : 0;
  return {
    total,
    passed: passed.length,
    left: today > v.to ? 0 : today < v.from ? total : daysBetween(addDays(today, 1), v.to).length,
    studied,
    avg: passed.length ? Math.round(studied / passed.length) : 0,
    kept,
    todayMin: by.get(today) ?? 0,
    goalsDone: v.goals.filter((g) => g.done).length,
    on: today >= v.from && today <= v.to,
  };
}

/** 시험 끝나고 할 것 알림: 가장 가까운 시험이 끝나는 날 18시 */
export function afterExamReminder(endDate: DateStr | null, list: StudySettings['afterExam'], now = Date.now()): { at: number; title: string; body: string; url: string }[] {
  const left = (list ?? []).filter((x) => !x.done);
  if (!endDate || !left.length) return [];
  const at = Date.parse(`${endDate}T18:00:00+09:00`);
  if (at <= now) return [];
  return [{ at, title: '🎉 시험 끝! 하고 싶던 것', body: left.slice(0, 3).map((x) => x.text).join(' · ') + (left.length > 3 ? ` 외 ${left.length - 3}개` : ''), url: '/exams' }];
}
