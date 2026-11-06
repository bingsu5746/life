// 이번 달 하이라이트: 그달 일기의 사진 · 영상을 날짜순으로 짧게 이어 본다 (사진 3초 · 영상은 끝까지, 10초 안)
import { useEffect, useRef, useState } from 'react';
import { shortDate } from '../study/dates';
import { alive } from '../study/model';
import { photoUrl } from '../study/photos';
import { useStudy } from '../study/store';
import { Empty, go, useToday } from '../study/ui';
import { videoUrl } from '../study/videos';
import { monthLabel, shiftMonth } from './calc';

const PHOTO_MS = 3000;
type Clip = { kind: 'photo' | 'video'; id: string; date: string; title: string };

export function Highlight({ month: m0 }: { month?: string }) {
  const d = useStudy();
  const today = useToday();
  const month = m0 && /^\d{4}-\d{2}$/.test(m0) ? m0 : today.slice(0, 7);
  const clips: Clip[] = alive(d.diary)
    .filter((e) => e.id.startsWith(month))
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((e) => {
      const title = e.title || e.text.split('\n')[0]?.slice(0, 40) || '';
      return [...(e.photos ?? []).map((id) => ({ kind: 'photo' as const, id, date: e.id, title })), ...(e.videos ?? []).map((id) => ({ kind: 'video' as const, id, date: e.id, title }))];
    });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [t, setT] = useState(0);
  const vid = useRef<HTMLVideoElement>(null);
  const clip = clips[i];
  const key = clips.map((c) => c.id).join();
  useEffect(() => {
    setI(0);
    setPlaying(true);
  }, [month, key]);
  // 이 장면 받기
  useEffect(() => {
    if (!clip) return;
    let on = true;
    setUrl(undefined);
    setT(0);
    void (clip.kind === 'photo' ? photoUrl(clip.id) : videoUrl(clip.id)).then((u) => on && setUrl(u));
    return () => {
      on = false;
    };
  }, [clip?.id, clip?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => setI((x) => (x + 1 < clips.length ? x + 1 : (setPlaying(false), x)));
  // 사진: 3초 뒤 다음. 못 받은 장면은 바로 넘긴다
  useEffect(() => {
    if (!clip || !playing || url === undefined) return;
    if (url === null) return void next();
    if (clip.kind !== 'photo') return;
    const start = Date.now() - t * PHOTO_MS;
    const iv = setInterval(() => {
      const r = (Date.now() - start) / PHOTO_MS;
      if (r >= 1) {
        clearInterval(iv);
        next();
      } else setT(r);
    }, 50);
    return () => clearInterval(iv);
  }, [clip?.id, playing, url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (playing) void v.play().catch(() => {});
    else v.pause();
  }, [playing, url]);

  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{monthLabel(month)} 하이라이트</h2>
        <div className="st-inline">
          <button className="btn btn-sm" aria-label="지난달" onClick={() => go(`/diary/highlight-${shiftMonth(month, -1)}`)}>
            ‹
          </button>
          {month < today.slice(0, 7) && (
            <button className="btn btn-sm" aria-label="다음 달" onClick={() => go(`/diary/highlight-${shiftMonth(month, 1)}`)}>
              ›
            </button>
          )}
        </div>
      </div>
      {!clips.length ? (
        <Empty title="이 달 일기에 사진 · 영상이 없어요">일기에 사진이나 10초 영상을 넣으면 한 달 치를 이어서 보여 드려요.</Empty>
      ) : (
        <>
          <div className="hl-bars" aria-hidden>
            {clips.map((c, j) => (
              <i key={`${c.id}${j}`}>
                <b style={{ width: j < i ? '100%' : j > i ? '0%' : `${Math.round(t * 100)}%` }} />
              </i>
            ))}
          </div>
          <div className="hl-stage" onClick={() => setPlaying(!playing)}>
            {url === undefined ? (
              <div className="hl-wait">불러오는 중…</div>
            ) : url && clip.kind === 'photo' ? (
              <img src={url} alt={`${shortDate(clip.date)} 사진`} />
            ) : url ? (
              <video
                key={clip.id}
                ref={vid}
                src={url}
                playsInline
                autoPlay={playing}
                onTimeUpdate={(e) => setT(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
                onEnded={() => playing && next()}
              />
            ) : null}
            <div className="hl-cap">
              <b>{shortDate(clip.date)}</b>
              {clip.title && <span>{clip.title}</span>}
            </div>
            {!playing && <div className="hl-paused">▶</div>}
          </div>
          <div className="st-inline between hl-ctl">
            <button className="btn btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}>
              ‹ 앞
            </button>
            <small className="st-muted">
              {i + 1} / {clips.length}
            </small>
            {i + 1 < clips.length ? (
              <button className="btn btn-sm" onClick={() => setI(i + 1)}>
                다음 ›
              </button>
            ) : (
              <button
                className="btn btn-sm"
                onClick={() => {
                  setI(0);
                  setPlaying(true);
                }}
              >
                처음부터
              </button>
            )}
          </div>
          <button className="st-link" onClick={() => go(`/diary/${clip.date}`)}>
            이 날 일기 보기
          </button>
        </>
      )}
    </div>
  );
}
