// 자세히 보기: 공부 · 성적 · 운동 · 농구 · 영화 · 음악 · 독서 · 돈. 쌓인 기록에서 계산만 한다 (추측 없음).
import { addDays, diffDays, weekday, WEEKDAYS } from '../study/dates';
import { recordAverage, recordsOf } from '../study/grades';
import { alive, type DateStr, type StudyData } from '../study/model';
import { shotsBetween } from './bb';
import { monthOf, shiftMonth } from './calc';

export interface Stat {
  label: string;
  value: string;
  sub?: string;
}
export interface Rank {
  label: string;
  value: number;
  text: string;
}
export interface Section {
  title: string;
  stats?: Stat[];
  ranks?: Rank[];
  bars?: { label: string; value: number; title?: string }[];
  barFormat?: 'min' | 'won' | 'count' | 'pct';
  note?: string;
}

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 끊기지 않고 이어진 가장 긴 날 수 */
export function longestStreak(dates: Iterable<DateStr>): { days: number; from?: DateStr; to?: DateStr } {
  const ds = [...new Set(dates)].sort();
  let best = { days: 0 } as { days: number; from?: DateStr; to?: DateStr };
  let start = ds[0];
  let run = 0;
  for (let i = 0; i < ds.length; i++) {
    run = i && diffDays(ds[i - 1], ds[i]) === 1 ? run + 1 : 1;
    if (run === 1) start = ds[i];
    if (run > best.days) best = { days: run, from: start, to: ds[i] };
  }
  return best;
}

/** 최근 n달 (오래된 달부터) */
const lastMonths = (today: DateStr, n: number) => Array.from({ length: n }, (_, i) => shiftMonth(monthOf(today), i - n + 1));

export function studyInsights(d: StudyData, today: DateStr): Section[] {
  const ss = alive(d.sessions).filter((s) => s.minutes > 0);
  if (!ss.length) return [];
  const total = sum(ss.map((s) => s.minutes));
  const byDate = new Map<DateStr, number>();
  for (const s of ss) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.minutes);
  const days = [...byDate.keys()].sort();
  const best = [...byDate].sort((a, b) => b[1] - a[1])[0];
  const longest = [...ss].sort((a, b) => b.minutes - a.minutes)[0];
  const streak = longestStreak(days);
  const m0 = monthOf(today);
  const thisM = sum(ss.filter((s) => monthOf(s.date) === m0).map((s) => s.minutes));
  const lastM = sum(ss.filter((s) => monthOf(s.date) === shiftMonth(m0, -1)).map((s) => s.minutes));
  const timed = ss.filter((s) => s.kind !== 'manual');
  const morning = timed.filter((s) => new Date(s.start + 9 * 3_600_000).getUTCHours() < 12);
  const night = timed.filter((s) => new Date(s.start + 9 * 3_600_000).getUTCHours() >= 21 || new Date(s.start + 9 * 3_600_000).getUTCHours() < 4);
  const subj = new Map<string, { min: number; n: number }>();
  for (const s of ss) {
    const k = s.subjectId ?? '';
    const e = subj.get(k) ?? { min: 0, n: 0 };
    subj.set(k, { min: e.min + s.minutes, n: e.n + 1 });
  }
  const wd = Array(7).fill(0) as number[];
  for (const [date, m] of byDate) wd[weekday(date)] += m;
  const weeksSpan = Math.max(1, Math.ceil((diffDays(days[0], today) + 1) / 7));
  const hours = Array(24).fill(0) as number[];
  for (const s of timed) hours[new Date(s.start + 9 * 3_600_000).getUTCHours()] += s.minutes;
  const kinds = { pomo: 0, watch: 0, manual: 0 } as Record<string, number>;
  for (const s of ss) kinds[s.kind] += s.minutes;
  return [
    {
      title: '한눈에',
      stats: [
        { label: '지금까지', value: hm(total), sub: `${days.length}일 · ${ss.length}번` },
        { label: '공부한 날 하루 평균', value: hm(Math.round(total / days.length)) },
        { label: '한 번 평균', value: hm(Math.round(total / ss.length)) },
        { label: '가장 긴 한 번', value: hm(longest.minutes), sub: longest.date },
        { label: '가장 많이 한 날', value: hm(best[1]), sub: best[0] },
        { label: '최장 연속', value: `${streak.days}일`, sub: streak.from && `${streak.from} ~ ${streak.to}` },
        { label: '이번 달', value: hm(thisM), sub: lastM ? `지난달 ${hm(lastM)} (${thisM >= lastM ? '+' : ''}${pct(thisM - lastM, lastM)}%)` : undefined },
        { label: '처음 기록', value: days[0], sub: `${diffDays(days[0], today) + 1}일 전` },
        ...(timed.length >= 5 && morning.length + night.length > 0 ? [{ label: '아침형 · 밤형', value: morning.length >= night.length ? '아침형' : '밤형', sub: `오전 ${pct(morning.length, timed.length)}% · 밤 ${pct(night.length, timed.length)}%` }] : []),
      ],
    },
    {
      title: '과목별 (전체)',
      ranks: [...subj].sort((a, b) => b[1].min - a[1].min).map(([id, e]) => ({ label: d.subjects[id]?.name ?? '과목 없음', value: e.min, text: `${hm(e.min)} · ${pct(e.min, total)}% · ${e.n}번 · 한 번 ${hm(Math.round(e.min / e.n))}` })),
    },
    { title: '달마다 (최근 12달)', bars: lastMonths(today, 12).map((m) => ({ label: `${Number(m.slice(5))}월`, title: m, value: sum(ss.filter((s) => monthOf(s.date) === m).map((s) => s.minutes)) })), barFormat: 'min' },
    { title: '요일마다 (한 주 평균)', bars: [1, 2, 3, 4, 5, 6, 0].map((w) => ({ label: WEEKDAYS[w], value: Math.round(wd[w] / weeksSpan) })), barFormat: 'min' },
    ...(timed.length >= 3 ? [{ title: '시작한 시각 (타이머 기록)', bars: hours.map((m, h) => ({ label: `${h}`, title: `${h}시`, value: m })).filter((x, i) => i >= 5 || x.value > 0), barFormat: 'min' as const }] : []),
    {
      title: '어떻게 쟀나',
      ranks: [
        ['뽀모도로', kinds.pomo],
        ['스톱워치', kinds.watch],
        ['직접 넣음', kinds.manual],
      ]
        .filter(([, v]) => (v as number) > 0)
        .map(([k, v]) => ({ label: k as string, value: v as number, text: `${hm(v as number)} · ${pct(v as number, total)}%` })),
    },
  ];
}

