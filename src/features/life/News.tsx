// 뉴스: 오늘의 세계 뉴스 (The Guardian, 한국어로 번역해서 보여 주고 영어 원문도 볼 수 있다)
import { useEffect, useState } from 'react';
import { isLoggedIn, worldNews, type WorldNews } from '../auth/api';
import { Empty } from '../study/ui';

const NAME: Record<string, string> = { '': '오늘의 세계 뉴스', world: '세계', business: '경제', technology: '기술', science: '과학', environment: '환경', sport: '스포츠', culture: '문화' };

const ago = (iso: string) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  return new Date(t).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
};

export function NewsPage({ sub }: { sub?: string }) {
  const section = sub && NAME[sub] ? sub : '';
  const [items, setItems] = useState<WorldNews[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!isLoggedIn()) return;
    setItems(null);
    setErr('');
    worldNews(section || 'all')
      .then((r) => setItems(r.items))
      .catch((e) => setErr(e instanceof Error ? e.message : '뉴스를 받지 못했어요'));
  }, [section]);
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>{NAME[section]}</h2>
      </div>
      {!isLoggedIn() ? (
        <Empty title="로그인하면 세계 뉴스를 볼 수 있어요" />
      ) : err ? (
        <p className="st-hint bad">{err}</p>
      ) : !items ? (
        <p className="st-muted">뉴스를 받는 중… (처음엔 번역하느라 조금 걸려요)</p>
      ) : !items.length ? (
        <p className="st-hint">새 뉴스가 없어요.</p>
      ) : (
        <div className="nw-list">
          {items.map((x) => (
            <Article key={x.id} x={x} />
          ))}
        </div>
      )}
      <small className="st-muted">출처: The Guardian · 제목과 요약은 AI 가 한국어로 옮긴 것이라 원문과 다를 수 있어요.</small>
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
