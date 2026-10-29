// 지난 성적 (계산): 과목별 흐름, 평균 등급, 바뀐 정도, 시험 전 공부 시간
import { addDays } from './dates';
import { sleepMinutes } from './condition';
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

/** 틀린 번호 글 → 번호들 (예: 「3, 7, 21~23」) */
export function parseWrongNums(s: string): number[] {
  const out = new Set<number>();
  for (const m of s.matchAll(/(\d{1,3})\s*(?:[~-]\s*(\d{1,3}))?/g)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 200 || b < a || b - a > 50) continue;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** 그 과목에서 번호마다 몇 번 틀렸는지 (틀린 번호를 넣은 성적만) */
export function wrongFrequency(records: GradeRecord[], subject: string): { counts: Map<number, number>; records: number; max: number } {
  const counts = new Map<number, number>();
  let n = 0;
  let max = 0;
  for (const r of records) {
    const s = findScore(r, subject);
    if (!s?.wrong) continue;
    n++;
    for (const q of s.wrong) {
      counts.set(q, (counts.get(q) ?? 0) + 1);
      if (q > max) max = q;
    }
  }
  return { counts, records: n, max };
}

/**
 * 내신 목표 역산: 학기 목표(100점 환산)를 넘으려면 아직 안 본 항목에서 몇 점씩 받아야 하는지.
 * 남은 항목은 모두 같은 점수를 받는다고 보고 계산한다.
 */
export function neededScore(g: { target: number; parts: { weight: number; score?: number }[] }): { need: number | null; got: number; left: number; possible: boolean } {
  const total = g.parts.reduce((a, p) => a + p.weight, 0) || 100;
  const got = g.parts.filter((p) => p.score !== undefined).reduce((a, p) => a + (p.score! * p.weight) / total, 0);
  const left = g.parts.filter((p) => p.score === undefined).reduce((a, p) => a + p.weight / total, 0);
  if (left <= 0) return { need: null, got: Math.round(got * 10) / 10, left: 0, possible: got >= g.target };
  const need = Math.ceil(((g.target - got) / left) * 10) / 10;
  return { need: Math.max(0, need), got: Math.round(got * 10) / 10, left: Math.round(left * 100), possible: need <= 100 };
}

/** 시험 전 days 일 (시험 날 빼고)의 생활: 하루 평균 공부(분) · 기록한 날의 평균 잠(분) */
export function prepBefore(d: Pick<StudyData, 'sessions' | 'conditions'>, date: DateStr, days = 14): { studyPerDay: number; sleepAvg: number | null; sleepDays: number } {
  const from = addDays(date, -days);
  const study = alive(d.sessions)
    .filter((s) => s.date >= from && s.date < date)
    .reduce((a, s) => a + s.minutes, 0);
  const sleeps = alive(d.conditions)
    .filter((c) => c.id >= from && c.id < date)
    .map((c) => sleepMinutes(c))
    .filter((m): m is number => m !== null);
  return { studyPerDay: Math.round(study / days), sleepAvg: sleeps.length ? Math.round(sleeps.reduce((a, b) => a + b, 0) / sleeps.length) : null, sleepDays: sleeps.length };
}
