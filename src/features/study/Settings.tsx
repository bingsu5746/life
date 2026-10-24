// 공부 설정: 과목 · 시험 · 쉬는 날 · 과외 날 비율 · 복습 간격 · 타이머
import { useState } from 'react';
import { dday, shortDate } from './dates';
import { alive, newId, SUBJECT_COLORS, type Subject } from './model';
import { put, remove, setSettings, useStudy } from './store';
import { confirmDelete, Field, subjectsOf, useToday, WeekdayPicker } from './ui';

export function Settings() {
  const d = useStudy();
  const s = d.settings;
  const today = useToday();
  const [off, setOff] = useState(today);
  const [exam, setExam] = useState({ name: '', date: today });
  const [subj, setSubj] = useState('');
  const subjects = subjectsOf(d);
  const exams = alive(d.exams).sort((a, b) => a.date.localeCompare(b.date));
  const num = (v: string, lo: number, hi: number, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : fb;
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>공부 설정</h2>
      </div>

      <section className="st-card st-form">
        <h3 className="st-h">과목</h3>
        {subjects.map((x, i) => (
          <SubjectRow key={x.id} s={x} first={i === 0} last={i === subjects.length - 1} prev={subjects[i - 1]} next={subjects[i + 1]} />
        ))}
        <form
          className="st-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (!subj.trim()) return;
            put('subjects', { id: newId(), name: subj.trim(), color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length], order: subjects.length });
            setSubj('');
          }}
        >
          <input className="st-input sm" placeholder="새 과목" value={subj} onChange={(e) => setSubj(e.target.value)} />
          <button className="btn btn-sm">추가</button>
        </form>
      </section>

      <section className="st-card st-form">
        <h3 className="st-h">시험</h3>
        {exams.map((e) => (
          <div key={e.id} className="st-inline between">
            <span>
              {e.name} · {shortDate(e.date)} <b>{dday(today, e.date)}</b>
            </span>
            <span className="st-inline">
              <input className="st-input sm" type="date" value={e.date} onChange={(ev) => ev.target.value && put('exams', { ...e, date: ev.target.value })} aria-label={`${e.name} 날짜`} />
              <button className="st-x" aria-label="지우기" onClick={() => confirmDelete(`「${e.name}」`) && remove('exams', e.id)}>
                ✕
              </button>
            </span>
          </div>
        ))}
        <p className="st-hint">시험 날짜를 바꾸면 그 시험에 맞춘 계획이 모두 다시 계산돼요.</p>
        <form
          className="st-inline wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!exam.name.trim()) return;
            put('exams', { id: newId(), name: exam.name.trim(), date: exam.date });
            setExam({ name: '', date: exam.date });
          }}
        >
          <input className="st-input sm" placeholder="시험 이름" value={exam.name} onChange={(e) => setExam({ ...exam, name: e.target.value })} />
          <input className="st-input sm" type="date" value={exam.date} onChange={(e) => setExam({ ...exam, date: e.target.value })} />
          <button className="btn btn-sm">추가</button>
        </form>
      </section>

      <section className="st-card st-form">
        <h3 className="st-h">하루 분량 나누기</h3>
        <Field group label="쉬는 요일" hint="모든 계획에 적용 (계획마다 따로 정할 수도 있어요)">
          <WeekdayPicker value={s.restDays} onChange={(v) => setSettings({ restDays: v })} label="쉬는 요일" />
        </Field>
        <Field group label="빼는 날짜 (여행·행사)">
          <div className="st-chips">
            {s.offDates
              .filter((x) => x >= today)
              .map((x) => (
                <button key={x} className="st-chip on" onClick={() => setSettings({ offDates: s.offDates.filter((y) => y !== x) })} aria-label={`${shortDate(x)} 빼기 취소`}>
                  {shortDate(x)} ✕
                </button>
              ))}
          </div>
          <span className="st-inline">
            <input className="st-input sm" type="date" min={today} value={off} onChange={(e) => setOff(e.target.value)} />
            <button className="btn btn-sm" onClick={() => !s.offDates.includes(off) && setSettings({ offDates: [...s.offDates.filter((x) => x >= today), off].sort() })}>
              빼기
            </button>
          </span>
        </Field>
        <Field label={`과외 있는 날 분량: 평소의 ${Math.round(s.tutorRatio * 100)}%`}>
          <input type="range" min={0} max={100} step={10} value={s.tutorRatio * 100} onChange={(e) => setSettings({ tutorRatio: Number(e.target.value) / 100 })} />
        </Field>
        <label className="st-toggle">
          <input type="checkbox" checked={s.wordsUseTutorRatio} onChange={(e) => setSettings({ wordsUseTutorRatio: e.target.checked })} /> 단어장 계획에도 과외 날 비율 쓰기
        </label>
        <Field label="하루가 시작되는 시각" hint="이 시각 전에 공부해도 전날 분량으로 쳐요">
          <select className="st-input xs" value={s.dayStart} onChange={(e) => setSettings({ dayStart: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                새벽 {h}시
              </option>
            ))}
          </select>
        </Field>
        <Field label="하루 최대 쪽 (넘으면 알림)">
          <input className="st-input xs" inputMode="numeric" defaultValue={s.dailyMax ?? ''} placeholder="없음" onBlur={(e) => setSettings({ dailyMax: Number(e.target.value) > 0 ? Number(e.target.value) : null })} />
        </Field>
      </section>

      <section className="st-card st-form">
        <h3 className="st-h">복습 · 영단어</h3>
        <Field label="다시 보기 간격 (일, 상자 1~5)" hint="맞히면 다음 상자, 틀리면 1번 상자. 5번 상자에서 맞히면 익힘">
          <div className="st-inline">
            {s.intervals.map((v, i) => (
              <input
                key={i}
                className="st-input xs"
                inputMode="numeric"
                defaultValue={v}
                aria-label={`${i + 1}번 상자`}
                onBlur={(e) => {
                  const next = [...s.intervals];
                  next[i] = num(e.target.value, 1, 365, v);
                  setSettings({ intervals: next });
                }}
              />
            ))}
          </div>
        </Field>
        <Field label="객관식으로 오를 수 있는 상자">
          <select className="st-input xs" value={s.quizMaxBox} onChange={(e) => setSettings({ quizMaxBox: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((b) => (
              <option key={b} value={b}>
                {b}번까지
              </option>
            ))}
          </select>
        </Field>
        <Field label="모르는 단어 모음: 하루 새 단어">
          <input className="st-input xs" inputMode="numeric" defaultValue={s.inboxPerDay} onBlur={(e) => setSettings({ inboxPerDay: num(e.target.value, 1, 200, s.inboxPerDay) })} />
        </Field>
      </section>

      <section className="st-card st-form">
        <h3 className="st-h">뽀모도로 (분)</h3>
        <div className="st-inline wrap">
          {(
            [
              ['work', '공부'],
              ['short', '휴식'],
              ['long', '긴 휴식'],
              ['every', '긴 휴식 간격(번)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="st-mini-field">
              <small>{label}</small>
              <input className="st-input xs" inputMode="numeric" defaultValue={s.pomo[k]} onBlur={(e) => setSettings({ pomo: { ...s.pomo, [k]: num(e.target.value, 1, 180, s.pomo[k]) } })} />
            </label>
          ))}
        </div>
      </section>
      <p className="st-hint center">로그인하면 공부 자료가 폰·PC 에서 같이 보여요. 로그인하지 않으면 이 기기에만 저장돼요.</p>
    </div>
  );
}

function SubjectRow({ s, first, last, prev, next }: { s: Subject; first: boolean; last: boolean; prev?: Subject; next?: Subject }) {
  const swap = (o?: Subject) => {
    if (!o) return;
    put('subjects', { ...s, order: o.order === s.order ? o.order + (first ? 1 : -1) : o.order });
    put('subjects', { ...o, order: s.order });
  };
  return (
    <div className="st-inline between">
      <span className="st-inline">
        <input type="color" value={s.color} onChange={(e) => put('subjects', { ...s, color: e.target.value })} aria-label={`${s.name} 색`} className="st-color" />
        <input className="st-input sm" defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && put('subjects', { ...s, name: e.target.value.trim() })} aria-label="과목 이름" />
      </span>
      <span className="st-inline">
        <button className="st-x" disabled={first} onClick={() => swap(prev)} aria-label="위로">
          ↑
        </button>
        <button className="st-x" disabled={last} onClick={() => swap(next)} aria-label="아래로">
          ↓
        </button>
        <button className="st-x" aria-label="지우기" onClick={() => confirmDelete(`과목 「${s.name}」`) && remove('subjects', s.id)}>
          ✕
        </button>
      </span>
    </div>
  );
}
