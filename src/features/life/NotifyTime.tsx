// 매일 정해진 시각 알림 하나를 켜고 끄기 (알림 시각 목록에 넣거나 빼서, 서버 알림 시각은 모두 3개까지)
import { useState } from 'react';
import type { StudySettings } from '../study/model';
import { enableNotify, localTimes } from '../study/notify';
import { setSettings, useStudy } from '../study/store';

type Key = 'checkinTime' | 'diaryTime';

export function NotifyTime({ k, label, fallback }: { k: Key; label: string; fallback: string }) {
  const d = useStudy();
  const cur = d.settings[k];
  const [t, setT] = useState(cur ?? fallback);
  const [msg, setMsg] = useState('');
  async function apply(next: string | undefined) {
    setSettings({ [k]: next } as Partial<StudySettings>);
    const times = localTimes();
    if (!times) {
      setMsg(next ? '이 기기에서 알림이 꺼져 있어요. 설정 → 알림에서 먼저 켜 주세요.' : '');
      return;
    }
    // 다른 알림이 같은 시각을 쓰면 그 시각은 남겨 둔다
    const other = k === 'checkinTime' ? d.settings.diaryTime : d.settings.checkinTime;
    const others = times.filter((x) => x !== cur || x === other);
    const want = next ? [...new Set([...others, next])].sort() : others;
    if (want.length > 3) {
      setMsg('알림 시각은 3개까지예요. 설정 → 알림에서 하나를 지운 뒤 다시 해 주세요.');
      setSettings({ [k]: cur } as Partial<StudySettings>);
      return;
    }
    try {
      await enableNotify(want);
      setMsg(next ? `매일 ${next}에 알려 드려요` : '알림을 껐어요');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '알림을 바꾸지 못했어요');
    }
  }
  return (
    <details className="ck-time">
      <summary>{cur ? `매일 ${cur}에 ${label}` : `매일 정해진 시각에 ${label} 받기`}</summary>
      <div className="st-inline">
        <input className="st-input sm" type="time" value={t} onChange={(e) => setT(e.target.value)} aria-label={`${label} 시각`} />
        <button className="btn btn-sm btn-primary" onClick={() => void apply(t)}>
          저장
        </button>
        {cur && (
          <button className="st-link" onClick={() => void apply(undefined)}>
            끄기
          </button>
        )}
      </div>
      {msg && <p className="st-hint">{msg}</p>}
    </details>
  );
}
