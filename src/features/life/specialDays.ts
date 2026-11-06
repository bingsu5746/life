// 공휴일 · 기념일 (서버에서 받아 하루 동안 이 기기에 둔다). 달력 · 시험 화면이 같이 쓴다
import { useEffect, useState } from 'react';
import { isLoggedIn, specialDays, type SpecialDay } from '../auth/api';

export function useSpecialDays(year: number): SpecialDay[] {
  const ck = `my-study.special.${year}`;
  const read = (): { at: number; days: SpecialDay[] } | null => {
    try {
      return JSON.parse(localStorage.getItem(ck) ?? 'null');
    } catch {
      return null;
    }
  };
  const [days, setDays] = useState<SpecialDay[]>(() => read()?.days ?? []);
  useEffect(() => {
    const c = read();
    setDays(c?.days ?? []);
    if (!isLoggedIn() || (c && Date.now() - c.at < 86_400_000)) return;
    let live = true;
    specialDays(year)
      .then((r) => {
        if (!live) return;
        setDays(r.days);
        try {
          localStorage.setItem(ck, JSON.stringify({ at: Date.now(), days: r.days }));
        } catch {
          /* 무시 */
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  return days;
}
