// 메인 구석의 작은 「공부 모드」 스위치: 누르거나 옆으로 밀면 켜고 끈다
import { useRef } from 'react';
import { setStudyMode, useStudyMode } from '../../lib/studyMode';
import { toast } from '../study/ui';

export function StudyModeToggle() {
  const on = useStudyMode();
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const flip = (next: boolean) => {
    if (next === on) return;
    setStudyMode(next);
    toast(next ? '📚 공부 모드: 공부 · AI 만 보여요' : '공부 모드를 껐어요');
  };
  return (
    <button
      type="button"
      className={`sm-toggle ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label="공부 모드"
      title="공부 모드 (누르거나 옆으로 밀기)"
      onPointerDown={(e) => {
        start.current = e.clientX;
        moved.current = false;
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        const dx = e.clientX - start.current;
        if (Math.abs(dx) > 18) {
          moved.current = true;
          start.current = null;
          flip(dx > 0);
        }
      }}
      onPointerUp={() => (start.current = null)}
      onClick={() => {
        if (moved.current) return;
        flip(!on);
      }}
    >
      <span className="sm-track">
        <i />
      </span>
      <small>공부 모드</small>
    </button>
  );
}
