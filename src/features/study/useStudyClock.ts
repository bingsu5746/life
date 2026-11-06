// 단어 외우기 · 연습 · 듣기 하는 동안 공부 시간이 저절로 쌓인다 (끝나거나 화면을 떠날 때 공부 기록에 넣음).
// 누르는 화면은 손을 댄 사이의 시간만 센다 (한 번에 90초까지, 멍하니 둔 시간은 빼려고). 듣기처럼 손을 안 대는 것은 켜 둔 시간.
import { useEffect, useRef } from 'react';
import { addSession } from './actions';
import { alive, type Id } from './model';
import { getStudy } from './store';

const GAP = 90_000;

/** 단어 목록의 과목 (없으면 「영어」 과목) */
export function wordSubject(listId?: string): Id | undefined {
  const d = getStudy();
  const l = listId ? d.wordLists[listId] : undefined;
  if (l?.subjectId && d.subjects[l.subjectId] && !d.subjects[l.subjectId].deleted) return l.subjectId;
  if (l?.lang === 'ko') return alive(d.subjects).find((s) => /국어/.test(s.name))?.id;
  return alive(d.subjects).find((s) => /영어|english/i.test(s.name))?.id;
}

export function useStudyClock(active: boolean, subjectId: Id | undefined, memo: string, passive = false) {
  const ms = useRef(0);
  const last = useRef(0);
  const started = useRef(0);
  const flush = () => {
    if (passive && last.current) ms.current += Date.now() - last.current;
    last.current = 0;
    const min = Math.round(ms.current / 60_000);
    if (min >= 1) {
      const end = Date.now();
      addSession({ subjectId, start: started.current || end - ms.current, end, minutes: min, date: new Date(end + 9 * 3_600_000).toISOString().slice(0, 10), kind: 'manual', memo });
    }
    ms.current = 0;
    started.current = 0;
  };
  useEffect(() => {
    if (!active) return;
    started.current = Date.now();
    last.current = Date.now();
    if (passive) return () => flush();
    const poke = () => {
      const now = Date.now();
      ms.current += Math.min(GAP, now - last.current);
      last.current = now;
    };
    window.addEventListener('pointerdown', poke, true);
    window.addEventListener('keydown', poke, true);
    return () => {
      window.removeEventListener('pointerdown', poke, true);
      window.removeEventListener('keydown', poke, true);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, subjectId, passive]);
}
