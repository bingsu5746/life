// 공부 화면들이 같이 쓰는 작은 부품
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { studyDate, WEEKDAYS } from './dates';
import { alive, newId, SUBJECT_COLORS, type Id, type StudyData, type Subject } from './model';
import { put, useStudy } from './store';

export const go = (path: string) => {
  window.location.hash = path;
};

/** 오늘(공부 날짜). 1분마다, 창으로 돌아올 때 다시 본다 */
export function useToday(): string {
  const { dayStart } = useStudy().settings;
  const [today, setToday] = useState(() => studyDate(Date.now(), dayStart));
  useEffect(() => {
    const tick = () => setToday(studyDate(Date.now(), dayStart));
    tick();
    const t = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [dayStart]);
  return today;
}

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function subjectsOf(d: StudyData): Subject[] {
  return alive(d.subjects).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function SubjectDot({ id, d }: { id?: Id; d: StudyData }) {
  const s = id ? d.subjects[id] : undefined;
  return <span className="st-dot" style={{ background: s && !s.deleted ? s.color : 'var(--muted)' }} aria-hidden />;
}

export function SubjectTag({ id, d }: { id?: Id; d: StudyData }) {
  const s = id ? d.subjects[id] : undefined;
  if (!s || s.deleted) return null;
  return (
    <span className="st-tag" style={{ ['--c' as string]: s.color }}>
      {s.name}
    </span>
  );
}

/** 과목 고르기 (없으면 바로 새로 만들기) */
export function SubjectPicker({ value, onChange }: { value: Id; onChange: (id: Id) => void }) {
  const d = useStudy();
  const subjects = subjectsOf(d);
  const [adding, setAdding] = useState(!subjects.length);
  const [name, setName] = useState('');
  function add() {
    const n = name.trim();
    if (!n) return;
    const id = newId();
    put('subjects', { id, name: n, color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length], order: subjects.length });
    onChange(id);
    setName('');
    setAdding(false);
  }
  return (
    <div className="st-chips" role="radiogroup" aria-label="과목">
      {subjects.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className={`st-chip ${value === s.id ? 'on' : ''}`} style={{ ['--c' as string]: s.color }} onClick={() => onChange(s.id)}>
          {s.name}
        </button>
      ))}
      {adding ? (
        <span className="st-inline">
          <input autoFocus className="st-input sm" placeholder="과목 이름 (예: 수학)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          <button type="button" className="btn btn-sm btn-primary" onClick={add}>
            추가
          </button>
        </span>
      ) : (
        <button type="button" className="st-chip add" onClick={() => setAdding(true)}>
          ＋ 과목
        </button>
      )}
    </div>
  );
}

export function WeekdayPicker({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  return (
    <div className="st-weekdays" role="group" aria-label={label}>
      {WEEKDAYS.map((w, i) => (
        <button key={w} type="button" aria-pressed={value.includes(i)} className={`st-wd ${value.includes(i) ? 'on' : ''} ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`} onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}>
          {w}
        </button>
      ))}
    </div>
  );
}

/** 아래에서 올라오는 창 (폰) / 가운데 창 (PC) */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    ref.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="st-sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`st-sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <h3>{title}</h3>
          <button className="st-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="st-sheet-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * 이름 붙은 칸. 입력 하나면 <label> 로 묶고, 버튼 여러 개(과목·요일 고르기 등)면 <div role="group"> 으로:
 * <label> 안의 버튼을 누르면 브라우저가 그 클릭을 첫 번째 버튼으로 넘겨 버리기 때문.
 */
export function Field({ label, hint, children, group }: { label: string; hint?: ReactNode; children: ReactNode; group?: boolean }) {
  const body = (
    <>
      <span className="st-label">{label}</span>
      {children}
      {hint && <span className="st-hint">{hint}</span>}
    </>
  );
  return group ? (
    <div className="st-field" role="group" aria-label={label}>
      {body}
    </div>
  ) : (
    <label className="st-field">{body}</label>
  );
}

/** 진행 막대 (흑백 디자인이라 색은 받지 않고 늘 검은색) */
export function Bar({ value, max }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="st-bar" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="st-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

const ICON_PATHS: Record<string, string> = {
  today: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  books: 'M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5C4.7 20 4 19.3 4 18.5zM13 4h5.5c.8 0 1.5.7 1.5 1.5v13c0 .8-.7 1.5-1.5 1.5H13z',
  tutor: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.5 3.8-6 7.5-6s6.7 2.5 7.5 6',
  words: 'M3.5 18L8 6l4.5 12M5.2 13.5h5.6M15 10.5c.7-.6 1.5-.9 2.5-.9 1.7 0 3 1 3 3V18M20.5 14.5c-1-.4-2-.5-3-.4-1.6.2-2.6 1-2.6 2.2 0 1.1.9 1.8 2.1 1.8 1.6 0 2.8-.9 3.5-2.2',
  review: 'M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5',
  time: 'M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 8v4.5l3 2',
  life: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 12l2.8 2.8L16.5 9',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
};

/** 선 아이콘 (24×24) */
export function Icon({ name }: { name: string }) {
  return (
    <svg className="st-icon" viewBox="0 0 24 24" aria-hidden>
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

export function Check({ on, onClick, label, color }: { on: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button type="button" className={`st-check ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} aria-label={label} style={color ? { ['--c' as string]: color } : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M5 12.5l4.2 4.2L19 7" />
      </svg>
    </button>
  );
}

export function confirmDelete(what: string) {
  return window.confirm(`${what}을(를) 지울까요?`);
}

/** 작은 알림 (몇 초 뒤 사라짐) */
let toastFn: ((msg: string) => void) | null = null;
export const toast = (msg: string) => toastFn?.(msg);
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t = 0;
    toastFn = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), 2800);
    };
    return () => {
      toastFn = null;
      clearTimeout(t);
    };
  }, []);
  return msg ? (
    <div className="st-toast" role="status">
      {msg}
    </div>
  ) : null;
}
