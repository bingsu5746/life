// AI 학습 코치: 지난 7일 공부 · 과목별 목표 · 다가오는 시험(범위 진도) · 남은 오답 · 숙제를 모은 글 (서버 AI 가 이걸 보고 다음 주 계획을 짠다)
import { addDays, diffDays } from './dates';
import { examProgress, upcomingExams } from './exams';
import { alive, type StudyData } from './model';
import { homeworkViews } from './select';

const h = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

export function coachRecord(d: StudyData, today: string): string {
  const from = addDays(today, -6);
  const ses = alive(d.sessions).filter((s) => s.date >= from && s.date <= today);
  const subs = alive(d.subjects);
  const by = subs
    .map((s) => ({ s, min: ses.filter((x) => x.subjectId === s.id).reduce((a, x) => a + x.minutes, 0) }))
    .filter((x) => x.min || x.s.weeklyGoal)
    .map((x) => `- ${x.s.name}: ${h(x.min)}${x.s.weeklyGoal ? ` (주간 목표 ${x.s.weeklyGoal}시간)` : ''}`);
  const days = new Set(ses.map((s) => s.date)).size;
  const total = ses.reduce((a, s) => a + s.minutes, 0);
  const exams = upcomingExams(d, today)
    .filter((e) => diffDays(today, e.date) <= 45)
    .map((e) => {
      const p = examProgress(e);
      const scopes = (e.scopes ?? []).map((sc) => `${d.subjects[sc.subjectId]?.name ?? '과목'} ${sc.lines.filter((l) => l.done).length}/${sc.lines.length}`).join(', ');
      return `- ${e.name} D-${diffDays(today, e.date)} (범위 진도 ${p.done}/${p.total}${scopes ? `: ${scopes}` : ''})`;
    });
  const notes = subs.map((s) => ({ s, n: alive(d.notes).filter((x) => x.subjectId === s.id && !x.learned).length })).filter((x) => x.n);
  const hw = homeworkViews(d, today).filter((x) => !x.finished).length;
  return [
    `[과목] ${subs.map((s) => s.name).join(', ') || '없음'}`,
    `[지난 7일] 모두 ${h(total)} · 공부한 날 ${days}일`,
    ...(by.length ? by : ['- (과목별 기록 없음)']),
    '',
    `[다가오는 시험]`,
    ...(exams.length ? exams : ['- 45일 안에 시험 없음']),
    '',
    `[남은 오답] ${notes.length ? notes.map((x) => `${x.s.name} ${x.n}개`).join(', ') : '없음'}`,
    `[안 끝낸 숙제] ${hw}개`,
  ].join('\n');
}
