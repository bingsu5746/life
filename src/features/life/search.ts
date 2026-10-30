// 통합 검색: 이 기기에 있는 모든 기록에서 글자로 찾기 (서버로 보내지 않는다)
import { alive, type StudyData, type Word } from '../study/model';
import { monthOf } from './calc';

export interface Hit {
  /** 어디서 찾았나 (묶음 이름) */
  group: string;
  title: string;
  snippet?: string;
  /** 눌렀을 때 갈 앱 안 주소 */
  to: string;
}

/** 검색어를 앞뒤 공백 없이 소문자로 */
const norm = (s: string) => s.normalize('NFC').toLowerCase();

/** 글 안에서 q 가 처음 나오는 곳 둘레를 잘라 보여 준다 */
export function snippet(text: string, q: string, around = 24): string | undefined {
  const t = text.replace(/\s+/g, ' ');
  const i = norm(t).indexOf(norm(q));
  if (i < 0) return undefined;
  const a = Math.max(0, i - around);
  return `${a > 0 ? '…' : ''}${t.slice(a, i + q.length + around)}${i + q.length + around < t.length ? '…' : ''}`;
}

const has = (q: string, ...fields: (string | undefined)[]) => fields.some((f) => f && norm(f).includes(q));

/** q(두 글자 이상)가 들어 있는 기록들. 묶음마다 최대 limit 개 */
export function searchAll(d: StudyData, words: Record<string, Word>, query: string, limit = 8): Hit[] {
  const q = norm(query.trim());
  if (q.length < 1) return [];
  const out: Hit[] = [];
  const add = (group: string, list: { title: string; text?: string; to: string; fields: (string | undefined)[] }[]) => {
    let n = 0;
    for (const x of list) {
      if (!has(q, ...x.fields)) continue;
      if (n++ >= limit) break;
      const sn = x.text ? snippet(x.text, query.trim()) : undefined;
      out.push({ group, title: x.title, snippet: sn, to: x.to });
    }
  };
  add(
    '일기',
    alive(d.diary)
      .sort((a, b) => b.id.localeCompare(a.id))
      .map((e) => {
        const all = [e.text, ...Object.values(e.parts ?? {})].join('\n');
        return { title: e.title || e.id, text: all, to: `/diary/${e.id}`, fields: [e.title, all] };
      }),
  );
  add(
    '영화',
    alive(d.movies).map((m) => ({
      title: m.title,
      text: [m.comment, m.review, (m.tags ?? []).join(' '), m.director, m.genre].filter(Boolean).join(' · '),
      to: m.status === 'watched' ? '/movies/watched' : '/movies/want',
      fields: [m.title, m.comment, m.review, m.director, m.genre, ...(m.tags ?? [])],
    })),
  );
  add(
    '여행',
    alive(d.places ?? {}).map((p) => ({ title: p.name, text: [p.region, p.note].filter(Boolean).join(' · '), to: '/travel', fields: [p.name, p.region, p.note] })),
  );
  add(
    '게임',
    alive(d.games ?? {}).map((g) => ({ title: g.title, text: [g.platform, g.note].filter(Boolean).join(' · '), to: '/games', fields: [g.title, g.platform, g.note] })),
  );
  add(
    '음악',
    alive(d.records ?? {}).map((r) => ({ title: `${r.artist} — ${r.title}`, text: [r.note, r.shop].filter(Boolean).join(' · '), to: '/music', fields: [r.title, r.artist, r.note] })),
  );
  add(
    '책',
    alive(d.reads).map((b) => ({ title: b.title, text: [b.author, b.comment, b.review].filter(Boolean).join(' · '), to: '/hobby/reading', fields: [b.title, b.author, b.comment, b.review] })),
  );
  add(
    '할 일',
    alive(d.todos).map((t) => ({ title: t.title, to: '/life', fields: [t.title] })),
  );
  add(
    '시험',
    alive(d.exams).map((e) => ({ title: e.name, text: (e.scopes ?? []).flatMap((s) => s.lines.map((l) => l.text)).join(' · '), to: `/exams/${e.id}`, fields: [e.name, ...(e.scopes ?? []).flatMap((s) => s.lines.map((l) => l.text))] })),
  );
  add(
    '수행평가',
    alive(d.assessments).map((a) => ({ title: a.title, text: a.memo, to: '/exams/tasks', fields: [a.title, a.memo] })),
  );
  add(
    '오답',
    alive(d.notes).map((n) => ({ title: n.question.slice(0, 40) || '오답', text: [n.question, n.answer, n.memo].join(' · '), to: '/review', fields: [n.question, n.answer, n.memo, n.myAnswer] })),
  );
  add(
    '암기 카드',
    alive(d.cards).map((c) => ({ title: c.front, text: c.back, to: '/review/cards', fields: [c.front, c.back] })),
  );
  add(
    '단어',
    alive(words).map((w) => ({ title: w.term, text: w.meaning, to: `/words/${w.listId}`, fields: [w.term, w.meaning] })),
  );
  add(
    '문제집',
    alive(d.books).map((b) => ({ title: b.name, to: `/books/${b.id}`, fields: [b.name] })),
  );
  add(
    '운동',
    alive(d.workouts)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((w) => ({ title: `${w.date} ${w.kind}`, text: [w.detail, w.memo].filter(Boolean).join(' · '), to: '/basketball', fields: [w.kind, w.detail, w.memo] })),
  );
  add(
    '취미',
    alive(d.hobbyLogs).map((l) => ({ title: `${l.date} ${d.hobbies[l.hobbyId]?.name ?? '취미'}`, text: l.memo, to: '/hobby', fields: [l.memo, d.hobbies[l.hobbyId]?.name] })),
  );
  add(
    '하고 싶은 것',
    alive(d.wishes).map((w) => ({ title: w.title, text: w.note, to: '/hobby/wish', fields: [w.title, w.note] })),
  );
  add(
    '돈',
    alive(d.moneyTx)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((t) => ({ title: `${t.date} ${t.memo || t.category}`, text: `${t.amount.toLocaleString('ko-KR')}원 · ${t.category}`, to: `/money/${monthOf(t.date)}`, fields: [t.memo, t.category] })),
  );
  return out;
}
