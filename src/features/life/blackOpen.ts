// 암시장이 지금 열려 있는지 (메뉴에서도 쓰므로 가볍게): 오늘 공부가 하루 목표(주 목표 ÷ 7) 이상이고, 잘 시각 2시간 전 ~ 잘 시각
import { addDays, weekday } from '../study/dates';
import { alive, type DateStr, type StudyData } from '../study/model';

/** 오늘 밤 잘 시각 (잘 시간 알림 설정이 있으면 그것, 없으면 23시) */
export function bedAt(d: Pick<StudyData, 'settings'>, today: DateStr): number {
  const br = d.settings.bedRemind;
  const goal = d.settings.sleepGoal;
  if (!br || !goal) return Date.parse(`${today}T23:00:00+09:00`);
  const next = addDays(today, 1);
  const w = weekday(next);
  const t = w === 0 || w === 6 ? br.weekend : br.weekday;
  return Date.parse(`${next}T${t}:00+09:00`) - Math.round(goal * 60) * 60_000;
}

export function blackOpen(d: Pick<StudyData, 'settings' | 'sessions'>, today: DateStr, now = Date.now()): { open: boolean; from: number; to: number; done: boolean; goal: number; studied: number } {
  const m = d.settings.market;
  const to = bedAt(d, today);
  const from = to - 2 * 3_600_000;
  const goal = m ? Math.round(m.weeklyTarget / 7) : 0;
  const studied = alive(d.sessions)
    .filter((s) => s.date === today)
    .reduce((a, s) => a + s.minutes, 0);
  const done = !!m && studied >= goal;
  return { open: done && now >= from && now < to, from, to, done, goal, studied };
}
