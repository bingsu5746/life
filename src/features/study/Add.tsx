// 「＋」 하나로 모든 추가하기: 누르면 넣을 수 있는 것들이 나타난다 (화면마다 추가 버튼을 늘어놓지 않으려고)
import { useState } from 'react';
import { addToInbox } from './actions';
import { newId } from './model';
import { addDays, shortDate } from './dates';
import { splitHomework } from './splitHomework';
import { getStudy, put, useWords } from './store';
import { Field, go, Icon, Sheet, toast } from './ui';

const ITEMS: { key: string; label: string; sub: string; to?: string }[] = [
  { key: 'todo', label: '할 일', sub: '오늘 할 일 한 줄' },
  { key: 'split', label: '숙제 (자동 나누기)', sub: '분량과 마감일을 넣으면 날마다 나눠서 할 일로' },
  { key: 'word', label: '모르는 단어', sub: '모르는 단어 모음에 바로' },
  { key: 'exam', label: '시험', sub: '시험 날 · 과목별 시험 범위', to: '/exams/new' },
  { key: 'progress', label: '학교 진도', sub: '오늘 학교에서 어디까지 나갔는지', to: '/exams/progress' },
  { key: 'preview', label: '예습', sub: '내일 수업 전에 미리 볼 곳', to: '/preview/new' },
  { key: 'task', label: '수행평가', sub: '내는 날 · 준비할 것', to: '/exams/tasks/new' },
  { key: 'blank', label: '백지 복습', sub: '단원 이름 · 핵심 내용', to: '/review/new-blank' },
  { key: 'book', label: '문제집', sub: '목차를 넣고 하루 분량 계획', to: '/books/new' },
  { key: 'paper', label: '푼 기출·모의고사', sub: '점수 · 틀린 번호 · 걸린 시간', to: '/books/papers/new' },
  { key: 'hw', label: '과외 숙제', sub: '마감은 다음 수업일로', to: '/tutor/hw' },
  { key: 'words', label: '단어 목록', sub: '단어장 · 단어 시험 (PDF·붙여넣기·사진)', to: '/words/new' },
  { key: 'note', label: '오답', sub: '사진·정답·틀린 이유', to: '/review/new-note' },
  { key: 'passage', label: '지문', sub: '국어·영어 지문 (헷갈린 점·해석)', to: '/review/new-passage' },
  { key: 'deck', label: '암기 카드 묶음', sub: '앞면 | 뒷면', to: '/review/new-deck' },
  { key: 'habit', label: '습관', sub: '매일 또는 요일마다', to: '/life/new-habit' },
  { key: 'tutor', label: '과외', sub: '수업 요일 · 휴강 · 보강', to: '/tutor/new' },
  { key: 'time', label: '공부 시간', sub: '타이머 없이 직접 넣기', to: '/time/manual' },
];

/** 화면(칸)마다 먼저 보여 줄 것만. 나머지는 「전부 보기」 */
const BY_TAB: Record<string, string[]> = {
  today: ['todo', 'split', 'word', 'time'],
  exams: ['exam', 'progress', 'task', 'split'],
  books: ['book', 'paper', 'split'],
  preview: ['preview'],
  tutor: ['hw', 'tutor', 'split'],
  words: ['words', 'word'],
  translate: ['word', 'words'],
  review: ['note', 'passage', 'blank', 'deck'],
  time: ['time'],
  life: ['todo', 'split', 'habit'],
};

