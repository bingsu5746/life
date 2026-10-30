// 공부 화면들이 같이 쓰는 작은 부품
import { useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 아래에서 올라오는 창 (폰) / 가운데 창 (PC) */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // 부르는 쪽이 그릴 때마다 새 onClose 를 넘겨도 창을 처음 열 때만 칸에 커서를 둔다 (1초마다 커서가 튀지 않게)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // 닫을 때: 내려가며 사라지는 모습을 보여 준 뒤 닫는다
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeRef = useRef(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return onCloseRef.current();
    setClosing(true);
    setTimeout(() => onCloseRef.current(), 190);
  });
  const close = () => closeRef.current();
  // 폰: 머리 부분을 아래로 끌어 내려 닫기
  const drag = useRef<{ y: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeRef.current();
      if (e.key !== 'Tab' || !ref.current) return;
      // 창 안에서만 Tab 이 돌게
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', key);
    if (!ref.current?.contains(document.activeElement)) (ref.current?.querySelector<HTMLElement>('input:not([hidden]):not([type=file]):not([type=checkbox]), textarea, select') ?? ref.current)?.focus();
    return () => {
      window.removeEventListener('keydown', key);
      // 닫으면 연 단추로 돌아간다
      if (before && before.isConnected && before !== document.body) before.focus();
    };
  }, []);
  return (
    <div className={`st-sheet-bg ${closing ? 'closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`st-sheet ${wide ? 'wide' : ''} ${dy ? 'dragging' : ''}`} style={dy ? { transform: `translateY(${dy}px)` } : undefined} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header
          onPointerDown={(e) => {
            if (e.pointerType !== 'touch' || (e.target as HTMLElement).closest('button')) return;
            drag.current = { y: e.clientY, id: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => drag.current?.id === e.pointerId && setDy(Math.max(0, e.clientY - drag.current.y))}
          onPointerUp={(e) => {
            if (drag.current?.id !== e.pointerId) return;
            drag.current = null;
            if (dy > 90) close();
            setDy(0);
          }}
          onPointerCancel={() => ((drag.current = null), setDy(0))}
        >
          <h3>{title}</h3>
          <button className="st-x" onClick={close} aria-label="닫기">
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
export function Bar({ value, max, label = '진행' }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="st-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuenow={value} aria-valuemax={max}>
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
  'area-home': 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  'area-study': 'M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z',
  'area-fitness': 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  'area-money': 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v.01M18 14v.01',
  'area-hobby': 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  'area-movies': 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  'area-diary': 'M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h7M8 12h7M8 16h4',
  translate: 'M4 5h8M8 3v2M10 5c-.5 3.5-2.5 6-5.5 7.5M6 8c1 2 2.6 3.4 4.5 4.2M13 20l4-9 4 9M14.4 17h5.2',
  preview: 'M4 6h16M4 12h9M4 18h6M15 15l3 3-3 3M13 18h5',
  life: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 12l2.8 2.8L16.5 9',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  exams: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 14l2 2 4-4',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  game: 'M7 7h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7.2 2.4L13 14h-2l-1.8 1.4A4 4 0 0 1 2 13v-1a5 5 0 0 1 5-5zM7 10v4M5 12h4M15.5 11h.01M18 13h.01',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  pin: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  music: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 12h.01',
  plus: 'M12 5v14M5 12h14',
  solve: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  up: 'M12 19V5M6 11l6-6 6 6',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  chevron: 'M9 6l6 6-6 6',
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

/** 받침이 있는지 (한글·숫자만 알 수 있다. 모르면 null) */
function hasBatchim(word: string): boolean | null {
  const s = word.replace(/[\s」』"'’)\].,!?…]+$/u, '');
  const ch = s.slice(-1);
  if (!ch) return null;
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  // 0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 은 받침이 있다
  if (/[0-9]/.test(ch)) return '013678'.includes(ch);
  return null;
}

/** 낱말 뒤에 붙는 조사: josa('수학', '을', '를') → '을'. 받침을 모르면 「을(를)」 */
export function josa(word: string, withBatchim: string, without: string): string {
  const b = hasBatchim(word);
  return b === null ? `${withBatchim}(${without})` : b ? withBatchim : without;
}

export function confirmDelete(what: string, extra = '') {
  return window.confirm(`${what}${josa(what, '을', '를')} 지울까요?${extra ? '\n' + extra : ''}`);
}

/** 줄 전체를 누를 수 있는 곳 (div): 키보드 Enter·스페이스로도 누를 수 있게 */
export function tap(onClick: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      onClick();
    },
  };
}

type InputRest = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'defaultValue' | 'min' | 'max'>;

/**
 * 숫자 칸. 저장된 값이 바뀌면(다른 기기에서 와도) 따라 바뀌고,
 * 칸을 떠나거나 Enter를 누를 때 값이 정말 달라졌을 때만 저장한다 (같은 값을 다시 저장해 다른 기기의 고침을 덮지 않게).
 */
export function NumInput({ value, onCommit, min, max, allowEmpty, ...rest }: { value: number | null | undefined; onCommit: (v: number | null) => void; min: number; max: number; allowEmpty?: boolean } & InputRest) {
  const shown = value == null ? '' : String(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  function commit() {
    setEditing(false);
    const t = text.trim();
    let next: number | null = value ?? null;
    if (!t) next = allowEmpty ? null : (value ?? null);
    else if (Number.isFinite(Number(t))) next = Math.min(max, Math.max(min, Number(t)));
    if (next !== (value ?? null)) onCommit(next);
    else setText(shown);
  }
  return <input {...rest} inputMode="decimal" value={text} onFocus={() => setEditing(true)} onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

/** 글 칸: NumInput 처럼 저장된 값을 따라가고, 바뀌었을 때만 저장 */
export function TextInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & InputRest) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);
  return (
    <input
      {...rest}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const t = text.trim();
        if (t && t !== value) onCommit(t);
        else setText(value);
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** 작은 알림 (몇 초 뒤 사라짐) */
let toastFn: ((msg: string) => void) | null = null;
export const toast = (msg: string) => toastFn?.(msg);
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  const [out, setOut] = useState(false);
  useEffect(() => {
    let t = 0;
    let t2 = 0;
    let shownAt = 0;
    toastFn = (m) => {
      setMsg(m);
      setOut(false);
      shownAt = Date.now();
      clearTimeout(t);
      clearTimeout(t2);
      t = window.setTimeout(() => setOut(true), 2600);
      t2 = window.setTimeout(() => setMsg(null), 2800);
    };
    // 다른 화면으로 가면 지난 알림은 지운다 (누르자마자 화면이 바뀌는 알림은 남긴다)
    const onNav = () => Date.now() - shownAt > 800 && setMsg(null);
    window.addEventListener('hashchange', onNav);
    return () => {
      toastFn = null;
      clearTimeout(t);
      clearTimeout(t2);
      window.removeEventListener('hashchange', onNav);
    };
  }, []);
  return msg ? (
    <div key={msg} className={`st-toast ${out ? 'out' : ''}`} role="status">
      {msg}
    </div>
  ) : null;
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** ⋯ 버튼: 누르면 그 자리에 할 수 있는 일이 나타난다 (평소에는 버튼을 늘어놓지 않으려고) */
export function Menu({ items, label = '더 보기' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // 열면 첫 항목에 (키보드로 바로 고를 수 있게)
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
        if (e instanceof KeyboardEvent) ref.current?.querySelector<HTMLElement>('.st-iconbtn')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const shown = items.filter((i) => !i.hidden);
  return (
    <div className="st-menu" ref={ref}>
      <button type="button" className="st-iconbtn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more" />
      </button>
      {open && (
        <div
          className="st-menu-list"
          role="menu"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
            e.preventDefault();
            const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
            const i = items.indexOf(document.activeElement as HTMLElement);
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {shown.map((i) => (
            <button
              key={i.label}
              type="button"
              role="menuitem"
              className={i.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
