// 지난 성적 (계산): 과목별 흐름, 평균 등급, 바뀐 정도, 시험 전 공부 시간
import { addDays } from './dates';
import { alive, type DateStr, type GradeRecord, type GradeScore, type StudyData } from './model';

export type Metric = 'grade' | 'raw' | 'percentile' | 'standard';

export const METRIC_NAME: Record<Metric, string> = { grade: '등급', raw: '원점수', percentile: '백분위', standard: '표준점수' };

/** 모의고사에 기본으로 넣어 두는 과목 (고칠 수 있다) */
export const MOCK_SUBJECTS = ['국어', '수학', '영어', '한국사', '탐구1', '탐구2'];

/** 그 성적 종류에서 볼 수 있는 값 */
export const metricsFor = (kind: GradeRecord['kind']): Metric[] => (kind === 'mock' ? ['grade', 'raw', 'percentile', 'standard'] : ['grade', 'raw']);

export function scoreValue(s: GradeScore | undefined, m: Metric): number | null {
  if (!s) return null;
  const v = m === 'grade' ? s.grade : m === 'raw' ? s.raw : m === 'percentile' ? s.percentile : s.standard;
  return v === undefined ? null : v;
}

/** 날짜 순 성적 (종류별) */
export function recordsOf(d: StudyData, kind: GradeRecord['kind']): GradeRecord[] {
  return alive(d.grades)
    .filter((g) => g.kind === kind)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

const key = (name: string) => name.replace(/\s+/g, '').toLowerCase();

/** 성적에 나온 과목 이름들 (처음 나온 순, 띄어쓰기·대소문자가 달라도 같은 과목) */
export function subjectNames(records: GradeRecord[]): string[] {
  const seen = new Map<string, string>();
  for (const r of records) for (const s of r.scores) if (s.subject.trim() && !seen.has(key(s.subject))) seen.set(key(s.subject), s.subject.trim());
  return [...seen.values()];
}

export const findScore = (r: GradeRecord, subject: string) => r.scores.find((s) => key(s.subject) === key(subject));

/** 한 과목의 흐름 (성적마다 값, 없으면 null) */
export function series(records: GradeRecord[], subject: string, m: Metric): (number | null)[] {
  return records.map((r) => scoreValue(findScore(r, subject), m));
}

/** 그 시험의 평균 (값이 있는 과목만). 없으면 null */
export function recordAverage(r: GradeRecord, m: Metric): number | null {
  const v = r.scores.map((s) => scoreValue(s, m)).filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
}

/**
 * 바로 앞 성적과 비교. better: 좋아졌는지 (등급은 작을수록 좋음).
 * 둘 중 하나라도 없으면 null
 */
export function change(prev: number | null, cur: number | null, m: Metric): { diff: number; better: boolean } | null {
  if (prev === null || cur === null || prev === cur) return prev !== null && cur !== null ? { diff: 0, better: false } : null;
  const diff = Math.round((cur - prev) * 100) / 100;
  return { diff, better: m === 'grade' ? diff < 0 : diff > 0 };
}

/** 바뀐 정도를 말로 */
export function changeText(c: { diff: number; better: boolean } | null, m: Metric): string {
  if (!c) return '';
  if (c.diff === 0) return '그대로';
  const n = Math.round(Math.abs(c.diff) * 10) / 10;
  const unit = m === 'grade' ? '등급' : '점';
  return `${n}${unit} ${c.better ? '올랐어요' : '내려갔어요'}`;
}

/** 시험 전 며칠 동안 그 과목을 공부한 시간 (분). 과목은 이름으로 맞춘다 */
export function studyBefore(d: StudyData, subject: string, date: DateStr, days = 28): number | null {
  const sub = alive(d.subjects).find((s) => key(s.name) === key(subject));
  if (!sub) return null;
  const from = addDays(date, -days);
  return alive(d.sessions)
    .filter((s) => s.subjectId === sub.id && s.date >= from && s.date < date)
    .reduce((a, s) => a + s.minutes, 0);
}

/** 숫자 칸 읽기: 비었거나 이상하면 undefined */
export function readNum(v: string, lo: number, hi: number): number | undefined {
  const t = v.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
}
