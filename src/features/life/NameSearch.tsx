// 이름을 치면 목록에서 찾아 주는 칸 (게임 · 책 · 음반). 하나 고르면 다시 칠 때까지 목록을 닫는다.
import { useEffect, useState } from 'react';
import { isLoggedIn, lookup, type Found } from '../auth/api';

export function NameSearch({ type, value, onChange, onPick, placeholder, label, picked: picked0 }: { type: 'game' | 'book' | 'music'; value: string; onChange: (v: string) => void; onPick: (f: Found) => void; placeholder: string; label: string; picked?: boolean }) {
  const [items, setItems] = useState<Found[]>([]);
  const [picked, setPicked] = useState(!!picked0);
  const [off, setOff] = useState(false);
  useEffect(() => {
    const q = value.trim();
    if (picked || off || q.length < 2 || !isLoggedIn()) return setItems([]);
    let on = true;
    const t = setTimeout(() => {
      lookup(type, q)
        .then((r) => on && setItems(r.items))
        .catch(() => {
          // 키가 없거나 서버 오류면 그냥 직접 쓰게 둔다
          if (on) {
            setItems([]);
            setOff(true);
          }
        });
    }, 350);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [value, picked, off, type]);
  return (
    <>
      <input className="st-input" autoFocus={!picked0} value={value} onChange={(e) => (onChange(e.target.value), setPicked(false))} placeholder={placeholder} aria-label={label} />
      {items.length > 0 && (
        <div className="mv-found" role="listbox" aria-label={`${label} 찾기`}>
          {items.map((f, i) => (
            <button
              key={`${f.title}-${i}`}
              type="button"
              role="option"
              aria-selected={false}
              className="mv-found-item"
              onClick={() => {
                onPick(f);
                setPicked(true);
                setItems([]);
              }}
            >
              <b>{f.title}</b>
              <small className="st-muted">{[f.by, f.year, f.extra].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