export function gradeInsights(d: StudyData): Section[] {
  const out: Section[] = [];
  for (const kind of ['school', 'mock'] as const) {
    const rs = recordsOf(d, kind);
    if (!rs.length) continue;
    const subjects = [...new Set(rs.flatMap((r) => r.scores.map((s) => s.subject)))];
    const ranks: Rank[] = [];
    for (const name of subjects) {
      const gs = rs.map((r) => r.scores.find((s) => s.subject === name)?.grade).filter((g): g is number => typeof g === 'number');
      if (!gs.length) continue;
      const delta = gs.length > 1 ? gs[gs.length - 2] - gs[gs.length - 1] : 0;
      ranks.push({ label: name, value: 10 - gs[gs.length - 1], text: `최근 ${gs[gs.length - 1]}등급 · 최고 ${Math.min(...gs)}등급${delta ? ` · 지난번보다 ${delta > 0 ? `${delta}등급 오름` : `${-delta}등급 내림`}` : ''}` });
    }
    const avgs = rs.map((r) => recordAverage(r, 'grade')).filter((x): x is number => x !== null);
    out.push({
      title: kind === 'school' ? '내신' : '모의고사',
      stats: [
        { label: '넣은 시험', value: `${rs.length}번` },
        ...(avgs.length
          ? [
              { label: '평균 등급 (최근)', value: `${avgs[avgs.length - 1]}`, sub: avgs.length > 1 ? `처음 ${avgs[0]}` : undefined },
              { label: '가장 좋았던 평균', value: `${Math.min(...avgs)}` },
            ]
          : []),
      ],
      ranks: ranks.sort((a, b) => b.value - a.value),
    });
  }
  const papers = alive(d.papers);
  if (papers.length) {
    const wrong = sum(papers.map((p) => p.wrong.length));
    out.push({
      title: '혼자 푼 기출',
      stats: [
        { label: '푼 시험', value: `${papers.length}회` },
        { label: '틀린 문항', value: `${wrong}개`, sub: `한 번 평균 ${Math.round((wrong / papers.length) * 10) / 10}개` },
        { label: '걸린 시간', value: hm(sum(papers.map((p) => p.minutes ?? 0))) },
      ],
    });
  }
  const notes = alive(d.notes);
  if (notes.length)
    out.push({
      title: '오답',
      stats: [
        { label: '넣은 오답', value: `${notes.length}개` },
        { label: '해결', value: `${notes.filter((n) => n.learned).length}개`, sub: `${pct(notes.filter((n) => n.learned).length, notes.length)}%` },
        { label: '가장 많이 틀린 문제', value: `${Math.max(...notes.map((n) => n.wrong))}번` },
      ],
    });
  return out;
}

