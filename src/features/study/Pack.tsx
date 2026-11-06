// 오늘 화면: 「내일 챙길 것」 체크리스트 (오후 3시부터). 내일 수업이 없으면 다음 학교 가는 날
import { useState } from 'react';
import { addDays, shortDate } from './dates';
import { packList } from './pack';
import { setSettings, useStudy } from './store';
import { Check, Sheet, subjectsOf, toast } from './ui';
import { nextSchoolDay } from './timetable';

export function PackCard({ today }: { today: string }) {
  const d = useStudy();
  const [edit, setEdit] = useState(false);
  const hour = new Date(Date.now() + 9 * 3600_000).getUTCHours();
  if (hour < 15) return null;
  const tomorrow = addDays(today, 1);
  let day = tomorrow;
  let items = packList(d, day);
  if (!items.length) {
    const next = nextSchoolDay(d.settings.schoolTimetable, today, d.settings.offDates);
    if (next && next !== tomorrow) {
      day = next;
      items = packList(d, day);
    }
  }
  if (!items.length && !edit) return null;
  const checked = d.settings.packChecks?.date === day ? d.settings.packChecks.ids : [];
  const toggle = (id: string) => setSettings({ packChecks: { date: day, ids: checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id] } });
  const left = items.filter((x) => !checked.includes(x.id)).length;
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">
          🎒 {day === tomorrow ? '내일' : shortDate(day)} 챙길 것{items.length ? ` · ${left ? `${left}개 남음` : '다 챙겼어요'}` : ''}
        </h3>
        <button className="st-link" onClick={() => setEdit(true)}>
          준비물 정하기
        </button>
      </div>
      {items.map((x) => (
        <div key={x.id} className="st-item">
          <Check on={checked.includes(x.id)} label={`${x.text} 챙겼어요`} onClick={() => toggle(x.id)} />
          <div className="st-item-main">
            <div className={`st-item-title ${checked.includes(x.id) ? 'done' : ''}`}>{x.text}</div>
            <div className="st-item-sub">{x.why}</div>
          </div>
        </div>
      ))}
      {edit && <PackSettings onClose={() => setEdit(false)} />}
    </section>
  );
}

/** 늘 챙길 것 · 과목별 준비물 */
function PackSettings({ onClose }: { onClose: () => void }) {
  const d = useStudy();
  const [always, setAlways] = useState((d.settings.packAlways ?? []).join('\n'));
  const [bySub, setBySub] = useState<Record<string, string>>(d.settings.packBySubject ?? {});
  const subs = subjectsOf(d);
  return (
    <Sheet title="준비물 정하기" onClose={onClose}>
      <div className="st-form">
        <label className="st-field">
          <span className="st-label">학교 가는 날마다 (한 줄에 하나)</span>
          <textarea className="st-input" rows={3} value={always} onChange={(e) => setAlways(e.target.value)} placeholder={'학생증\n충전기\n물통'} />
        </label>
        <span className="st-label">과목별 준비물 (그 과목 수업이 있는 날)</span>
        {subs.map((s) => (
          <label key={s.id} className="st-inline">
            <span className="pk-sub">{s.name}</span>
            <input className="st-input sm" value={bySub[s.id] ?? ''} onChange={(e) => setBySub({ ...bySub, [s.id]: e.target.value })} placeholder={/체육/.test(s.name) ? '체육복 · 운동화' : /미술/.test(s.name) ? '물감 · 붓' : '예: 프린트 파일'} />
          </label>
        ))}
        <div className="st-row end">
          <button
            className="btn btn-primary"
            onClick={() => {
              setSettings({
                packAlways: always
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean),
                packBySubject: Object.fromEntries(Object.entries(bySub).filter(([, v]) => v.trim())),
              });
              toast('준비물을 저장했어요');
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}
