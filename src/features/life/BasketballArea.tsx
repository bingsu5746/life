// 취미 · 농구: 농구 연습 · 농구 기록 · 슛 분석 · NBA (예전 「운동」 영역의 농구를 옮겨 왔다)
import { useEffect } from 'react';
import { Basketball } from './Basketball';
import { DrillsPage } from './Drills';
import { NbaPage } from './Nba';
import { ShotsPage } from './Shots';

export function BasketballArea({ sub, sub2 }: { sub?: string; sub2?: string }) {
  if (sub === 'drills') return <DrillsPage />;
  if (sub === 'nba') return <NbaPage sub={sub2} />;
  if (sub === 'shots') return <ShotsPage />;
  return <Basketball sub={sub} />;
}

/** 예전 운동 주소(/fitness/…)로 오면 새 주소로 */
export function FitnessMoved({ sub, sub2 }: { sub?: string; sub2?: string }) {
  useEffect(() => {
    const to = sub === 'drills' ? '#/basketball/drills' : sub === 'basketball' ? (sub2 ? `#/basketball/${sub2}` : '#/basketball') : '#/hobby';
    window.location.replace(to);
  }, [sub, sub2]);
  return null;
}
