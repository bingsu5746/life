// 약 · 영양제: 오늘 먹을 것 · 체크 · 알림 (기기가 미리 계산해 서버에 맡긴다)
import { addDays } from './dates';
import type { DateStr, StudyData, StudySettings } from './model';

export type Med = NonNullable<StudySettings['meds']>[number];
export const doseKey = (m: Pick<Med, 'id'>, time: string) => `${m.id}@${time}`;

/** 그날 먹을 것 (시각 순) */
export function dosesOn(s: Pick<StudySettings, 'meds' | 'medLog'>, date: DateStr): { med: Med; time: string; done: boolean }[] {
  const log = new Set(s.medLog?.[date] ?? []);
  return (s.meds ?? []).flatMap((med) => med.times.map((time) => ({ med, time, done: log.has(doseKey(med, time)) }))).sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

/** 체크 · 해제한 기록 (60일보다 오래된 날은 지운다) */
export function toggleDose(log: StudySettings['medLog'], date: DateStr, key: string): NonNullable<StudySettings['medLog']> {
  const cur = new Set(log?.[date] ?? []);
  if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  const out = Object.fromEntries(Object.entries(log ?? {}).filter(([k]) => k >= addDays(date, -59) && k !== date));
  if (cur.size) out[date] = [...cur];
  return out;
}

/** 알림: 앞으로 days 일, 먹을 시각마다 (그날 이미 체크했으면 빼고) */
export function medReminders(d: Pick<StudyData, 'settings'>, today: DateStr, now = Date.now(), days = 7): { at: number; title: string; body: string; url: string }[] {
  const out: { at: number; title: string; body: string; url: string }[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    for (const x of dosesOn(d.settings, date)) {
      if (x.done) continue;
      const at = Date.parse(`${date}T${x.time}:00+09:00`);
      if (at <= now) continue;
      out.push({ at, title: `💊 ${x.med.name} 먹을 시간`, body: `${x.time}${x.med.memo ? ` · ${x.med.memo}` : ''} · 먹었으면 앱에서 체크해요`, url: '/life' });
    }
  }
  return out;
}