export function AddButton({ today, tab = 'today' }: { today: string; tab?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="st-fab" aria-label="새로 추가" onClick={() => setOpen(true)}>
        <Icon name="plus" />
      </button>
      {open && <AddSheet today={today} tab={tab} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddSheet({ today, tab, onClose }: { today: string; tab: string; onClose: () => void }) {
  const [quick, setQuick] = useState<'todo' | 'word' | 'split' | null>(null);
  const [all, setAll] = useState(false);
  const [text, setText] = useState('');
  const words = useWords();

  function submit() {
    const t = text.trim();
    if (!t) return;
    if (quick === 'todo') {
      put('todos', { id: newId(), title: t, due: today, done: false, created: Date.now() });
      toast('오늘 할 일에 넣었어요');
    } else {
      const m = t.match(/^([A-Za-z][A-Za-z '\-.]*?)\s*(?:[:\-–]\s*)?([^A-Za-z].*)?$/);
      const term = (m?.[1] ?? t).trim();
      addToInbox(term, (m?.[2] ?? '').trim(), words, today);
      toast(`「${term}」를 모르는 단어 모음에 넣었어요`);
    }
    setText('');
  }

  if (quick === 'split') return <SplitSheet today={today} onClose={onClose} />;

  if (quick)
    return (
      <Sheet title={quick === 'todo' ? '할 일' : '모르는 단어'} onClose={onClose}>
        <form
          className="st-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input className="st-input" autoFocus placeholder={quick === 'todo' ? '예: 수행평가 자료 찾기' : '예: resilience 회복력'} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="st-hint">Enter로 넣어요. 여러 개를 계속 넣을 수 있어요.</p>
        </form>
      </Sheet>
    );

  return (
    <Sheet title="추가" onClose={onClose}>
      <div className="st-addlist">
        {ITEMS.filter((i) => i.key !== 'preview' || !getStudy().settings.hiddenTabs?.includes('preview'))
          .filter((i) => all || !BY_TAB[tab] || BY_TAB[tab].includes(i.key))
          .sort((a, b) => (all || !BY_TAB[tab] ? 0 : BY_TAB[tab].indexOf(a.key) - BY_TAB[tab].indexOf(b.key)))
          .map((i) => (
            <button
              key={i.key}
              className="st-addrow"
              onClick={() => {
                if (i.to) {
                  onClose();
                  go(i.to);
                } else setQuick(i.key as 'todo' | 'word' | 'split');
              }}
            >
              <span>
                <b>{i.label}</b>
                <small>{i.sub}</small>
              </span>
              <Icon name="chevron" />
            </button>
          ))}
      </div>
      {!all && BY_TAB[tab] && (
        <button className="st-link" onClick={() => setAll(true)}>
          전부 보기
        </button>
      )}
    </Sheet>
  );
}

const UNITS = ['쪽', '문제', '개', '장', '단원'];

/** 숙제 하나를 날마다 나눠 「할 일」로 넣는다 */
function SplitSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [start, setStart] = useState('1');
  const [unit, setUnit] = useState('쪽');
  const [due, setDue] = useState(addDays(today, 7));
  const [includeDue, setIncludeDue] = useState(false);
  const n = Number(total);
  const first = Math.max(1, Math.floor(Number(start)) || 1);
  const parts = n >= 1 ? splitHomework(Math.floor(n), first, today, due, includeDue, getStudy().settings.offDates) : [];
  const label = (p: { from: number; to: number }) => (p.from === p.to ? `${p.from}${unit}` : `${p.from}~${p.to}${unit}`);
  return (
    <Sheet title="숙제 자동 나누기" onClose={onClose}>
      <div className="st-form">
        <input className="st-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 수학 학원 숙제" aria-label="숙제 이름" />
        <div className="st-inline wrap">
          <input className="st-input xs" inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value.replace(/\D/g, ''))} aria-label="시작 번호" />
          <span>부터 총</span>
          <input className="st-input xs" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} placeholder="40" aria-label="총 분량" />
          <div className="st-chips">
            {UNITS.map((u) => (
              <button key={u} type="button" className={`st-chip ${unit === u ? 'on' : ''}`} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <label className="st-cond-time">
          마감
          <input className="st-input sm" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="st-toggle">
          <input type="checkbox" checked={includeDue} onChange={(e) => setIncludeDue(e.target.checked)} /> 마감 날에도 나눠 넣기 (기본: 전날까지)
        </label>
        {parts.length > 0 && (
          <Field label={`${parts.length}일에 나눠요`}>
            <ul className="st-split">
              {parts.slice(0, 14).map((p) => (
                <li key={p.date}>
                  <span>{shortDate(p.date)}</span> <b>{label(p)}</b>
                </li>
              ))}
              {parts.length > 14 && <li className="st-muted">… 그 뒤 {parts.length - 14}일</li>}
            </ul>
          </Field>
        )}
        <div className="st-row end">
          <button
            className="btn btn-primary"
            disabled={!title.trim() || !parts.length || due < today}
            onClick={() => {
              const group = newId();
              const now = Date.now();
              parts.forEach((p, i) => put('todos', { id: newId(), title: `${title.trim()} · ${label(p)}`, due: p.date, done: false, group, split: { base: title.trim(), unit, from: p.from, to: p.to }, created: now + i }));
              toast(`${parts.length}일치 할 일로 넣었어요`);
              onClose();
            }}
          >
            할 일로 넣기
          </button>
        </div>
      </div>
    </Sheet>
  );
}
