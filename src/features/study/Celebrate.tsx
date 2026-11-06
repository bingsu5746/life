// 신기록 축하: 기록이 바뀌면 오늘 생긴 신기록을 보고, 아직 축하하지 않은 것을 한 번 띄운다
import { useEffect, useState } from 'react';
import { newRecords, type NewRecord } from './records';
import { getStudy, setSettings, useStudy } from './store';
import { useToday } from './ui';

export function Celebrate() {
  const d = useStudy();
  const today = useToday();
  const [show, setShow] = useState<NewRecord[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const seen = new Set(getStudy().settings.celebrated ?? []);
      const fresh = newRecords(getStudy(), today).filter((r) => !seen.has(r.key));
      if (!fresh.length) return;
      setSettings({ celebrated: [...seen, ...fresh.map((r) => r.key)].slice(-50) });
      setShow(fresh);
    }, 1500);
    return () => clearTimeout(t);
  }, [d.sessions, d.workouts, today]);
  if (!show) return null;
  return (
    <div className="cb-back" onClick={() => setShow(null)} role="dialog" aria-label="신기록">
      <div className="cb-box" onClick={(e) => e.stopPropagation()}>
        <div className="cb-emoji" aria-hidden>
          🎉
        </div>
        <h3>신기록!</h3>
        {show.map((r) => (
          <p key={r.key}>
            <b>{r.label}</b>
            <br />
            {r.value} <small>(전 기록 {r.prev})</small>
          </p>
        ))}
        <button className="btn btn-primary" onClick={() => setShow(null)}>
          좋아요
        </button>
      </div>
    </div>
  );
}
