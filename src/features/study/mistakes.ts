// 오답 패턴: 과목마다 어떤 이유로 많이 틀리는지, 어느 단원에서 많이 틀리는지
import { answer } from './review';
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

/** 오답을 넣을 때 과목 추천: 사진에서 읽은 글 → 켜 둔 타이머 → 방금 공부한 과목 → 방금 넣은 오답 순.
 *  확실하지 않으면 null (사람이 고른다). */
export function guessNoteSubject(d: Pick<StudyData, 'subjects' | 'sessions' | 'notes'>, now: number, timerSubject?: Id, text?: string): { id: Id; why: string } | null {
  const subs = alive(d.subjects);
  const ok = (id?: Id) => !!id && subs.some((s) => s.id === id);
  if (text) {
    const latin = (text.match(/[A-Za-z]/g) ?? []).length;
    const hangul = (text.match(/[가-힣]/g) ?? []).length;
    const find = (re: RegExp) => subs.find((s) => re.test(s.name));
    // 글자가 충분하고 영어가 대부분이면 영어 과목
    if (latin + hangul >= 30 && latin / (latin + hangul) > 0.7) {
      const en = find(/영어|english/i);
      if (en) return { id: en.id, why: '사진 글이 영어라서' };
    }
  }
  if (ok(timerSubject)) return { id: timerSubject!, why: '타이머로 공부 중인 과목' };
  const H2 = 2 * 3600_000;
  const recent = alive(d.sessions)
    .filter((s) => ok(s.subjectId) && now - s.end < H2 && s.end <= now + 60_000)
    .sort((a, b) => b.end - a.end)[0];
  if (recent) return { id: recent.subjectId!, why: '방금 공부한 과목' };
  const note = alive(d.notes)
    .filter((n) => ok(n.subjectId) && now - n.created < H2)
    .sort((a, b) => b.created - a.created)[0];
  if (note) return { id: note.subjectId, why: '방금 넣은 오답과 같은 과목' };
  return null;
}

/** 다시 풀기에서 이만큼 연달아 맞히면 졸업 (해결됨) */
export const GRADUATE = 2;

/** 오답 다시 풀기 결과: 단계 간격은 그대로 쓰되, 두 번 연달아 맞히면 바로 해결됨. 틀리면 연속이 0으로 */
export function redoAnswer(n: WrongNote, ok: boolean, today: string, intervals: number[]): WrongNote {
  const next = answer(n, ok, 'redo', today, intervals);
  const okRun = ok ? (n.okRun ?? 0) + 1 : 0;
  return { ...next, okRun: okRun || undefined, learned: next.learned || okRun >= GRADUATE };
}
