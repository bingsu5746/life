// 내 학교 (나이스): 설정에서 학교·학년·반 → 시간표 가져오기 · 휴업일 넣기. 오늘 화면엔 급식 · 오늘 학교 일정, 시험 화면엔 다가오는 시험 일정
import { useEffect, useState } from 'react';
import { isLoggedIn, schoolInfo, type SchoolEvent, type SchoolMeal } from '../auth/api';
import { addDays, shortDate, weekStart } from './dates';
import { alive, newId, SUBJECT_COLORS, type Exam } from './model';
import { examEvents, matchSubject, offDays, weekPattern } from './school';
import { getStudy, put, putMany, setSettings, useStudy } from './store';
import { Field, toast, useToday } from './ui';

type Want = 'meals' | 'events' | 'timetable';

/** 같은 요청은 이 기기에서 3시간 동안 다시 묻지 않는다 */
function cachedSchool(body: { name: string; grade?: number; cls?: string; from: string; to: string; want: Want[] }) {
  const k = `my-study.school.${JSON.stringify(body)}`;
  try {
    const c = JSON.parse(sessionStorage.getItem(k) ?? 'null') as { at: number; v: Awaited<ReturnType<typeof schoolInfo>> } | null;
    if (c && Date.now() - c.at < 3 * 3_600_000) return Promise.resolve(c.v);
  } catch {
    /* 저장소를 못 쓰면 그냥 받는다 */
  }
  return schoolInfo(body).then((v) => {
    try {
      sessionStorage.setItem(k, JSON.stringify({ at: Date.now(), v }));
    } catch {
      /* 무시 */
    }
    return v;
  });
}