export function fitnessInsights(d: StudyData, today: DateStr): Section[] {
  const ws = alive(d.workouts);
  if (!ws.length) return [];
  const out: Section[] = [];
  const total = sum(ws.map((w) => w.minutes ?? 0));
  const days = [...new Set(ws.map((w) => w.date))];
  const kinds = new Map<string, { n: number; min: number }>();
  for (const w of ws) kinds.set(w.kind, { n: (kinds.get(w.kind)?.n ?? 0) + 1, min: (kinds.get(w.kind)?.min ?? 0) + (w.minutes ?? 0) });
  const wd = Array(7).fill(0) as number[];
  for (const day of days) wd[weekday(day)]++;
  out.push({
    title: '운동',
    stats: [
      { label: '지금까지', value: `${ws.length}번`, sub: `${days.length}일 · ${hm(total)}` },
      { label: '최장 연속', value: `${longestStreak(days).days}일` },
      { label: '가장 많이 한 요일', value: `${WEEKDAYS[wd.indexOf(Math.max(...wd))]}요일` },
      { label: '최근 30일', value: `${new Set(ws.filter((w) => w.date > addDays(today, -30)).map((w) => w.date)).size}일` },
    ],
    ranks: [...kinds].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => ({ label: k, value: e.n, text: `${e.n}번${e.min ? ` · ${hm(e.min)}` : ''}` })),
  });
  const bb = ws.filter((w) => w.kind === '농구' && w.bb);
  if (bb.length) {
    const s = shotsBetween(d, '0000-01-01', today);
    const games = bb.filter((w) => w.bb!.mode === 'game');
    const pts = games.map((w) => w.bb!.pts).filter((x): x is number => typeof x === 'number');
    const items = new Map<string, { m: number; a: number }>();
    for (const w of bb) for (const it of w.bb!.items ?? []) if (it.att) items.set(it.name, { m: (items.get(it.name)?.m ?? 0) + (it.made ?? 0), a: (items.get(it.name)?.a ?? 0) + it.att });
    out.push({
      title: '농구',
      stats: [
        { label: '연습 · 경기', value: `${bb.length - games.length} · ${games.length}번` },
        ...(s.fg.a ? [{ label: '2점 성공률', value: `${pct(s.fg.m, s.fg.a)}%`, sub: `${s.fg.m}/${s.fg.a}` }] : []),
        ...(s.tp.a ? [{ label: '3점 성공률', value: `${pct(s.tp.m, s.tp.a)}%`, sub: `${s.tp.m}/${s.tp.a}` }] : []),
        ...(s.ft.a ? [{ label: '자유투 성공률', value: `${pct(s.ft.m, s.ft.a)}%`, sub: `${s.ft.m}/${s.ft.a}` }] : []),
        ...(pts.length ? [{ label: '경기 평균 득점', value: `${Math.round((sum(pts) / pts.length) * 10) / 10}점`, sub: `최고 ${Math.max(...pts)}점` }] : []),
        { label: '던진 슛', value: `${s.fg.a + s.tp.a + s.ft.a}개` },
      ],
      ranks: [...items].sort((a, b) => b[1].a - a[1].a).map(([k, e]) => ({ label: k, value: e.a, text: `${e.m}/${e.a} · ${pct(e.m, e.a)}%` })),
    });
  }
  return out;
}

