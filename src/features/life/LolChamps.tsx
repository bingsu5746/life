// 게임 › 롤 챔피언: 검색(초성 · 영어) · 포지션 · 패치 · 티어표(승률 · 픽률 · 밴률). 통계는 서버가 모은 마스터 이상 솔랭
import { useEffect, useMemo, useState } from 'react';
import { lolCrawl, lolMeta, lolMetaNow } from '../auth/api';
import { toast } from '../study/ui';
import { go } from '../study/ui';
import { champImg, champMatch, loadDd, type Dd } from './lolDd';
import { POS } from './lolStats';

export const POS_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
type Sort = 'win' | 'pick' | 'ban' | 'games';
export const pct1 = (x: number) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

export function useDd2(): Dd | null {
  const [d, setD] = useState<Dd | null>(null);
  useEffect(() => {
    loadDd()
      .then(setD)
      .catch(() => {});
  }, []);
  return d;
}

/** 표본이 적으면 승률이 튀어서, 너무 적은 판은 순위에서 뺀다 (전체 경기 수에 맞춰 0.5% 픽률 또는 최소 10판) */
export const minGames = (total: number) => Math.max(10, Math.round(total * 0.005));

export function LolChampsPage() {
  const dd = useDd2();
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [patch, setPatch] = useState('');
  const [sort, setSort] = useState<Sort>('win');
  const [data, setData] = useState<Awaited<ReturnType<typeof lolMeta>> | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const burst = (data?.status.burst ?? 0) > Date.now();
  // 빠르게 모으는 중이면 15초마다 새로
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setTick((n) => n + 1), 15_000);
    return () => clearTimeout(t);
  }, [burst, data]);
  useEffect(() => {
    let live = true;
    (tick ? lolMetaNow : lolMeta)(patch)
      .then((r) => live && setData(r))
      .catch((e) => live && setErr(e instanceof Error ? e.message : '통계를 받지 못했어요'));
    return () => {
      live = false;
    };
  }, [patch, tick]);
  const rows = useMemo(() => {
    if (!data || !dd) return [];
    const min = minGames(data.total);
    return data.rows
      .filter((r) => dd.champ[r.cid] && (!pos || r.pos === pos) && r.g >= min && champMatch(dd.champ[r.cid], q))
      .map((r) => ({ ...r, c: dd.champ[r.cid], win: (r.w / r.g) * 100, pick: (r.g / Math.max(1, data.total)) * 100, ban: ((data.bans[r.cid] ?? 0) / Math.max(1, data.total)) * 100, kda: r.dd ? (r.kk + r.aa) / r.dd : r.kk + r.aa }))
      .sort((a, b) => (sort === 'win' ? b.win - a.win : sort === 'pick' ? b.pick - a.pick : sort === 'ban' ? b.ban - a.ban : b.g - a.g));
  }, [data, dd, pos, q, sort]);
  // 검색했는데 통계가 아직 없는 챔피언도 고를 수 있게
  const found =
    dd && q.trim()
      ? Object.values(dd.champ)
          .filter((c) => champMatch(c, q))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      : [];
  const open = (id: string) => go(`/games/champ/${id}`);
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>롤 챔피언</h2>
      </div>
      <div className="lc-bar">
        <input className="st-input lc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="챔피언 찾기 (가렌, ㄱㄹ, garen)" aria-label="챔피언 찾기" />
        {data && data.patches.length > 0 && (
          <select className="st-input lc-patch" value={patch || data.patch} onChange={(e) => setPatch(e.target.value)} aria-label="패치">
            {data.patches.map((p) => (
              <option key={p.patch} value={p.patch}>
                패치 {p.patch}
              </option>
            ))}
            <option value="all">모든 패치</option>
          </select>
        )}
      </div>
      <div className="st-seg lc-pos" role="group" aria-label="포지션">
        {['', ...POS_ORDER].map((p) => (
          <button key={p || 'all'} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>
            {p ? POS[p] : '전체'}
          </button>
        ))}
      </div>
      {found.length > 0 && (
        <div className="lc-grid">
          {found.slice(0, 24).map((c) => (
            <button key={c.id} className="lc-pick" onClick={() => open(c.id)}>
              {dd && <img src={champImg(dd.v, c.id)} alt="" loading="lazy" />}
              <small>{c.name}</small>
            </button>
          ))}
        </div>
      )}
      {err && <p className="st-muted">{err}</p>}
      {data && (
        <p className="st-muted sm">
          마스터+ 솔랭 {data.total.toLocaleString('ko-KR')}판{data.status.err && Date.now() - data.status.err.at < 3600_000 ? ` · 모으기 오류: ${data.status.err.msg}` : ''}
        </p>
      )}
      {data?.status.writes && (
        <WriteUse
          w={data.status.writes}
          burst={data.status.burst ?? 0}
          onCrawl={(min) =>
            lolCrawl(min)
              .then(() => {
                toast(min ? `${min}분 동안 빠르게 모아요` : '멈췄어요');
                setTick((n) => n + 1);
              })
              .catch((e) => toast(e instanceof Error ? e.message : '실패했어요'))
          }
        />
      )}
      {!data && !err && <p className="st-muted">받는 중…</p>}
      {data && rows.length > 0 && (
        <section className="st-card lc-table-wrap">
          <table className="lc-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="l">챔피언</th>
                <th>포지션</th>
                {(
                  [
                    ['win', '승률'],
                    ['pick', '픽률'],
                    ['ban', '밴률'],
                    ['games', '판'],
                  ] as const
                ).map(([k, label]) => (
                  <th key={k} className={`sortable ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>
                    {label}
                    {sort === k ? ' ▾' : ''}
                  </th>
                ))}
                <th>KDA</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 120).map((r, i) => (
                <tr key={`${r.cid}-${r.pos}`} className="st-tap" onClick={() => go(`/games/champ/${r.c.id}/build-${r.pos}`)}>
                  <td className="lc-rank">{i + 1}</td>
                  <td className="l">
                    <span className="lc-champ">
                      {dd && <img src={champImg(dd.v, r.c.id)} alt="" loading="lazy" />}
                      <b>{r.c.name}</b>
                    </span>
                  </td>
                  <td>{POS[r.pos]}</td>
                  <td className={r.win >= 52 ? 'lc-up' : r.win < 48 ? 'lc-down' : ''}>{pct1(r.win)}</td>
                  <td>{pct1(r.pick)}</td>
                  <td>{pct1(r.ban)}</td>
                  <td>{r.g.toLocaleString('ko-KR')}</td>
                  <td>{r.kda.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {data && !rows.length && !found.length && <p className="st-muted">{data.total ? '조건에 맞는 챔피언이 없어요.' : '아직 모은 경기가 없어요.'}</p>}
    </div>
  );
}

/** 서버 쓰기 한도 · 오늘 쓴 양 · 빠르게 모으기 */
function WriteUse({ w, burst, onCrawl }: { w: NonNullable<Awaited<ReturnType<typeof lolMeta>>['status']['writes']>; burst: number; onCrawl: (min: number) => void }) {
  const n = (x: number) => x.toLocaleString('ko-KR');
  const on = burst > Date.now();
  return (
    <section className="st-card lc-use">
      <div className="lc-use-top">
        <span>
          서버 쓰기 <b>{n(w.today.all)}</b> / {n(w.limit)}줄{' '}
          <small className="st-muted">
            (롤 통계 {n(w.today.lol)} · 상한 {n(w.cap)})
          </small>
        </span>
        {on ? (
          <button className="btn btn-sm" onClick={() => onCrawl(0)}>
            멈추기 ({Math.ceil((burst - Date.now()) / 60_000)}분 남음)
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => onCrawl(10)} disabled={w.today.all >= w.cap}>
            빠르게 모으기 10분
          </button>
        )}
      </div>
      <div className="lc-use-bar">
        <i style={{ width: `${Math.min(100, (w.today.all / w.limit) * 100)}%` }} />
        <b style={{ left: `${(w.cap / w.limit) * 100}%` }} />
      </div>
    </section>
  );
}
