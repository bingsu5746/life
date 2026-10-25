// 「＋」 하나로 모든 추가하기: 누르면 넣을 수 있는 것들이 나타난다 (화면마다 추가 버튼을 늘어놓지 않으려고)
import { useState } from 'react';
import { addToInbox } from './actions';
import { newId } from './model';
import { getStudy, put, useWords } from './store';
import { go, Icon, Sheet, toast } from './ui';

const ITEMS: { key: string; label: string; sub: string; to?: string }[] = [
  { key: 'todo', label: '할 일', sub: '오늘 할 일 한 줄' },
  { key: 'word', label: '모르는 단어', sub: '모르는 단어 모음에 바로' },
  { key: 'exam', label: '시험', sub: '시험 날 · 과목별 시험 범위', to: '/exams/new' },
  { key: 'progress', label: '학교 진도', sub: '오늘 학교에서 어디까지 나갔는지', to: '/exams/progress' },
  { key: 'preview', label: '예습', sub: '내일 수업 전에 미리 볼 곳', to: '/preview/new' },
  { key: 'task', label: '수행평가', sub: '내는 날 · 준비할 것', to: '/exams/tasks/new' },
  { key: 'blank', label: '백지 복습', sub: '단원 이름 · 핵심 내용', to: '/review/new-blank' },
  { key: 'book', label: '문제집', sub: '목차를 넣고 하루 분량 계획', to: '/books/new' },
  { key: 'hw', label: '과외 숙제', sub: '마감은 다음 수업일로', to: '/tutor/hw' },
  { key: 'words', label: '단어 목록', sub: '단어장 · 단어 시험 (PDF·붙여넣기·사진)', to: '/words/new' },
  { key: 'note', label: '오답', sub: '사진·정답·틀린 이유', to: '/review/new-note' },
  { key: 'deck', label: '암기 카드 묶음', sub: '앞면 | 뒷면', to: '/review/new-deck' },
  { key: 'habit', label: '습관', sub: '매일 또는 요일마다', to: '/life/new-habit' },
  { key: 'tutor', label: '과외', sub: '수업 요일 · 휴강 · 보강', to: '/tutor/new' },
  { key: 'time', label: '공부 시간', sub: '타이머 없이 직접 넣기', to: '/time/manual' },
];

export function AddButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="st-fab" aria-label="새로 추가" onClick={() => setOpen(true)}>
        <Icon name="plus" />
      </button>
      {open && <AddSheet today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const [quick, setQuick] = useState<'todo' | 'word' | null>(null);
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
          <p className="st-hint">Enter 로 넣어요. 여러 개를 계속 넣을 수 있어요.</p>
        </form>
      </Sheet>
    );

  return (
    <Sheet title="추가" onClose={onClose}>
      <div className="st-addlist">
        {ITEMS.filter((i) => i.key !== 'preview' || !getStudy().settings.hiddenTabs?.includes('preview')).map((i) => (
          <button
            key={i.key}
            className="st-addrow"
            onClick={() => {
              if (i.to) {
                onClose();
                go(i.to);
              } else setQuick(i.key as 'todo' | 'word');
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
    </Sheet>
  );
}
