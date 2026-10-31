// 한 해 결산 카드 (일기 › 한 해 결산). 그림으로 내려받아 공유할 수 있다
import { useState } from 'react';
import { useStudy } from '../study/store';
import { Empty, toast, useToday } from '../study/ui';
import { recap, recapLines } from './recap';
import { shareCard } from '../../lib/shareCard';

export function RecapPage() {
  const d = useStudy();
  const today = useToday();
  const now = Number(today.slice(0, 4));
  // 1월이면 지난해부터
  const [year, setYear] = useState(today.slice(5, 7) === '01' ? now - 1 : now);
  const r = recap(d, year);
  const lines = recapLines(r);
  const save = async () => {
    if (!(await shareCard(`${year} 나의 한 해`, lines, `${year}-결산.png`))) toast('그림을 만들지 못했어요');
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>한 해 결산</h2>
        <select className="st-input xs" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="연도">
          {[now, now - 1, now - 2].map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
      </div>
      {!lines.length ? (
        <Empty title={`${year}년 기록이 아직 없어요`}>
          <p>공부 · 일기 · 영화 · 음반 · 책 · 게임 · 농구 · 돈 기록이 쌓이면 한 장으로 모아 보여 드려요.</p>
        </Empty>
      ) : (
        <>
          <section className="rc-card">
            <h3>{year} 나의 한 해</h3>
            {lines.map((l) => (
              <div key={l.label} className="rc-row">
                <span className="rc-icon" aria-hidden>
                  {l.icon}
                </span>
                <div>
                  <small>{l.label}</small>
                  <b>{l.value}</b>
                  {l.sub && <small>{l.sub}</small>}
                </div>
              </div>
            ))}
          </section>
          <button className="btn btn-primary" onClick={() => void save()}>
            그림으로 저장 · 공유
          </button>
          {year === now && today.slice(5, 7) !== '12' && <p className="st-muted sm">올해는 아직 끝나지 않아서 오늘까지의 기록이에요.</p>}
        </>
      )}
    </div>
  );
}
