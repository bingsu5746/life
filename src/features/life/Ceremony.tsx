// 영화 시상식: 한 해를 장면마다 넘겨 보는 화면 (1월 1일 알림에서 열린다)
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { go, useToday } from '../study/ui';
import { useStudy } from '../study/store';
import { awards, watchedYears } from './awards';
import { starText } from './MovieParts';

interface Slide {
  key: string;
  label: string;
  main: string;
  sub?: ReactNode;
  stars?: string;
  quote?: string;
  list?: { title: string; stars: string }[];
  win?: boolean;
}

export function Ceremony({ onClose }: { onClose: () => void }) {
  const d = useStudy();
  const today = useToday();
  const years = watchedYears(d);
  // 1월에는 지난해, 아니면 올해 (본 영화가 있는 해 중에서)
  const wanted = Number(today.slice(5, 7)) === 1 ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4));
  const year = years.includes(wanted) ? wanted : years[0];
  const a = useMemo(() => (year ? awards(d, year) : null), [d, year]);
  const slides: Slide[] = useMemo(() => {
    if (!a || !year) return [];
    const s: Slide[] = [{ key: 'intro', label: `${year}`, main: '영화 시상식', sub: `${a.count}편을 봤고${a.avg ? ` 평균 별점은 ★ ${a.avg}` : ''}${a.rewatch ? ` · 다시 본 ${a.rewatch}번` : ''}` }];
    if (a.month) s.push({ key: 'month', label: '영화를 가장 많이 본 달', main: a.month.name, sub: `${a.month.count}편` });
    if (a.place) s.push({ key: 'place', label: '가장 많이 간 곳', main: a.place.name, sub: `${a.place.count}번` });
    if (a.genre) s.push({ key: 'genre', label: '올해의 장르', main: a.genre.name, sub: `${a.genre.count}편` });
    if (a.director) s.push({ key: 'director', label: '올해의 감독', main: a.director.name, sub: `${a.director.count}편` });
    if (a.worst) s.push({ key: 'worst', label: '아쉬웠던 영화', main: a.worst.title, stars: starText(a.worst.rating), quote: a.worst.comment });
    if (a.nominees.length) s.push({ key: 'nom', label: '후보작', main: '', list: [a.best, ...a.nominees].filter(Boolean).map((m) => ({ title: m!.title, stars: starText(m!.rating) })) });
    if (a.best) s.push({ key: 'best', label: `${year} 올해의 영화`, main: a.best.title, stars: starText(a.best.rating), quote: a.best.comment, win: true });
    return s;
  }, [a, year]);
  const [i, setI] = useState(0);
  const last = slides.length - 1;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') setI((x) => Math.min(last, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [last, onClose]);
  const sl = slides[i];
  return (
    <div className="cer" role="dialog" aria-label="영화 시상식">
      <button className="cer-x" aria-label="닫기" onClick={onClose}>
        ✕
      </button>
      {!sl ? (
        <div className="cer-slide">
          <small>시상식</small>
          <h2>아직 시상식을 열 영화가 없어요</h2>
          <button className="st-link" onClick={() => go('/movies/watched')}>
            본 영화 기록하러 가기
          </button>
        </div>
      ) : (
        <button className="cer-body" onClick={() => (i < last ? setI(i + 1) : onClose())} aria-label={i < last ? '다음' : '끝내기'}>
          <div key={sl.key} className={`cer-slide ${sl.win ? 'win' : ''}`}>
            <small>{sl.label}</small>
            {sl.main && <h2>{sl.main}</h2>}
            {sl.stars && <div className="cer-stars">{sl.stars}</div>}
            {sl.quote && <p>“{sl.quote}”</p>}
            {sl.sub && <p>{sl.sub}</p>}
            {sl.list && (
              <ol className="cer-list">
                {sl.list.map((x) => (
                  <li key={x.title}>
                    <b>{x.title}</b> <span>{x.stars}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </button>
      )}
      {slides.length > 1 && (
        <div className="cer-dots" aria-hidden>
          {slides.map((x, n) => (
            <i key={x.key} className={n === i ? 'on' : n < i ? 'past' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
