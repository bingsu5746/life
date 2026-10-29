// 일기 양식: 날마다 쓸 칸을 고른다 (본문은 항상). 「오늘 한 것」은 앱에 남긴 기록에서 불러올 수 있다.
import { alive, type StudyData } from '../study/model';

export const DIARY_PARTS: { key: string; label: string; hint: string }[] = [
  { key: 'done', label: '오늘 한 것', hint: '공부·운동·영화 같은 것 (기록에서 불러올 수 있어요)' },
  { key: 'good', label: '좋았던 것', hint: '오늘 좋았던 일' },
  { key: 'hard', label: '힘들었던 것', hint: '속상하거나 어려웠던 일' },
  { key: 'thanks', label: '고마운 것', hint: '고마운 사람이나 일' },
  { key: 'dream', label: '꿈', hint: '어젯밤 꾼 꿈이 있다면' },
  { key: 'tomorrow', label: '내일 할 것', hint: '내일 꼭 하고 싶은 것' },
  { key: 'checkin', label: '하루 마감', hint: '체크인에서 남긴 것' },
];

export const DEFAULT_FORM = { parts: ['done', 'good', 'dream'], autoFill: true };

/** 설정에 저장한 양식 (없으면 기본) */
export function formOf(d: Pick<StudyData, 'settings'>): { parts: string[]; autoFill: boolean } {
  const f = d.settings.diaryForm;
  return f ? { parts: DIARY_PARTS.map((p) => p.key).filter((k) => f.parts.includes(k)), autoFill: f.autoFill } : DEFAULT_FORM;
}

/** 그날 앱에 남긴 기록을 한 줄씩 (없으면 빈 목록) */
export function daySummary(d: StudyData, date: string): string[] {
  const out: string[] = [];
  const study = alive(d.sessions).filter((s) => s.date === date);
  const min = study.reduce((a, s) => a + s.minutes, 0);
  if (min) out.push(`공부 ${min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`}`);
  for (const s of study.filter((x) => x.memo).sort((a, b) => a.start - b.start)) out.push(`- ${s.subjectId && d.subjects[s.subjectId] ? `${d.subjects[s.subjectId].name}: ` : ''}${s.memo}`);
  const done = alive(d.todos).filter((t) => t.done && t.doneAt && new Date(t.doneAt + 9 * 3600_000).toISOString().slice(0, 10) === date);
  if (done.length) out.push(`할 일 ${done.length}개 끝냄`);
  for (const w of alive(d.workouts).filter((x) => x.date === date)) out.push(`운동: ${w.kind}${w.minutes ? ` ${w.minutes}분` : ''}`);
  for (const m of alive(d.movies).filter((x) => x.status === 'watched' && x.watched === date)) out.push(`영화: ${m.title}${m.rating ? ` ★${m.rating}` : ''}`);
  for (const l of alive(d.hobbyLogs).filter((x) => x.date === date)) out.push(`취미: ${d.hobbies[l.hobbyId]?.name ?? '취미'}${l.minutes ? ` ${l.minutes}분` : ''}`);
  const spent = alive(d.moneyTx)
    .filter((t) => t.type === 'out' && t.date === date)
    .reduce((a, t) => a + t.amount, 0);
  if (spent) out.push(`쓴 돈 ${spent.toLocaleString('ko-KR')}원`);
  const habits = alive(d.habits).filter((h) => !h.archived && h.checks.includes(date));
  if (habits.length) out.push(`습관: ${habits.map((h) => h.name).join(', ')}`);
  return out;
}

/** 꿈을 쓴 일기의 날짜들 (최근 순) */
export function dreamDates(d: Pick<StudyData, 'diary'>): string[] {
  return alive(d.diary)
    .filter((e) => e.parts?.dream?.trim())
    .map((e) => e.id)
    .sort()
    .reverse();
}
