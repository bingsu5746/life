// 넘기는 카드: 누르면 뒤집혀 뒷면(뜻)이 보이고, 왼쪽으로 밀면 「모른다」(빨갛게), 오른쪽으로 밀면 「안다」(초록으로).
// 키보드: 스페이스·엔터 뒤집기, ← 모른다, → 안다. 마우스·키보드만 쓰는 사람을 위해 아래에 작은 단추도 둔다.
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** 이만큼 넘게 밀면 넘긴 것으로 (px) */
const THRESHOLD = 96;
/** 이보다 덜 움직였으면 누른 것으로 (뒤집기) */
const TAP = 8;

export function SwipeCard({ front, back, sub, onAnswer, hint = true }: { front: ReactNode; back: ReactNode; sub?: ReactNode; onAnswer: (known: boolean) => void; hint?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<0 | -1 | 1>(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);
  const done = useRef(false);

  function leave(dir: -1 | 1) {
    if (done.current) return;
    done.current = true;
    setLeaving(dir);
    setDragging(false);
    // 날아가는 모양을 보여 준 뒤 다음 카드로
    setTimeout(() => onAnswer(dir === 1), 230);
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowLeft') leave(-1);
      else if (e.key === 'ArrowRight') leave(1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const x = leaving ? leaving * (typeof window !== 'undefined' ? window.innerWidth : 600) : dx;
  // 미는 만큼 색이 짙어진다 (0 ~ 1)
  const tint = Math.min(1, Math.abs(x) / (THRESHOLD * 1.4));
  const side = x < 0 ? 'no' : x > 0 ? 'yes' : '';

  return (
    <div className="sw">
      <div
        className={`sw-card ${dragging ? 'dragging' : ''} ${side}`}
        style={{
          transform: `translateX(${x}px) rotate(${x / 18}deg)`,
          ['--tint' as string]: tint,
        }}
        role="button"
        tabIndex={0}
        aria-label={flipped ? '카드 앞면 보기' : '카드 뒤집기'}
        onPointerDown={(e) => {
          if (done.current) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          moved.current = false;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          if (!moved.current && Math.abs(mx) < TAP && Math.abs(e.clientY - s.y) < TAP) return;
          moved.current = true;
          setDragging(true);
          setDx(mx);
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s || s.id !== e.pointerId) return;
          if (!moved.current) {
            setFlipped((f) => !f);
            return;
          }
          const mx = e.clientX - s.x;
          if (Math.abs(mx) > THRESHOLD) leave(mx > 0 ? 1 : -1);
          else {
            setDragging(false);
            setDx(0);
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setDx(0);
        }}
      >
        <div className={`sw-inner ${flipped ? 'flipped' : ''}`}>
          <div className="sw-face sw-front">
            {sub && <small className="sw-sub">{sub}</small>}
            <div className="sw-text">{front}</div>
            {hint && <small className="sw-tap">눌러서 뒤집기</small>}
          </div>
          <div className="sw-face sw-back">
            {sub && <small className="sw-sub">{sub}</small>}
            <div className="sw-text">{back}</div>
          </div>
        </div>
        <span className="sw-label no" aria-hidden>
          모른다
        </span>
        <span className="sw-label yes" aria-hidden>
          안다
        </span>
      </div>
      <div className="sw-actions">
        <button type="button" className="sw-btn no" onClick={() => leave(-1)}>
          ← 모른다
        </button>
        <small className="st-muted">밀어서 넘기기</small>
        <button type="button" className="sw-btn yes" onClick={() => leave(1)}>
          안다 →
        </button>
      </div>
    </div>
  );
}
