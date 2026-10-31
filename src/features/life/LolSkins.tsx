// 롤 챔피언 › 스킨: 모든 스킨(Data Dragon 그림) + 인벤 별점 · 참여자 수 · 가격 · 최근 한줄평
import { useEffect, useMemo, useState } from 'react';
import { lolSkins, lolSkinVideo, type InvenSkin } from '../auth/api';
import { Sheet } from '../study/ui';
import type { Champ, ChampDetail } from './lolDd';

const ART = 'https://ddragon.leagueoflegends.com/cdn/img/champion';
const INVEN = 'https://static.inven.co.kr/image_2011/site_image/lol/dataninfo/icon';
type Sort = 'new' | 'star';
type Comment = { skin: number; text: string; date: string };

export function Skins({ detail, champ }: { detail: ChampDetail | null; champ: Champ }) {
  const [inv, setInv] = useState<{ skins: InvenSkin[]; comments: Comment[] } | null>(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    lolSkins(champ.name)
      .then(setInv)
      .catch((e) => setErr(e instanceof Error ? e.message : '별점을 받지 못했어요'));
  }, [champ.name]);
  const list = useMemo(() => {
    const all = (detail?.skins ?? []).map((s) => {
      const i = inv?.skins.find((x) => x.num === s.num) ?? inv?.skins.find((x) => x.name.replace(/\s/g, '') === s.name.replace(/\s/g, ''));
      return { ...s, name: s.num === 0 ? '기본' : s.name, inv: i, comments: i ? (inv?.comments ?? []).filter((c) => c.skin === i.code) : [] };
    });
    return sort === 'star' ? [...all].sort((a, b) => (b.inv?.avg ?? 0) - (a.inv?.avg ?? 0) || (b.inv?.votes ?? 0) - (a.inv?.votes ?? 0)) : [...all].reverse();
  }, [detail, inv, sort]);
  if (!detail) return <p className="st-muted">스킨을 받는 중…</p>;
  const sel = list.find((s) => s.num === open);
  return (
    <>
      <div className="lc-bar">
        <div className="st-seg" role="group" aria-label="정렬">
          <button className={sort === 'new' ? 'on' : ''} onClick={() => setSort('new')}>
            최신순
          </button>
          <button className={sort === 'star' ? 'on' : ''} onClick={() => setSort('star')}>
            별점순
          </button>
        </div>
        <small className="st-muted">{list.length}개</small>
      </div>
      {err && <p className="st-muted">{err}</p>}
      <div className="sk-grid">
        {list.map((s) => (
          <button key={s.num} className="sk-card" onClick={() => setOpen(s.num)}>
            <img src={`${ART}/loading/${champ.id}_${s.num}.jpg`} alt="" loading="lazy" />
            <b>{s.name}</b>
            <small>{s.inv && s.inv.votes > 0 ? `★ ${s.inv.avg.toFixed(1)} (${s.inv.votes})` : inv ? '평가 없음' : ''}</small>
          </button>
        ))}
      </div>
      {sel && (
        <Sheet title={sel.name} onClose={() => setOpen(null)} wide>
          <img className="sk-splash" src={`${ART}/splash/${champ.id}_${sel.num}.jpg`} alt="" />
          {sel.inv?.ingame && (
            <>
              <h4 className="sk-h">게임 안 모습</h4>
              <img className="sk-splash" src={`${INVEN}/skingame/${encodeURIComponent(sel.inv.ingame)}`} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />
            </>
          )}
          {sel.inv && <Video code={sel.inv.code} />}
          <p>
            {sel.inv && sel.inv.votes > 0 && (
              <>
                <b className="sk-star">★ {sel.inv.avg.toFixed(1)}</b> <small className="st-muted">{sel.inv.votes}명 평가</small>
              </>
            )}
            {sel.inv?.price && <small className="st-muted"> · {sel.inv.price}</small>}
            {sel.chromas > 0 && <small className="st-muted"> · 크로마 {sel.chromas}개</small>}
          </p>
          {sel.comments.length > 0 ? (
            <ul className="sk-comments">
              {sel.comments.map((c, i) => (
                <li key={i}>
                  “{c.text}” <small className="st-muted">{c.date}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="st-muted sm">한줄평을 찾지 못했어요.</p>
          )}
        </Sheet>
      )}
    </>
  );
}

/** 스포트라이트 영상 (스킬 모션) */
function Video({ code }: { code: number }) {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setId(undefined);
    lolSkinVideo(code)
      .then((r) => setId(r.id))
      .catch(() => setId(null));
  }, [code]);
  if (!id) return null;
  return (
    <>
      <h4 className="sk-h">스킬 모션 (스포트라이트)</h4>
      <iframe className="sk-video" src={`https://www.youtube-nocookie.com/embed/${id}`} title="스포트라이트 영상" allow="encrypted-media; picture-in-picture" allowFullScreen />
    </>
  );
}
