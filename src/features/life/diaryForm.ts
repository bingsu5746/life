// 일기 양식: 날마다 쓸 칸을 고른다 (본문은 항상). 「공부」는 공부 기록에서 자동으로, 「오늘 한 것」은 나머지 앱 기록에서 불러올 수 있다.
import { alive, type StudyData } from '../study/model';

export const DIARY_PARTS: { key: string; label: string; hint: string }[] = [
  { key: 'study', label: '공부', hint: '공부한 시간 · 과목 (공부 기록에서 자동으로 채워요)' },
  { key: 'done', label: '오늘 한 것', hint: '운동 · 영화 · 할 일 같은 것 (기록에서 불러올 수 있어요)' },
  { key: 'good', label: '좋았던 것', hint: '오늘 좋았던 일' },
  { key: 'hard', label: '힘들었던 것', hint: '속상하거나 어려웠던 일' },
  { key: 'thanks', label: '고마운 것', hint: '고마운 사람이나 일' },
  { key: 'dream', label: '꿈', hint: '어젯밤 꾼 꿈이 있다면' },
  { key: 'tomorrow', label: '내일 할 것', hint: '내일 꼭 하고 싶은 것' },
  { key: 'checkin', label: '하루 마감', hint: '하루 마감에서 남긴 한 줄' },
];

export const DEFAULT_FORM = { parts: ['study', 'done', 'good', 'dream'], autoFill: true };

/** 설정에 저장한 양식 (없으면 기본) */
export function formOf(d: Pick<StudyData, 'settings'>): { parts: string[]; autoFill: boolean } {
  const f = d.settings.diaryForm;
  // known: 양식을 저장할 때 있던 칸들. 그 뒤에 새로 생긴 칸(예: 공부)은 켜진 것으로
  return f ? { parts: DIARY_PARTS.map((p) => p.key).filter((k) => f.parts.includes(k) || (k === 'study' && !f.known?.includes(k))), autoFill: f.autoFill } : DEFAULT_FORM;
}

/** 그날 공부 기록: 모두 몇 분 · 과목별 · 메모 (없으면 빈 목록) */
export function studySummary(d: StudyData, date: string): string[] {
  const out: string[] = [];
  const study = alive(d.sessions).filter((s) => s.date === date);
  const min = study.reduce((a, s) => a + s.minutes, 0);
  if (!min) return out;
  const t = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
  out.push(`모두 ${t(min)}`);
  const by = new Map<string, number>();
  for (const s of study) {
    const name = s.subjectId && d.subjects[s.subjectId] ? d.subjects[s.subjectId].name : '기타';
    by.set(name, (by.get(name) ?? 0) + s.minutes);
  }
  if (by.size > 1 || !by.has('기타'))
    out.push(
      [...by]
        .sort((a, b) => b[1] - a[1])
        .map(([n, m]) => `${n} ${t(m)}`)
        .join(' · '),
    );
  for (const s of study.filter((x) => x.memo).sort((a, b) => a.start - b.start)) out.push(`${s.subjectId && d.subjects[s.subjectId] ? `${d.subjects[s.subjectId].name}: ` : ''}${s.memo}`);
  return out;
}

/** 그날 앱에 남긴 기록 중 공부 말고 나머지를 한 줄씩 (없으면 빈 목록) */
export function daySummary(d: StudyData, date: string): string[] {
  const out: string[] = [];
  const done = alive(d.todos).filter((t) => t.done && t.doneAt && new Date(t.doneAt + 9 * 3600_000).toISOString().slice(0, 10) === date);
  if (done.length) out.push(`할 일 ${done.length}개 끝냄`);
  for (const w of alive(d.workouts).filter((x) => x.date === date)) out.push(`운동: ${w.kind}${w.minutes ? ` ${w.minutes}분` : ''}`);
  for (const m of alive(d.movies).filter((x) => x.status === 'watched' && x.watched === date)) out.push(`영화: ${m.title}${m.rating ? ` ★${m.rating}` : ''}`);
  // 그날 다 읽은 책 (한줄평이 있으면 같이)
  for (const b of alive(d.reads).filter((x) => x.status === 'done' && x.finished === date)) out.push(`책: 「${b.title}」 다 읽음${b.rating ? ` ★${b.rating}` : ''}${b.comment ? ` — ${b.comment}` : ''}`);
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
