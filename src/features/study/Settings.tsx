// 공부 설정: 과목 · 시험 · 쉬는 날 · 과외 날 비율 · 복습 간격 · 타이머
import { useState } from 'react';
import { shortDate } from './dates';
import { alive, newId, SUBJECT_COLORS, type StudyData, type Subject } from './model';
import { exportBackup, importBackup } from './backup';
import { getTheme, setTheme, type Theme } from '../../lib/theme';
import { getStudy, put, remove, resetLocal, setSettings, useStudy } from './store';
import { confirmDelete, Field, go, NumInput, subjectsOf, TextInput, toast, useToday, WeekdayPicker } from './ui';

export function Settings() {
  const d = useStudy();
  const s = d.settings;
  const today = useToday();
  const [off, setOff] = useState(today);
  const [subj, setSubj] = useState('');
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const subjects = subjectsOf(d);
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

      <p className="st-hint">
        시험 날짜·범위는{' '}
        <button className="st-link" onClick={() => go('/exams')}>
          시험
        </button>{' '}
        화면에서 넣고 고쳐요.
      </p>

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
          <select className="st-input sm st-fit" value={s.dayStart} onChange={(e) => setSettings({ dayStart: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                새벽 {h}시
              </option>
            ))}
          </select>
        </Field>
        <Field label="하루 최대 쪽 (넘으면 알림)">
          <NumInput className="st-input xs" value={s.dailyMax} min={0} max={9999} allowEmpty placeholder="없음" onCommit={(v) => setSettings({ dailyMax: v && v > 0 ? Math.round(v) : null })} />
        </Field>
      </section>

      <section className="st-card st-form">
        <h3 className="st-h">복습 · 영단어</h3>
        <Field label="다시 보기 간격 (일, 상자 1~5)" hint="맞히면 다음 상자, 틀리면 1번 상자. 5번 상자에서 맞히면 익힘">
          <div className="st-inline wrap st-intervals">
            {s.intervals.map((v, i) => (
              <NumInput
                key={i}
                className="st-input xs"
                value={v}
                min={1}
                max={365}
                aria-label={`${i + 1}번 상자`}
                onCommit={(n) => {
                  const next = [...getStudy().settings.intervals];
                  next[i] = Math.round(n ?? v);
                  setSettings({ intervals: next });
                }}
              />
            ))}
          </div>
        </Field>
        <Field label="객관식으로 오를 수 있는 상자">
          <select className="st-input sm st-fit" value={s.quizMaxBox} onChange={(e) => setSettings({ quizMaxBox: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((b) => (
              <option key={b} value={b}>
                {b}번까지
              </option>
            ))}
          </select>
        </Field>
        <Field label="모르는 단어 모음: 하루 새 단어">
          <NumInput className="st-input xs" value={s.inboxPerDay} min={1} max={200} onCommit={(v) => setSettings({ inboxPerDay: Math.round(v ?? s.inboxPerDay) })} />
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
              <NumInput className="st-input xs" value={s.pomo[k]} min={1} max={180} onCommit={(v) => setSettings({ pomo: { ...getStudy().settings.pomo, [k]: Math.round(v ?? s.pomo[k]) } })} />
            </label>
          ))}
        </div>
      </section>
      <section className="st-card st-form">
        <h3 className="st-h">화면</h3>
        <div className="st-seg" role="radiogroup" aria-label="화면 밝기">
          {(
            [
              ['system', '기기 설정'],
              ['light', '밝게'],
              ['dark', '어둡게'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={theme === k} className={theme === k ? 'on' : ''} onClick={() => (setTheme(k), setThemeState(k))}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="st-card st-form">
        <h3 className="st-h">백업</h3>
        <p className="st-hint">공부 자료와 단어를 파일 하나로 내려받아요 (오답 사진은 빠져요). 다시 넣으면 지금 자료와 합쳐져요.</p>
        <div className="st-row">
          <button className="btn btn-sm" onClick={exportBackup}>
            백업 파일 내려받기
          </button>
          <label className="btn btn-sm">
            백업에서 가져오기
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f)
                  void importBackup(f).then(
                    (r) => toast(`백업을 합쳤어요 (단어 ${r.words}개)`),
                    (err: Error) => toast(err.message),
                  );
              }}
            />
          </label>
        </div>
        <button
          className="st-link st-danger"
          onClick={() => {
            if (!window.confirm('이 기기에 저장된 공부 자료를 모두 지울까요? (로그인했다면 계정 자료는 남아요)')) return;
            void resetLocal().then(() => toast('이 기기의 자료를 지웠어요'));
          }}
        >
          이 기기의 자료 모두 지우기
        </button>
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
    <div className="st-subject-row">
      <input type="color" value={s.color} onChange={(e) => put('subjects', { ...getStudy().subjects[s.id], color: e.target.value })} aria-label={`${s.name} 색`} className="st-color" />
      <TextInput className="st-input sm" value={s.name} onCommit={(name) => put('subjects', { ...getStudy().subjects[s.id], name })} aria-label="과목 이름" />
      <span className="st-inline">
        <button className="st-x" disabled={first} onClick={() => swap(prev)} aria-label="위로">
          ↑
        </button>
        <button className="st-x" disabled={last} onClick={() => swap(next)} aria-label="아래로">
          ↓
        </button>
        <button className="st-x" aria-label="지우기" onClick={() => confirmDelete(`과목 「${s.name}」`, subjectUse(getStudy(), s.id)) && remove('subjects', s.id)}>
          ✕
        </button>
      </span>
    </div>
  );
}

/** 과목을 지울 때 알릴 것: 그 과목으로 넣은 자료 수 (자료는 남고 과목 표시만 없어진다) */
function subjectUse(d: StudyData, id: string): string {
  const parts = (
    [
      ['문제집', alive(d.books)],
      ['단어 목록', alive(d.wordLists)],
      ['과외', alive(d.tutors)],
      ['오답', alive(d.notes)],
      ['카드 묶음', alive(d.decks)],
    ] as const
  )
    .map(([label, xs]) => [label, (xs as { subjectId: string }[]).filter((x) => x.subjectId === id).length] as const)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}개`);
  return parts.length ? `이 과목으로 넣은 ${parts.join(' · ')}는 지워지지 않고 과목 없이 남아요.` : '';
}
