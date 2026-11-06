// 약 · 영양제: 오늘 먹을 것 체크 · 목록 고치기 (알림은 먹을 시각마다, 체크하면 그날 알림은 빠진다)
import { useState } from 'react';
import { dosesOn, doseKey, toggleDose, type Med } from './meds';
import { newId } from './model';
import { getStudy, setSettings, useStudy } from './store';
import { confirmDelete, Field, Sheet, toast, useToday } from './ui';

/** 오늘 먹을 것 (체크) · compact 면 메인 화면용 (목록 고치기 없이) */
export function MedsCard({ compact }: { compact?: boolean }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState<Med | 'new' | null>(null);
  const meds = d.settings.meds ?? [];
  const doses = dosesOn(d.settings, today);
  if (compact && !doses.length) return null;
  const check = (key: string) => setSettings({ medLog: toggleDose(getStudy().settings.medLog, today, key) });
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">약 · 영양제</h3>
        {!compact && (
          <button className="btn btn-sm" onClick={() => setEdit('new')}>
            ＋ 넣기
          </button>
        )}
      </div>
      {!doses.length && !compact && <p className="st-hint">먹는 약이나 영양제와 시각을 넣으면, 그 시각에 휴대폰으로 알려 주고 오늘 먹었는지 체크할 수 있어요. 알림은 로그인하고 이 기기 알림을 켜 둬야 와요.</p>}
      <div className="md-list">
        {doses.map((x) => (
          <label key={doseKey(x.med, x.time)} className={`md-dose ${x.done ? 'done' : ''}`}>
            <input type="checkbox" checked={x.done} onChange={() => check(doseKey(x.med, x.time))} />
            <b>{x.time}</b>
            <span>{x.med.name}</span>
            {x.med.memo && <small className="st-muted">{x.med.memo}</small>}
          </label>
        ))}
      </div>
      {!compact && meds.length > 0 && (
        <div className="st-chips">
          {meds.map((m) => (
            <button key={m.id} className="st-chip" onClick={() => setEdit(m)}>
              {m.name} 고치기
            </button>
          ))}
        </div>
      )}
      {edit && <MedSheet item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function MedSheet({ item, onClose }: { item?: Med; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [times, setTimes] = useState<string[]>(item?.times.length ? item.times : ['08:00']);
  const [memo, setMemo] = useState(item?.memo ?? '');
  const list = () => getStudy().settings.meds ?? [];
  function save() {
    const t = [...new Set(times.filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)))].sort();
    if (!name.trim() || !t.length) return;
    const m: Med = { id: item?.id ?? newId(), name: name.trim().slice(0, 30), times: t.slice(0, 6), memo: memo.trim().slice(0, 100) || undefined };
    setSettings({ meds: item ? list().map((x) => (x.id === item.id ? m : x)) : [...list(), m].slice(0, 20) });
    toast(item ? '고쳤어요' : `${m.name}을(를) 넣었어요`);
    onClose();
  }
  return (
    <Sheet title={item ? '약 · 영양제 고치기' : '약 · 영양제 넣기'} onClose={onClose}>
      <div className="st-form">
        <Field label="이름">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 비타민 D, 비염약" autoFocus={!item} />
        </Field>
        <Field group label="먹는 시각">
          <div className="st-inline wrap">
            {times.map((t, i) => (
              <span key={i} className="st-inline">
                <input className="st-input sm" type="time" value={t} onChange={(e) => setTimes(times.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`${i + 1}번째 시각`} />
                {times.length > 1 && (
                  <button type="button" className="st-x" aria-label="이 시각 빼기" onClick={() => setTimes(times.filter((_, k) => k !== i))}>
                    ✕
                  </button>
                )}
              </span>
            ))}
            {times.length < 6 && (
              <button type="button" className="st-link" onClick={() => setTimes([...times, '20:00'])}>
                ＋ 시각
              </button>
            )}
          </div>
        </Field>
        <Field label="메모 (선택)">
          <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 밥 먹고 · 1알" />
        </Field>
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`「${item.name}」`)) return;
                setSettings({ meds: list().filter((x) => x.id !== item.id) });
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!name.trim() || !times.some(Boolean)} onClick={save}>
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
