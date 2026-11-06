// 이것저것 통계: 쌓인 기록으로 계산만 한다 (추측 없음). 쓸모없어도 재미있는 숫자들
import { addDays, diffDays, weekday, WEEKDAYS } from '../study/dates';
import { alive, type DateStr, type StudyData } from '../study/model';
import { longestStreak, type Section } from './insights';

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${Math.round(m % 60) ? ` ${Math.round(m % 60)}분` : ''}` : `${Math.round(m)}분`);
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** 잠든 시각 → 일어난 시각 (분). 자정 넘기면 하루 더해서 */
export const sleepMinutes = (sleep?: string, wake?: string) => {
  if (!sleep || !wake) return null;
  let m = toMin(wake) - toMin(sleep);
  if (m <= 0) m += 1440;
  return m > 0 && m < 18 * 60 ? m : null;
};
const kst = (ms: number) => new Date(ms + 9 * 3600_000);

export function funInsights(d: StudyData, today: DateStr): Section[] {
  const out: Section[] = [];
  const ses = alive(d.sessions);
  const studyOn = new Map<DateStr, number>();
  for (const s of ses) studyOn.set(s.date, (studyOn.get(s.date) ?? 0) + s.minutes);

  // 1) 잠 · 컨디션과 공부
  const conds = alive(d.conditions);
  const sleepRows = conds.map((c) => ({ date: c.id, m: sleepMinutes(c.sleep, c.wake), mood: c.mood, study: studyOn.get(c.id) ?? 0 })).filter((x) => x.m !== null) as { date: DateStr; m: number; mood?: number; study: number }[];
  if (sleepRows.length >= 3) {
    const long = sleepRows.filter((x) => x.m >= 7 * 60);
    const short = sleepRows.filter((x) => x.m < 6 * 60);
    const mid = sleepRows.filter((x) => x.m >= 6 * 60 && x.m < 7 * 60);
    const latest = [...conds].filter((c) => c.sleep).sort((a, b) => {
      // 밤 12시를 넘긴 시각이 더 늦게
      const k = (t: string) => (toMin(t) < 12 * 60 ? toMin(t) + 1440 : toMin(t));
      return k(b.sleep!) - k(a.sleep!);
    })[0];
    out.push({
      title: '잠과 공부',
      stats: [
        { label: '평균 잠', value: hm(avg(sleepRows.map((x) => x.m))), sub: `${sleepRows.length}일 기록` },
        ...(long.length ? [{ label: '7시간 넘게 잔 날 공부', value: hm(avg(long.map((x) => x.study))), sub: `${long.length}일 평균` }] : []),
        ...(mid.length ? [{ label: '6~7시간 잔 날 공부', value: hm(avg(mid.map((x) => x.study))), sub: `${mid.length}일 평균` }] : []),
        ...(short.length ? [{ label: '6시간 못 잔 날 공부', value: hm(avg(short.map((x) => x.study))), sub: `${short.length}일 평균` }] : []),
        ...(latest ? [{ label: '가장 늦게 잔 날', value: latest.sleep!, sub: latest.id }] : []),
      ],
    });
  }
  const moodRows = conds.filter((c) => c.mood);
  if (moodRows.length >= 3) {
    const by = [1, 2, 3, 4, 5].map((m) => ({ m, xs: moodRows.filter((c) => c.mood === m).map((c) => studyOn.get(c.id) ?? 0) })).filter((x) => x.xs.length);
    out.push({
      title: '아침 컨디션과 공부',
      ranks: by.map((x) => ({ label: `컨디션 ${x.m}`, value: Math.round(avg(x.xs)), text: `${hm(avg(x.xs))} · ${x.xs.length}일` })),
    });
  }

  // 2) 공부 버릇
  if (ses.length >= 3) {
    const byW = WEEKDAYS.map((_, w) => ses.filter((s) => weekday(s.date) === w).reduce((a, s) => a + s.minutes, 0));
    const hours = Array(24).fill(0) as number[];
    for (const s of ses) if (s.start) hours[kst(s.start).getUTCHours()] += s.minutes;
    const bestW = byW.indexOf(Math.max(...byW));
    const bestH = hours.indexOf(Math.max(...hours));
    const longest = [...ses].sort((a, b) => b.minutes - a.minutes)[0];
    const bestDay = [...studyOn].sort((a, b) => b[1] - a[1])[0];
    const night = ses.filter((s) => s.start && (kst(s.start).getUTCHours() >= 23 || kst(s.start).getUTCHours() < 4)).length;
    const early = ses.filter((s) => s.start && kst(s.start).getUTCHours() >= 4 && kst(s.start).getUTCHours() < 7).length;
    const total = ses.reduce((a, s) => a + s.minutes, 0);
    const streak = longestStreak(studyOn.keys());
    const places = new Map<string, number>();
    for (const s of ses) if (s.place) places.set(s.place, (places.get(s.place) ?? 0) + s.minutes);
    const topPlace = [...places].sort((a, b) => b[1] - a[1])[0];
    out.push({
      title: '공부 버릇',
      stats: [
        { label: '공부 가장 많이 한 요일', value: `${WEEKDAYS[bestW]}요일`, sub: hm(byW[bestW]) },
        ...(hours.some(Boolean) ? [{ label: '가장 많이 시작한 시간', value: `${bestH}시대`, sub: hm(hours[bestH]) }] : []),
        { label: '가장 길게 한 번에', value: hm(longest.minutes), sub: longest.date },
        ...(bestDay ? [{ label: '가장 많이 한 날', value: hm(bestDay[1]), sub: bestDay[0] }] : []),
        { label: '가장 길게 이어서 공부', value: `${streak.days}일`, sub: streak.from ? `${streak.from} ~ ${streak.to}` : undefined },
        ...(topPlace ? [{ label: '가장 많이 공부한 곳', value: topPlace[0], sub: hm(topPlace[1]) }] : []),
        { label: '밤 11시~새벽 4시에 시작', value: `${night}번` },
        { label: '새벽 4~7시에 시작', value: `${early}번` },
      ],
    });
    // 쓸모없는 환산
    out.push({
      title: '모두 공부한 시간을 바꿔 보면',
      stats: [
        { label: '모두', value: hm(total) },
        { label: '2시간짜리 영화', value: `${Math.floor(total / 120).toLocaleString('ko-KR')}편`, sub: '을 볼 시간' },
        { label: '서울 → 부산 KTX(약 2시간 40분)', value: `${Math.floor(total / 160).toLocaleString('ko-KR')}번` },
        { label: '하루(24시간)로', value: `${(total / 1440).toFixed(1)}일` },
        { label: '수능(국어~탐구 약 6시간)', value: `${(total / 360).toFixed(1)}번` },
      ],
      note: '이동 시간 · 시험 시간은 대략 잡은 값이에요.',
    });
  }

  // 3) 오답 · 단어
  const notes = alive(d.notes);
  if (notes.length) {
    const reasons = new Map<string, number>();
    for (const n of notes) if (n.reason) reasons.set(n.reason, (reasons.get(n.reason) ?? 0) + 1);
    const bySub = new Map<string, number>();
    for (const n of notes) bySub.set(d.subjects[n.subjectId]?.name ?? '과목', (bySub.get(d.subjects[n.subjectId]?.name ?? '과목') ?? 0) + 1);
    out.push({
      title: '오답',
      stats: [
        { label: '모은 오답', value: `${notes.length}문제` },
        { label: '다 익힌 오답', value: `${notes.filter((n) => n.learned).length}문제` },
      ],
      ranks: [...bySub].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, text: `${v}문제` })),
    });
  }

  // 4) 돈
  const tx = alive(d.moneyTx);
  const outs = tx.filter((t) => t.type === 'out');
  if (outs.length >= 3) {
    const byDay = new Map<DateStr, number>();
    for (const t of outs) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
    const big = [...byDay].sort((a, b) => b[1] - a[1])[0];
    const one = [...outs].sort((a, b) => b.amount - a.amount)[0];
    const byW = WEEKDAYS.map((_, w) => outs.filter((t) => weekday(t.date) === w).reduce((a, t) => a + t.amount, 0));
    const w = byW.indexOf(Math.max(...byW));
    const cafe = outs.filter((t) => t.category === '간식·카페').reduce((a, t) => a + t.amount, 0);
    const days = tx.length ? diffDays([...tx].sort((a, b) => a.date.localeCompare(b.date))[0].date, today) + 1 : 0;
    const noSpend = days ? days - byDay.size : 0;
    out.push({
      title: '돈 버릇',
      stats: [
        { label: '가장 많이 쓴 날', value: won(big[1]), sub: big[0] },
        { label: '한 번에 가장 크게', value: won(one.amount), sub: `${one.date} · ${one.memo || one.category}` },
        { label: '돈 가장 많이 쓴 요일', value: `${WEEKDAYS[w]}요일`, sub: won(byW[w]) },
        ...(cafe ? [{ label: '간식 · 카페에 모두', value: won(cafe), sub: `떡볶이(4,500원)로 ${Math.floor(cafe / 4500)}그릇` }] : []),
        ...(days ? [{ label: '한 푼도 안 쓴 날', value: `${noSpend}일`, sub: `${days}일 중` }] : []),
      ],
      note: '떡볶이 값은 대략 잡은 값이에요.',
    });
  }

  // 5) 일기
  const diary = alive(d.diary).filter((e) => !e.auto);
  if (diary.length >= 3) {
    const lens = diary.map((e) => ({ id: e.id, n: (e.text + Object.values(e.parts ?? {}).join('')).replace(/\s/g, '').length }));
    const longest = [...lens].sort((a, b) => b.n - a.n)[0];
    const words = new Map<string, number>();
    for (const e of diary)
      for (const w of e.text.split(/[^가-힣a-zA-Z]+/))
        if (w.length >= 2 && !STOP.has(w)) words.set(w, (words.get(w) ?? 0) + 1);
    const top = [...words].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const streak = longestStreak(diary.map((e) => e.id));
    const moods = diary.filter((e) => e.mood);
    out.push({
      title: '일기',
      stats: [
        { label: '쓴 일기', value: `${diary.length}편` },
        { label: '모두 쓴 글자', value: `${lens.reduce((a, x) => a + x.n, 0).toLocaleString('ko-KR')}자` },
        { label: '가장 길게 쓴 날', value: `${longest.n.toLocaleString('ko-KR')}자`, sub: longest.id },
        { label: '가장 길게 이어서 씀', value: `${streak.days}일` },
        ...(moods.length ? [{ label: '평균 기분', value: `${avg(moods.map((e) => e.mood!)).toFixed(1)} / 5` }] : []),
        { label: '사진 · 영상', value: `${diary.reduce((a, e) => a + (e.photos?.length ?? 0) + (e.videos?.length ?? 0), 0)}개` },
      ],
      ranks: top.map(([k, v]) => ({ label: k, value: v, text: `${v}번` })),
      note: '순위: 일기에 가장 많이 쓴 낱말 (두 글자 넘는 것)',
    });
  }

  // 6) 운동 · 취미
  const wk = alive(d.workouts);
  if (wk.length >= 2) {
    const kinds = new Map<string, number>();
    for (const w of wk) kinds.set(w.kind, (kinds.get(w.kind) ?? 0) + (w.minutes ?? 0));
    const dist = wk.reduce((a, w) => a + (w.distance ?? 0), 0);
    out.push({
      title: '운동',
      stats: [
        { label: '모두 운동', value: hm(wk.reduce((a, w) => a + (w.minutes ?? 0), 0)), sub: `${wk.length}번` },
        ...(dist ? [{ label: '달리고 걸은 거리', value: `${dist.toFixed(1)}km`, sub: `마라톤(42.195km) ${(dist / 42.195).toFixed(1)}번` }] : []),
        { label: '가장 길게 이어서 운동', value: `${longestStreak(wk.map((w) => w.date)).days}일` },
      ],
      ranks: [...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, text: hm(v) })),
    });
  }
  const movies = alive(d.movies).filter((m) => m.status === 'watched');
  const reads = alive(d.reads).filter((r) => r.status === 'done');
  const records = alive(d.records ?? {}).filter((r) => r.status === 'have');
  if (movies.length || reads.length || records.length) {
    const listens = records.map((r) => ({ r, n: r.listens?.length ?? 0 })).sort((a, b) => b.n - a.n)[0];
    out.push({
      title: '영화 · 책 · 음악',
      stats: [
        ...(movies.length ? [{ label: '본 영화', value: `${movies.length}편`, sub: movies.some((m) => m.rating) ? `평균 별점 ${avg(movies.filter((m) => m.rating).map((m) => m.rating!)).toFixed(1)}` : undefined }] : []),
        ...(reads.length ? [{ label: '다 읽은 책', value: `${reads.length}권`, sub: reads.some((r) => r.pages) ? `${reads.reduce((a, r) => a + (r.pages ?? 0), 0).toLocaleString('ko-KR')}쪽` : undefined }] : []),
        ...(records.length ? [{ label: '가진 음반', value: `${records.length}장` }] : []),
        ...(listens && listens.n ? [{ label: '가장 많이 들은 음반', value: listens.r.title, sub: `${listens.n}번` }] : []),
      ],
    });
  }

  // 7) 앱 쓴 기간
  const first = [...ses.map((s) => s.date), ...diary.map((e) => e.id), ...tx.map((t) => t.date)].sort()[0];
  if (first) {
    const days = diffDays(first, today) + 1;
    const active = new Set([...ses.map((s) => s.date), ...diary.map((e) => e.id), ...tx.map((t) => t.date), ...wk.map((w) => w.date)]);
    out.push({
      title: '이 앱과 함께',
      stats: [
        { label: '첫 기록', value: first, sub: `${days}일째` },
        { label: '뭐라도 기록한 날', value: `${active.size}일`, sub: `${Math.round((active.size / days) * 100)}%` },
        { label: '최근 7일 기록한 날', value: `${Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((x) => active.has(x)).length}일` },
      ],
    });
  }
  return out;
}

/** 일기 낱말 순위에서 뺄 흔한 말 */
const STOP = new Set(['오늘', '그리고', '그래서', '근데', '진짜', '너무', '하고', '했다', '했는데', '있었다', '없었다', '같다', '그냥', '정말', '나는', '내가', '것도', '것을', '것이', '이제', '그런데', '하는', '해서', '했어', '있는', '없는', '아니', '많이', '조금', '좀', '거의']);