/** 학교 정보 받기 (로그인 · 학교를 정했을 때만) */
export function useSchoolData(from: string, to: string, want: Want[]) {
  const d = useStudy();
  const sc = d.settings.school;
  const [data, setData] = useState<{ meals?: SchoolMeal[]; events?: SchoolEvent[] } | null>(null);
  const key = sc && isLoggedIn() ? `${sc.name}|${from}|${to}|${want.join()}` : '';
  useEffect(() => {
    if (!key || !sc) return;
    let live = true;
    cachedSchool({ name: sc.name, from, to, want })
      .then((r) => live && setData(r))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? data : null;
}

/** 오늘 화면: 급식(오후 2시가 넘으면 다음 날 것) · 오늘 학교 일정 */
export function SchoolToday({ today }: { today: string }) {
  const data = useSchoolData(today, addDays(today, 3), ['meals', 'events']);
  if (!data) return null;
  const afterLunch = new Date().getHours() >= 14;
  const meal = (data.meals ?? []).find((m) => (afterLunch ? m.date > today : m.date >= today) && m.kind === '중식') ?? (data.meals ?? []).find((m) => (afterLunch ? m.date > today : m.date >= today));
  const events = (data.events ?? []).filter((e) => e.date === today);
  if (!meal && !events.length) return null;
  return (
    <section className="st-card sc-today">
      {events.length > 0 && <p className="sc-event">오늘 학교: {events.map((e) => e.name).join(' · ')}</p>}
      {meal && (
        <div>
          <small className="aw-label">
            {meal.date === today ? '오늘' : shortDate(meal.date)} {meal.kind}
          </small>
          <p className="sc-meal">{meal.dishes.join(' · ')}</p>
        </div>
      )}
    </section>
  );
}

/** 시험 화면: 앞으로 두 달의 학교 시험 일정 → 「시험으로 넣기」 */
export function SchoolExams({ today }: { today: string }) {
  const d = useStudy();
  const data = useSchoolData(today, addDays(today, 60), ['events']);
  if (!data?.events) return null;
  const have = alive(d.exams);
  const list = examEvents(data.events).filter((e) => !have.some((x) => x.date === e.date));
  if (!list.length) return null;
  return (
    <section className="st-card">
      <small className="aw-label">학교 일정에 있는 시험</small>
      {list.map((e) => (
        <div key={e.date} className="st-item">
          <div className="st-item-main">
            <div className="st-item-title">{e.name}</div>
            <div className="st-item-sub">
              {shortDate(e.date)}
              {e.end ? ` ~ ${shortDate(e.end)}` : ''}
            </div>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => {
              put('exams', { id: newId(), name: e.name, date: e.date, end: e.end, kind: /지필|고사/.test(e.name) ? 'school' : 'mock' } as Exam);
              toast('시험으로 넣었어요. 과목 범위를 넣어 주세요');
            }}
          >
            시험으로 넣기
          </button>
        </div>
      ))}
    </section>
  );
}

/** 설정: 학교 · 학년 · 반, 시간표 가져오기, 휴업일 넣기 */
export function SchoolSettings() {
  const d = useStudy();
  const sc = d.settings.school;
  const [name, setName] = useState(sc?.name ?? '재현고등학교');
  const [grade, setGrade] = useState(sc?.grade ?? 1);
  const [cls, setCls] = useState(sc?.cls ?? '');
  const [busy, setBusy] = useState('');
  const changed = !sc || name.trim() !== sc.name || grade !== (sc?.grade ?? 1) || cls !== (sc?.cls ?? '');
  const today = useToday();

  async function importTimetable() {
    if (!sc?.cls) return toast('반을 먼저 넣어 주세요');
    setBusy('시간표 받는 중…');
    try {
      // 지난주 월요일 ~ 이번 주 금요일 (이번 주가 시작 전이어도 지난주 것으로)
      const from = addDays(weekStart(today), -7);
      const r = await schoolInfo({ name: sc.name, grade: sc.grade, cls: sc.cls, from, to: addDays(from, 11), want: ['timetable'] });
      const pat = weekPattern(r.timetable ?? []);
      if (!Object.keys(pat).length) return toast('나이스에 이 반의 시간표가 아직 없어요');
      const subs = alive(getStudy().subjects);
      const created: { id: string; name: string }[] = [];
      const idOf = (n: string) => {
        const hit = matchSubject(n, [...subs, ...created]);
        if (hit) return hit;
        const s = { id: newId(), name: n.slice(0, 20) };
        created.push(s);
        return s.id;
      };
      const tt: Record<string, string[]> = {};
      for (const [w, names] of Object.entries(pat)) tt[w] = names.map(idOf);
      if (created.length && !window.confirm(`내 과목에 없는 ${created.length}과목을 새로 만들어요: ${created.map((c) => c.name).join(', ')}\n계속할까요?`)) return;
      const order = subs.reduce((m, s) => Math.max(m, s.order), 0);
      putMany(created.map((c, i) => ({ c: 'subjects' as const, item: { id: c.id, name: c.name, color: SUBJECT_COLORS[(subs.length + i) % SUBJECT_COLORS.length], order: order + i + 1 } as never })));
      setSettings({ schoolTimetable: tt });
      toast(`시간표를 가져왔어요 (${r.school})`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '시간표를 받지 못했어요');
    } finally {
      setBusy('');
    }
  }

  async function importOff() {
    if (!sc) return;
    setBusy('학사일정 받는 중…');
    try {
      const r = await schoolInfo({ name: sc.name, from: today, to: addDays(today, 90), want: ['events'] });
      const days = offDays(r.events ?? []);
      const cur = getStudy().settings.offDates;
      const add = days.filter((x) => !cur.includes(x));
      if (!add.length) return toast('앞으로 석 달 안에 새로 넣을 휴업일이 없어요');
      setSettings({ offDates: [...cur.filter((x) => x >= today), ...add].sort() });
      toast(`휴업일 ${add.length}일을 빼는 날짜에 넣었어요: ${add.map(shortDate).join(', ')}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '학사일정을 받지 못했어요');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="st-card st-form">
      <h3 className="st-h">내 학교</h3>
      {!isLoggedIn() && <p className="st-hint">학교 정보(나이스)는 로그인한 뒤에 받을 수 있어요.</p>}
      <Field label="학교 이름">
        <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 재현고등학교" />
      </Field>
      <div className="st-inline">
        <select className="st-input xs" value={grade} onChange={(e) => setGrade(Number(e.target.value))} aria-label="학년">
          {[1, 2, 3].map((g) => (
            <option key={g} value={g}>
              {g}학년
            </option>
          ))}
        </select>
        <input className="st-input xs" inputMode="numeric" value={cls} onChange={(e) => setCls(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="반" aria-label="반" />
        반
        <button className="btn btn-sm btn-primary" disabled={!changed || !name.trim()} onClick={() => (setSettings({ school: { name: name.trim(), grade, cls: cls || undefined } }), toast('학교를 저장했어요'))}>
          저장
        </button>
      </div>
      {sc && isLoggedIn() && (
        <div className="st-inline wrap">
          <button className="btn btn-sm" disabled={!!busy} onClick={() => void importTimetable()}>
            시간표 가져오기
          </button>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => void importOff()}>
            휴업일을 쉬는 날로
          </button>
          {busy && <small className="st-muted">{busy}</small>}
        </div>
      )}
      <p className="st-hint">급식·학사일정은 오늘 화면과 시험 화면에 보여요. 자료: 나이스 교육정보 개방 포털.</p>
    </section>
  );
}
