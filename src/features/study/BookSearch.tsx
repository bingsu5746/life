// 책 이름을 치면 예스24(안 되면 국립중앙도서관) 목록에서 찾아 주는 칸 (문제집 · 독서). 하나 고르면 다시 칠 때까지 목록을 닫는다.
import { useEffect, useState } from 'react';
import { bookSearch, isLoggedIn, type BookHit } from '../auth/api';

export function BookSearch({ value, onChange, onPick, placeholder, label, picked: picked0 }: { value: string; onChange: (v: string) => void; onPick: (b: BookHit) => void; placeholder: string; label: string; picked?: boolean }) {
  const [items, setItems] = useState<BookHit[]>([]);
  const [picked, setPicked] = useState(!!picked0);
  const [note, setNote] = useState('');
  useEffect(() => {
    const q = value.trim();
    if (picked || q.length < 2 || !isLoggedIn()) return setItems([]);
    let on = true;
    const t = setTimeout(() => {
      bookSearch(q)
        .then((r) => {
          if (!on) return;
          setItems(r.list.slice(0, 8));
          setNote(r.needKey ? '책 찾기는 예스24 · 국립중앙도서관 키가 있어야 돼요 (지금은 직접 써 주세요)' : '');
        })
        .catch(() => on && setItems([]));
    }, 400);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [value, picked]);
  return (
    <>
      <input className="st-input" value={value} onChange={(e) => (onChange(e.target.value), setPicked(false))} placeholder={placeholder} aria-label={label} />
      {note && <small className="st-muted">{note}</small>}
      {items.length > 0 && (
        <div className="mv-found" role="listbox" aria-label={`${label} 찾기`}>
          {items.map((b, i) => (
            <button
              key={`${b.isbn}-${i}`}
              type="button"
              role="option"
              aria-selected={false}
              className="mv-found-item bk-found"
              onClick={() => {
                onPick(b);
                setPicked(true);
                setItems([]);
              }}
            >
              {b.cover && <img src={b.cover} alt="" loading="lazy" />}
              <span>
                <b>{b.title}</b>
                <small className="st-muted">{[b.author, b.publisher, b.date.slice(0, 4), b.sale || b.price ? `${(b.sale || b.price).toLocaleString('ko-KR')}원` : '', b.toc || b.tocText ? '목차 있음' : ''].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