export function hobbyInsights(d: StudyData, today: DateStr): Section[] {
  const out: Section[] = [];
  const mv = alive(d.movies).filter((m) => m.status === 'watched');
  if (mv.length) {
    const rated = mv.filter((m) => m.rating);
    const count = (key: 'genre' | 'director' | 'nation' | 'where') => {
      const m = new Map<string, number>();
      for (const x of mv)
        for (const v of (x[key] ?? '')
          .split(/[,·]/)
          .map((t) => t.trim())
          .filter(Boolean))
          m.set(v, (m.get(v) ?? 0) + 1);
      return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
    };
    const year = today.slice(0, 4);
    const genres = count('genre');
    out.push({
      title: '영화',
      stats: [
        { label: '본 영화', value: `${mv.length}편`, sub: `올해 ${mv.filter((m) => m.watched?.startsWith(year)).length}편` },
        { label: '평균 별점', value: rated.length ? `★ ${Math.round((sum(rated.map((m) => m.rating!)) / rated.length) * 10) / 10}` : '—' },
        { label: '5점 준 영화', value: `${rated.filter((m) => m.rating === 5).length}편` },
        { label: '또 본 영화', value: `${mv.filter((m) => m.again?.length).length}편` },
        ...(genres[0] ? [{ label: '가장 많이 본 장르', value: genres[0][0], sub: `${genres[0][1]}편` }] : []),
      ],
      ranks: [...count('where'), ...count('director').map(([k, n]) => [`감독 ${k}`, n] as [string, number])].map(([k, n]) => ({ label: k, value: n, text: `${n}편` })),
      bars: lastMonths(today, 12).map((m) => ({ label: `${Number(m.slice(5))}월`, title: m, value: mv.filter((x) => x.watched && monthOf(x.watched) === m).length })),
      barFormat: 'count',
    });
  }
  const recs = alive(d.records).filter((r) => r.status === 'have');
  if (recs.length) {
    const listens = recs.flatMap((r) => r.listens ?? []);
    const artists = new Map<string, number>();
    for (const r of recs) artists.set(r.artist, (artists.get(r.artist) ?? 0) + 1);
    const spent = sum(recs.map((r) => r.price ?? 0));
    out.push({
      title: '음악',
      stats: [
        { label: '가진 음반', value: `${recs.length}장`, sub: `LP ${recs.filter((r) => r.format === 'lp').length}장` },
        { label: '모은 값', value: won(spent), sub: recs.some((r) => r.price) ? `한 장 평균 ${won(spent / recs.filter((r) => r.price).length)}` : undefined },
        { label: '들은 횟수', value: `${listens.length}번`, sub: `올해 ${listens.filter((x) => x.startsWith(today.slice(0, 4))).length}번` },
        { label: '아티스트', value: `${artists.size}팀` },
      ],
      ranks: [...recs]
        .filter((r) => r.listens?.length)
        .sort((a, b) => (b.listens?.length ?? 0) - (a.listens?.length ?? 0))
        .slice(0, 8)
        .map((r) => ({ label: `${r.artist} — ${r.title}`, value: r.listens!.length, text: `${r.listens!.length}번` })),
    });
  }
  const books = alive(d.reads);
  if (books.length) {
    const done = books.filter((b) => b.status === 'done');
    const spans = done.filter((b) => b.started && b.finished).map((b) => diffDays(b.started!, b.finished!) + 1);
    const pages = sum(done.map((b) => b.pages ?? 0));
    out.push({
      title: '독서',
      stats: [
        { label: '다 읽은 책', value: `${done.length}권`, sub: `올해 ${done.filter((b) => b.finished?.startsWith(today.slice(0, 4))).length}권` },
        { label: '읽은 쪽', value: `${pages.toLocaleString('ko-KR')}쪽` },
        ...(spans.length ? [{ label: '한 권에 걸린 날', value: `평균 ${Math.round(sum(spans) / spans.length)}일` }] : []),
        { label: '읽는 중', value: `${books.filter((b) => b.status === 'reading').length}권` },
      ],
    });
  }
  const games = alive(d.games);
  if (games.length)
    out.push({
      title: '게임',
      stats: [
        { label: '끝낸 게임', value: `${games.filter((g) => g.status === 'done').length}개` },
        { label: '한 시간', value: `${Math.round(sum(games.map((g) => g.hours ?? 0)))}시간` },
        { label: '하는 중', value: `${games.filter((g) => g.status === 'playing').length}개` },
      ],
    });
  const places = alive(d.places);
  if (places.length)
    out.push({
      title: '여행',
      stats: [
        { label: '다녀온 곳', value: `${places.filter((p) => p.status === 'visited').length}곳` },
        { label: '가 볼 곳', value: `${places.filter((p) => p.status === 'want').length}곳` },
        { label: '지역', value: `${new Set(places.map((p) => p.region).filter(Boolean)).size}곳` },
      ],
    });
  return out;
}

