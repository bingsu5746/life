// 한 해 결산: 그해 공부 · 일기 · 영화 · 음반 · 책 · 게임 · 농구 · 돈을 한 장으로
import { alive, type StudyData } from '../study/model';

export interface Recap {
  year: number;
  studyMin: number;
  topSubject?: { name: string; min: number };
  studyDays: number;
  diary: number;
  mood?: number;
  movies: number;
  bestMovie?: { title: string; rating: number };
  books: number;
  games: number;
  records: number;
  listens: number;
  topRecord?: { title: string; artist: string; n: number };
  bbDays: number;
  shots: { m: number; a: number };
  spent: number;
  topSpend?: { category: string; amount: number };
}

export function recap(d: StudyData, year: number): Recap {
  const y = String(year);
  const ses = alive(d.sessions).filter((s) => s.date.startsWith(y));
  const bySub = new Map<string, number>();
  for (const s of ses) if (s.subjectId) bySub.set(s.subjectId, (bySub.get(s.subjectId) ?? 0) + s.minutes);
  const top = [...bySub].sort((a, b) => b[1] - a[1])[0];
  const diary = alive(d.diary).filter((e) => e.id.startsWith(y));
  const moods = diary.filter((e) => e.mood).map((e) => e.mood!);
  const movies = alive(d.movies).filter((m) => m.status === 'watched' && m.watched?.startsWith(y));
  const best = movies.filter((m) => m.rating).sort((a, b) => b.rating! - a.rating!)[0];
  const books = alive(d.reads).filter((r) => r.status === 'done' && (r.log?.length ? r.log[r.log.length - 1].date.startsWith(y) : new Date(r.updatedAt).getFullYear() === year));
  const games = alive(d.games).filter((g) => g.status === 'done' && g.finished?.startsWith(y));
  const recs = alive(d.records);
  const listenOf = (r: (typeof recs)[number]) => (r.listens ?? []).filter((x) => x.startsWith(y)).length;
  const topRec = recs.map((r) => ({ r, n: listenOf(r) })).sort((a, b) => b.n - a.n)[0];
  const bb = alive(d.workouts).filter((w) => w.kind === '농구' && w.date.startsWith(y));
  const shots = bb.reduce((a, w) => ({ m: a.m + (w.bb?.shots?.filter((s) => s[2]).length ?? 0), a: a.a + (w.bb?.shots?.length ?? 0) }), { m: 0, a: 0 });
  const out = alive(d.moneyTx).filter((t) => t.type === 'out' && t.date.startsWith(y));
  const byCat = new Map<string, number>();
  for (const t of out) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
  const topCat = [...byCat].sort((a, b) => b[1] - a[1])[0];
  return {
    year,
    studyMin: ses.reduce((a, s) => a + s.minutes, 0),
    topSubject: top && d.subjects[top[0]] ? { name: d.subjects[top[0]].name, min: top[1] } : undefined,
    studyDays: new Set(ses.map((s) => s.date)).size,
    diary: diary.length,
    mood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : undefined,
    movies: movies.length,
    bestMovie: best ? { title: best.title, rating: best.rating! } : undefined,
    books: books.length,
    games: games.length,
    records: recs.filter((r) => r.status === 'have' && (r.bought?.startsWith(y) || new Date(r.created).getFullYear() === year)).length,
    listens: recs.reduce((a, r) => a + listenOf(r), 0),
    topRecord: topRec && topRec.n ? { title: topRec.r.title, artist: topRec.r.artist, n: topRec.n } : undefined,
    bbDays: new Set(bb.map((w) => w.date)).size,
    shots,
    spent: out.reduce((a, t) => a + t.amount, 0),
    topSpend: topCat ? { category: topCat[0], amount: topCat[1] } : undefined,
  };
}

/** 카드에 쓸 줄들 (있는 것만) */
export function recapLines(r: Recap): { icon: string; label: string; value: string; sub?: string }[] {
  const h = (m: number) => (m >= 60 ? `${Math.round(m / 60).toLocaleString('ko-KR')}시간` : `${m}분`);
  const out: { icon: string; label: string; value: string; sub?: string }[] = [];
  if (r.studyMin) out.push({ icon: '📚', label: '공부', value: h(r.studyMin), sub: `${r.studyDays}일${r.topSubject ? ` · 가장 많이: ${r.topSubject.name} ${h(r.topSubject.min)}` : ''}` });
  if (r.diary) out.push({ icon: '📔', label: '일기', value: `${r.diary}편`, sub: r.mood ? `평균 기분 ${r.mood} / 5` : undefined });
  if (r.movies) out.push({ icon: '🎬', label: '본 영화', value: `${r.movies}편`, sub: r.bestMovie ? `최고: ${r.bestMovie.title} ★${r.bestMovie.rating}` : undefined });
  if (r.books) out.push({ icon: '📖', label: '읽은 책', value: `${r.books}권` });
  if (r.listens || r.records) out.push({ icon: '💿', label: '음악', value: `${r.listens}번 들음`, sub: `${r.records ? `새 음반 ${r.records}장` : ''}${r.topRecord ? `${r.records ? ' · ' : ''}가장 많이: ${r.topRecord.title} (${r.topRecord.n}번)` : ''}` || undefined });
  if (r.games) out.push({ icon: '🎮', label: '끝낸 게임', value: `${r.games}개` });
  if (r.bbDays) out.push({ icon: '🏀', label: '농구', value: `${r.bbDays}일`, sub: r.shots.a ? `슛 ${r.shots.a}개 중 ${r.shots.m}개 (${Math.round((r.shots.m / r.shots.a) * 100)}%)` : undefined });
  if (r.spent) out.push({ icon: '💰', label: '쓴 돈', value: `${r.spent.toLocaleString('ko-KR')}원`, sub: r.topSpend ? `가장 많이: ${r.topSpend.category}` : undefined });
  return out;
}
