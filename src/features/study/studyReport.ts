// 부모님께 보낼 주간 공부 리포트: 한 주 공부 시간 · 과목별 · 공부한 날 · 시험 진도 · 최근 성적 · 오답 · 수행평가 (기록에 있는 것만)
import type { CardLine } from '../../lib/shareCard';
import { addDays, dday } from './dates';
import { examProgress, upcomingExams } from './exams';
import { recordAverage, recordsOf } from './grades';
import { alive, type DateStr, type StudyData } from './model';

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

export function studyReport(d: StudyData, from: DateStr, today: DateStr): CardLine[] {
  const to = addDays(from, 6);
  const inW = (x: DateStr) => x >= from && x <= to;
  const sessions = alive(d.sessions).filter((s) => inW(s.date) && s.minutes > 0);
  const prev = alive(d.sessions).filter((s) => s.date >= addDays(from, -7) && s.date < from);
  const total = sessions.reduce((a, s) => a + s.minutes, 0);
  const prevTotal = prev.reduce((a, s) => a + s.minutes, 0);
  const days = new Set(sessions.map((s) => s.date)).size;
  const by = new Map<string, number>();
  for (const s of sessions) {
    const name = (s.subjectId && d.subjects[s.subjectId] && !d.subjects[s.subjectId].deleted && d.subjects[s.subjectId].name) || '과목 없음';
    by.set(name, (by.get(name) ?? 0) + s.minutes);
  }
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lines: (CardLine | null)[] = [
    { icon: '📚', label: '이번 주 공부', value: hm(total), sub: prevTotal ? `지난주 ${hm(prevTotal)} · ${total >= prevTotal ? '▲' : '▼'} ${hm(Math.abs(total - prevTotal))}` : undefined },
    { icon: '📅', label: '공부한 날', value: `7일 중 ${days}일` },
    top.length ? { icon: '📊', label: '많이 한 과목', value: top[0][0], sub: top.map(([n, m]) => `${n} ${hm(m)}`).join(' · ') } : null,
  ];
  const exam = upcomingExams(d, today)[0];
  if (exam) {
    const p = examProgress(exam);
    lines.push({ icon: '📝', label: exam.name, value: dday(today, exam.date), sub: p.total ? `시험 범위 ${Math.round((p.done / p.total) * 100)}% (${p.done}/${p.total})` : undefined });
  }
  for (const kind of ['school', 'mock'] as const) {
    const recs = recordsOf(d, kind);
    const last = recs[recs.length - 1];
    if (!last) continue;
    const a = recordAverage(last, 'grade');
    if (a === null) continue;
    const b = recs.length > 1 ? recordAverage(recs[recs.length - 2], 'grade') : null;
    lines.push({ icon: kind === 'school' ? '🏫' : '🧾', label: `최근 ${kind === 'school' ? '내신' : '모의고사'} (${last.name})`, value: `평균 ${Math.round(a * 10) / 10}등급`, sub: b !== null ? `지난번 ${Math.round(b * 10) / 10}등급` : undefined });
  }
  const notes = alive(d.notes).filter((n) => inW(new Date(n.created + 9 * 3_600_000).toISOString().slice(0, 10))).length;
  if (notes) lines.push({ icon: '✏️', label: '오답 노트', value: `${notes}문제 정리` });
  const tasks = alive(d.assessments).filter((a) => inW(a.due));
  if (tasks.length) lines.push({ icon: '📎', label: '수행평가', value: `${tasks.filter((a) => a.done).length}/${tasks.length} 끝`, sub: tasks.map((a) => a.title).join(' · ') });
  const note = d.weekNotes[from];
  if (note && !note.deleted && note.text.trim()) lines.push({ icon: '💬', label: '한 줄 돌아보기', value: note.text.trim().slice(0, 22), sub: note.text.trim().length > 22 ? note.text.trim().slice(22) : undefined });
  return lines.filter((x): x is CardLine => !!x);
}
