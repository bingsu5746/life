// Steam 게임 그림: 옛 주소로 먼저 그리고, 안 되면(요즘 게임은 주소에 고유 번호가 붙음) 서버에서 진짜 주소를 받아 다시. 그래도 없으면 작은 아이콘
import { useEffect, useState } from 'react';
import { steamThumb, steamThumbs } from '../auth/api';

const known = new Map<number, string>();
let queue = new Set<number>();
let timer = 0;
const waiters = new Map<number, ((u: string) => void)[]>();
function realThumb(appid: number): Promise<string> {
  if (known.has(appid)) return Promise.resolve(known.get(appid)!);
  return new Promise((ok) => {
    waiters.set(appid, [...(waiters.get(appid) ?? []), ok]);
    queue.add(appid);
    clearTimeout(timer);
    // 잠깐 모았다가 한 번에 묻는다
    timer = window.setTimeout(() => {
      const ids = [...queue];
      queue = new Set();
      steamThumbs(ids)
        .then((r) => ids.forEach((id) => known.set(id, r[id] ?? '')))
        .catch(() => ids.forEach((id) => known.set(id, '')))
        .finally(() =>
          ids.forEach((id) => {
            for (const f of waiters.get(id) ?? []) f(known.get(id) ?? '');
            waiters.delete(id);
          }),
        );
    }, 60);
  });
}

export function SteamImg({ appid, icon, className }: { appid: number; icon?: string; className?: string }) {
  const [src, setSrc] = useState(() => known.get(appid) || steamThumb(appid));
  const [step, setStep] = useState(0);
  useEffect(() => {
    setSrc(known.get(appid) || steamThumb(appid));
    setStep(0);
  }, [appid]);
  if (!src) return <span className={`dg-noimg ${className ?? ''}`} aria-hidden />;
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      onError={() => {
        if (step === 0) {
          setStep(1);
          void realThumb(appid).then((u) => setSrc(u && u !== src ? u : (icon ?? '')));
        } else setSrc(step === 1 && icon && src !== icon ? (setStep(2), icon) : '');
      }}
    />
  );
}
