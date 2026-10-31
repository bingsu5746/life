// 사고 싶은 것(음반 · 게임) → 모으기 목표: 값을 적으면 모으기 목표를 만들고, 지금 모으는 속도로 언제 살 수 있는지 보여 준다
import { useState } from 'react';
import { alive, newId, type SavingGoal } from '../study/model';
import { put, useStudy } from '../study/store';
import { shortDate } from '../study/dates';
import { go, toast, useToday } from '../study/ui';
import { readWon, savingPace, won } from './calc';

export function WishGoal({ name }: { name: string }) {
  const d = useStudy();
  const today = useToday();
  const [price, setPrice] = useState('');
  const g = alive(d.savings).find((x) => !x.done && x.name === name);
  if (g) {
    const p = savingPace(g, today);
    const have = g.target - p.left;
    return (
      <div className="wg">
        <small>
          💰 모은 돈 {won(have)} / {won(g.target)}
          {p.left === 0 ? ' · 다 모았어요! 🎉' : p.eta ? ` · 지금 속도면 ${shortDate(p.eta)}쯤 (${Math.max(1, Math.ceil((Date.parse(p.eta) - Date.parse(today)) / (7 * 86_400_000)))}주 뒤)` : ' · 아직 모은 기록이 없어요'}
        </small>
        <button type="button" className="st-link" onClick={() => go('/money/saving')}>
          모으기 ›
        </button>
      </div>
    );
  }
  const n = readWon(price);
  return (
    <div className="wg">
      <input className="st-input xs" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 9) ? Number(e.target.value.replace(/\D/g, '').slice(0, 9)).toLocaleString('ko-KR') : '')} placeholder="값 (원)" aria-label={`${name} 값`} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={!n}
        onClick={() => {
          if (!n) return;
          put('savings', { id: newId(), created: Date.now(), name, target: n, deposits: [] } as unknown as SavingGoal);
          toast('모으기 목표를 만들었어요');
        }}
      >
        모으기 목표 만들기
      </button>
    </div>
  );
}
