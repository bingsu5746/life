// 오답 패턴: 과목마다 어떤 이유로 많이 틀리는지, 어느 단원에서 많이 틀리는지
import { alive, REASONS, type Id, type StudyData, type WrongNote, type WrongReason } from './model';

export interface SubjectPattern {
  subjectId: Id;
  total: number;
  /** 이유를 적은 오답 수 */
  withReason: number;
  top: { reason: WrongReason; n: number; share: number } | null;
  /** 실수(계산 실수 + 문제 잘못 읽음)의 비율 0~1 (이유를 적은 것 중) */
  careless: number;
  units: { name: string; n: number }[];
}

const unitOf = (d: Pick<StudyData, 'books'>, n: WrongNote): string | null => {
  if (!n.bookId || !n.page) return null;
  const b = d.books[n.bookId];
  const u = b && !b.deleted ? b.units.find((x) => n.page! >= x.from && n.page! <= x.to) : undefined;
  return u ? `${b.name} ${u.name}` : null;
};

/** 과목별 오답 패턴 (오답이 많은 과목부터). onlyOpen 이면 아직 해결 안 된 것만 */
export function mistakePatterns(d: Pick<StudyData, 'notes' | 'books'>, onlyOpen = false): SubjectPattern[] {
  const by = new Map<Id, WrongNote[]>();
  for (const n of alive(d.notes)) {
    if (onlyOpen && n.learned) continue;
    by.set(n.subjectId, [...(by.get(n.subjectId) ?? []), n]);
  }
  return [...by]
    .map(([subjectId, list]) => {
      const withR = list.filter((n) => n.reason);
      const counts = (Object.keys(REASONS) as WrongReason[]).map((r) => ({ reason: r, n: withR.filter((n) => n.reason === r).length })).sort((a, b) => b.n - a.n);
      const top = counts[0]?.n ? { ...counts[0], share: counts[0].n / withR.length } : null;
      const careless = withR.length ? withR.filter((n) => n.reason === 'calc' || n.reason === 'misread').length / withR.length : 0;
      const um = new Map<string, number>();
      for (const n of list) {
        const u = unitOf(d, n);
        if (u) um.set(u, (um.get(u) ?? 0) + 1);
      }
      const units = [...um].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 3);
      return { subjectId, total: list.length, withReason: withR.length, top, careless, units };
    })
    .sort((a, b) => b.total - a.total);
}

/** 실수가 많은 과목인지: 이유를 적은 오답 5개 이상 중 실수가 40% 이상 */
export const isCareless = (p: SubjectPattern | undefined) => !!p && p.withReason >= 5 && p.careless >= 0.4;
