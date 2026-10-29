// 반복 할 일: 정한 요일(비면 매일)의 그날 할 일을 자동으로 만든다.
// 같은 규칙·같은 날은 같은 id 라서 두 기기에서 만들어도 하나, 지운 것도 다시 생기지 않는다.
import { weekday } from './dates';
import { alive, type DateStr, type StudyData, type Todo } from './model';

export const ruleTodoId = (ruleId: string, date: DateStr) => `tr-${ruleId}-${date}`;

/** 오늘 만들어야 할 반복 할 일 (아직 없는 것만) */
export function dueTodoRules(d: Pick<StudyData, 'todoRules' | 'todos'>, today: DateStr, now = Date.now()): Todo[] {
  const out: Todo[] = [];
  for (const r of alive(d.todoRules)) {
    if (r.paused || r.start > today) continue;
    if (r.weekdays.length && !r.weekdays.includes(weekday(today))) continue;
    const id = ruleTodoId(r.id, today);
    if (d.todos[id]) continue;
    out.push({ id, title: r.title, due: today, done: false, created: now } as Todo);
  }
  return out;
}
