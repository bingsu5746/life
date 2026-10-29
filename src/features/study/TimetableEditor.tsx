// 학교 시간표 넣기: 요일마다 수업 과목을 순서대로 누른다 (누른 순서가 교시 순서)
import { useState } from 'react';
import { WEEKDAYS } from './dates';
import { setSettings, useStudy } from './store';
import { subjectsOf } from './ui';

const DAYS = [1, 2, 3, 4, 5, 6];

export function TimetableEditor() {
  const d = useStudy();
  const tt = d.settings.schoolTimetable ?? {};
  const subjects = subjectsOf(d);
  const [sat, setSat] = useState(!!tt['6']?.length);
  const set = (day: number, ids: string[]) => setSettings({ schoolTimetable: { ...tt, [String(day)]: ids } });
  if (!subjects.length) return <p className="st-hint">설정에서 과목을 먼저 만들어 주세요.</p>;
  return (
    <div className="tt-edit">
      {DAYS.filter((x) => x < 6 || sat).map((day) => {
        const ids = (tt[String(day)] ?? []).filter((id) => d.subjects[id] && !d.subjects[id].deleted);
        return (
          <div key={day} className="tt-row">
            <b className="tt-day">{WEEKDAYS[day]}</b>
            <div className="tt-cells">
              {ids.map((id, i) => (
                <button
                  key={i}
                  type="button"
                  className="tt-cell"
                  title="눌러서 빼기"
                  aria-label={`${i + 1}교시 ${d.subjects[id]?.name} 빼기`}
                  onClick={() =>
                    set(
                      day,
                      ids.filter((_, j) => j !== i),
                    )
                  }
                >
                  <small>{i + 1}</small> {d.subjects[id]?.name}
                </button>
              ))}
              {ids.length < 9 && (
                <select className="st-input xs tt-add" value="" aria-label={`${WEEKDAYS[day]}요일 ${ids.length + 1}교시 과목`} onChange={(e) => e.target.value && set(day, [...ids, e.target.value])}>
                  <option value="">+ {ids.length + 1}교시</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
      <label className="st-toggle">
        <input type="checkbox" checked={sat} onChange={(e) => setSat(e.target.checked)} /> 토요일 수업도 있어요
      </label>
    </div>
  );
}
