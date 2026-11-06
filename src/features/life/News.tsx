// 뉴스: 국내(Google 뉴스 RSS, 한국어) · 세계(The Guardian, 한국어로 옮기고 영어 원문도 볼 수 있음)
import { useEffect, useState } from 'react';
import { isLoggedIn, krNews, worldNews, type WorldNews } from '../auth/api';
import { Empty } from '../study/ui';

/** 메뉴 칸 → 어디서 받을지 (국내: Google 뉴스 RSS, 세계: The Guardian + 한국어 번역) */
const FEEDS: Record<string, { name: string; kr?: string; world?: string }> = {
  '': { name: '오늘의 뉴스', kr: 'top', world: 'world' },
  kr: { name: '국내', kr: 'nation' },
  biz: { name: '경제', kr: 'business' },
  it: { name: 'IT · 과학', kr: 'technology' },
  ent: { name: '연예', kr: 'entertainment' },
  sports: { name: '스포츠', kr: 'sports' },
  world: { name: '세계', world: 'world' },
  wbiz: { name: '세계 경제', world: 'business' },
  wtech: { name: '세계 기술', world: 'technology' },
};

const ago = (iso: string) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  return new Date(t).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
};

export function NewsPage({ sub }: { sub?: string }) {
  const key = sub && FEEDS[sub] ? sub : '';
  const f = FEEDS[key];
  const [kr, setKr] = useState<WorldNews[] | null>(null);
  const [world, setWorld] = useState<WorldNews[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!isLoggedIn()) return;
    setKr(null);
    setWorld(null);
    setErr('');
    const fail = (e: unknown) => setErr(e instanceof Error ? e.message : '뉴스를 받지 못했어요');
    if (f.kr)
      krNews(f.kr)
        .then((r) => setKr(key === '' ? r.items.slice(0, 10) : r.items))
        .catch(fail);
    if (f.world)
      worldNews(f.world)
        .then((r) => setWorld(key === '' ? r.items.slice(0, 6) : r.items))
        .catch(fail);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = (title: string | null, items: WorldNews[] | null, wait: string) =>
    items === null ? (
      <p className="st-muted">{wait}</p>
    ) : items.length ? (
      <>
        {title && <h3 className="st-h">{title}</h3>}
        <div className="nw-list">
          {items.map((x) => (
            <Article key={x.id} x={x} />
          ))}
        </div>
      </>
    ) : null;
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{f.name}</h2>
      </div>
      {!isLoggedIn() ? (
        <Empty title="로그인하면 뉴스를 볼 수 있어요" />
      ) : (
        <>
          {err && <p className="st-hint bad">{err}</p>}
          {f.kr && list(key === '' ? '국내' : null, kr, '국내 뉴스를 받는 중…')}
          {f.world && list(key === '' ? '세계' : null, world, '세계 뉴스를 받는 중… (처음엔 번역하느라 조금 걸려요)')}
        </>
      )}
      <small className="st-muted">
        {f.kr ? '국내: Google 뉴스 (기사는 각 언론사 것이에요). ' : ''}
        {f.world ? '세계: The Guardian · 제목과 요약은 AI 가 한국어로 옮긴 것이라 원문과 다를 수 있어요.' : ''}
      </small>
    </div>
  );
}

function Article({ x }: { x: WorldNews }) {
  const [en, setEn] = useState(!x.ko);
  return (
    <article className="nw-item">
      {x.thumb && <img src={x.thumb} alt="" loading="lazy" />}
      <div className="nw-body">
        <small className="st-muted">
          {x.section} · {ago(x.at)}
        </small>
        <b>{en ? x.title : x.ko!.title}</b>
        {(en ? x.trail : x.ko!.trail) && <p>{en ? x.trail : x.ko!.trail}</p>}
        <div className="nw-acts">
          {x.ko && (
            <button className="st-link" onClick={() => setEn(!en)}>
              {en ? '한국어로 보기' : '영어 원문으로 보기'}
            </button>
          )}
          <a className="st-link" href={x.url} target="_blank" rel="noreferrer">
            기사 열기
          </a>
        </div>
      </div>
    </article>
  );
}
