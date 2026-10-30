// 왼쪽으로 밀어 지우기: 밀수록 오른쪽 끝이 빨갛게 물들고 휴지통이 커진다. 정해진 만큼(너비의 40%) 넘기고 놓으면 지운다.
// 덜 밀고 놓으면 제자리로. 살짝만 움직였으면 누른 것으로 친다.
import { useRef, useState, type ReactNode } from 'react';

const TAP = 8;
const RATIO = 0.4;

export function SwipeDelete({ children, onOpen, onDelete, label }: { children: ReactNode; onOpen: () => void; onDelete: () => void; label: string }) {
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const [gone, setGone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number; axis?: 'x' | 'y' } | null>(null);
  const width = () => box.current?.offsetWidth || 300;
  const p = Math.min(1, -dx / (width() * RATIO));

  return (
    <div ref={box} className={`swd ${gone ? 'gone' : ''}`}>
      <div className="swd-bg" style={{ opacity: Math.max(0, p) }} aria-hidden>
        <svg viewBox="0 0 24 24" style={{ transform: `scale(${0.6 + 0.5 * Math.max(0, p)})` }}>
          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </div>
      <button
        className="swd-row"
        style={{ transform: `translateX(${dx}px)`, transition: drag ? 'none' : undefined }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          setDrag(true);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          // 처음 움직인 방향으로 정한다 (위아래면 목록 넘기기)
          if (!s.axis && (Math.abs(mx) > TAP || Math.abs(my) > TAP)) {
            s.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
            if (s.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId);
          }
          if (s.axis === 'x') setDx(Math.min(0, mx));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDrag(false);
          if (!s?.axis) return onOpen();
          if (s.axis === 'x' && -dx >= width() * RATIO) {
            setDx(-width());
            setGone(true);
            setTimeout(onDelete, 220);
          } else setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(false);
          setDx(0);
        }}
        // 마우스로 끌 때 안쪽 글이 선택·스크롤되지 않게
        onMouseDown={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          // 키보드(엔터·스페이스)로 누른 것
          if (e.detail === 0) onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') onDelete();
        }}
        aria-label={`${label} (왼쪽으로 밀면 지워요)`}
      >
        {children}
      </button>
    </div>
  );
}