export function moneyInsights(d: StudyData, today: DateStr): Section[] {
  const tx = alive(d.moneyTx);
  if (!tx.length) return [];
  const out = tx.filter((t) => t.type === 'out');
  const months = lastMonths(today, 12);
  const monthly = months.map((m) => sum(out.filter((t) => monthOf(t.date) === m).map((t) => t.amount)));
  const used = monthly.filter((x) => x > 0);
  const cats = new Map<string, number>();
  for (const t of out) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  const biggest = [...out].sort((a, b) => b.amount - a.amount)[0];
  const total = sum(out.map((t) => t.amount));
  const wd = Array(7).fill(0) as number[];
  for (const t of out) wd[weekday(t.date)] += t.amount;
  return [
    {
      title: '돈',
      stats: [
        { label: '한 달 평균 쓴 돈', value: used.length ? won(sum(used) / used.length) : '—', sub: `최근 ${used.length}달` },
        { label: '지금까지 쓴 돈', value: won(total) },
        { label: '들어온 돈', value: won(sum(tx.filter((t) => t.type === 'in').map((t) => t.amount))) },
        ...(biggest ? [{ label: '가장 큰 지출', value: won(biggest.amount), sub: `${biggest.memo || biggest.category} · ${biggest.date}` }] : []),
        { label: '돈을 가장 많이 쓴 요일', value: `${WEEKDAYS[wd.indexOf(Math.max(...wd))]}요일` },
        { label: '모은 돈', value: won(sum(alive(d.savings).flatMap((g) => g.deposits.map((x) => x.amount)))) },
      ],
      ranks: [...cats].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, text: `${won(v)} · ${pct(v, total)}%` })),
      bars: months.map((m, i) => ({ label: `${Number(m.slice(5))}월`, title: m, value: monthly[i] })),
      barFormat: 'won',
    },
  ];
}

/** 올해 결산: 그해 기록만 세어서 (없는 칸은 빼고) */
export function yearReview(d: StudyData, year: string): Stat[] {
  const inY = (s?: string) => !!s && s.startsWith(year);
  const top = <T>(xs: T[], key: (x: T) => string, w: (x: T) => number = () => 1) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + w(x));
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const best = <T extends { rating?: number }>(xs: T[], name: (x: T) => string) => {
    const r = xs.filter((x) => x.rating).sort((a, b) => b.rating! - a.rating!)[0];
    return r ? `최고: ${name(r)} ★${r.rating}` : undefined;
  };
  const out: Stat[] = [];
  const ss = alive(d.sessions).filter((s) => inY(s.date) && s.minutes > 0);
  if (ss.length) {
    const sub = top(
      ss.filter((s) => s.subjectId && d.subjects[s.subjectId]),
      (s) => d.subjects[s.subjectId!].name,
      (s) => s.minutes,
    );
    out.push({ label: '공부한 시간', value: hm(sum(ss.map((s) => s.minutes))), sub: sub ? `가장 많이: ${sub}` : undefined });
    out.push({ label: '공부한 날', value: `${new Set(ss.map((s) => s.date)).size}일`, sub: `가장 길게 이어서 ${longestStreak(ss.map((s) => s.date)).days}일` });
  }
  const ws = alive(d.workouts).filter((w) => inY(w.date));
  if (ws.length) out.push({ label: '운동한 날', value: `${new Set(ws.map((w) => w.date)).size}일`, sub: `가장 많이: ${top(ws, (w) => w.kind)}` });
  const mv = alive(d.movies).filter((m) => m.status === 'watched' && inY(m.watched));
  if (mv.length) out.push({ label: '본 영화', value: `${mv.length}편`, sub: best(mv, (m) => m.title) });
  const bk = alive(d.reads).filter((b) => b.status === 'done' && inY(b.finished));
  if (bk.length) out.push({ label: '읽은 책', value: `${bk.length}권`, sub: best(bk, (b) => b.title) });
  const gm = alive(d.games).filter((g) => g.status === 'done' && inY(g.finished));
  if (gm.length) out.push({ label: '끝낸 게임', value: `${gm.length}개`, sub: best(gm, (g) => g.title) });
  const rc = alive(d.records).filter((r) => r.status === 'have' && inY(r.bought));
  if (rc.length) out.push({ label: '들인 음반', value: `${rc.length}장`, sub: `가장 많이: ${top(rc, (r) => r.artist)}` });
  const pl = alive(d.places).filter((p) => p.status === 'visited' && inY(p.visited));
  if (pl.length) out.push({ label: '다녀온 곳', value: `${pl.length}곳`, sub: best(pl, (p) => p.name) });
  const dy = alive(d.diary).filter((e) => inY(e.id));
  if (dy.length) out.push({ label: '쓴 일기', value: `${dy.length}편` });
  const tx = alive(d.moneyTx).filter((t) => t.type === 'out' && inY(t.date));
  if (tx.length)
    out.push({
      label: '쓴 돈',
      value: won(sum(tx.map((t) => t.amount))),
      sub: `가장 많이: ${top(
        tx,
        (t) => t.category,
        (t) => t.amount,
      )}`,
    });
  return out;
}
