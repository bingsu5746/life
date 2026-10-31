// 게임 › 롤 › 챔피언 하나: 왼쪽 메뉴(빌드 · 룬 · 아이템 · 카운터 · 스킬 · 팁). 통계는 서버가 모은 마스터 이상 솔랭, 스킬 · 팁은 Data Dragon
import { useEffect, useMemo, useState } from 'react';
import { lolChampMeta, type LolAggRow } from '../auth/api';
import { Empty, go } from '../study/ui';
import { champImg, DD, loadChamp, loadItems, loadRunes, plain, runeImg, SHARD, type ChampDetail, type Dd, type Item, type RuneInfo } from './lolDd';
import { pct1, POS_ORDER, useDd2 } from './LolChamps';
import { POS } from './lolStats';

export const CHAMP_TABS = [
  ['build', '빌드'],
  ['runes', '룬'],
  ['items', '아이템'],
  ['counter', '카운터'],
  ['skills', '스킬'],
  ['tips', '팁'],
] as const;
export type ChampTab = (typeof CHAMP_TABS)[number][0];

type Meta = Awaited<ReturnType<typeof lolChampMeta>>;
const wr = (r: { g: number; w: number }) => (r.g ? (r.w / r.g) * 100 : 0);

function useRes<T>(load: () => Promise<T>): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    load()
      .then(setV)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

/** sub: 'build' · 'build-TOP' · 'counter-MIDDLE' 처럼 (탭-포지션) */
export function LolChampPage({ id, sub }: { id: string; sub?: string }) {
  const dd = useDd2();
  const items = useRes(loadItems);
  const runes = useRes(loadRunes);
  const [detail, setDetail] = useState<ChampDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [patch, setPatch] = useState('');
  const [tab0, pos0] = (sub ?? 'build').split('-');
  const tab = (CHAMP_TABS.some(([k]) => k === tab0) ? tab0 : 'build') as ChampTab;
  const champ = dd ? Object.values(dd.champ).find((c) => c.id === id) : undefined;
  useEffect(() => {
    loadChamp(id)
      .then(setDetail)
      .catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!champ) return;
    let live = true;
    lolChampMeta(champ.key, patch)
      .then((r) => live && setMeta(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [champ, patch]);
  // 포지션: 주소에 있으면 그것, 없으면 가장 많이 간 포지션
  const posList = (meta?.pos ?? []).filter((p) => p.g > 0).sort((a, b) => b.g - a.g);
  const pos = POS_ORDER.includes(pos0) ? pos0 : (posList[0]?.k ?? '');
  const totalPos = posList.reduce((a, p) => a + p.g, 0);
  const here = posList.find((p) => p.k === pos);
  const setTab = (t: string, p = pos) => go(`/games/champ/${id}/${t}${p ? `-${p}` : ''}`);
  if (!dd) return <p className="st-muted">불러오는 중…</p>;
  if (!champ)
    return (
      <Empty title="챔피언을 찾지 못했어요">
        <button className="btn" onClick={() => go('/games/champs')}>
          챔피언 목록
        </button>
      </Empty>
    );
  return (
    <div className="st-page">
      <section className="st-card lc-head">
        <img src={champImg(dd.v, champ.id)} alt="" />
        <div>
          <h2>{champ.name}</h2>
          <small className="st-muted">{champ.title}</small>
        </div>
        {here && meta && (
          <div className="lc-stats">
            <div>
              <small>승률</small>
              <b className={wr(here) >= 52 ? 'lc-up' : wr(here) < 48 ? 'lc-down' : ''}>{pct1(wr(here))}</b>
            </div>
            <div>
              <small>픽률</small>
              <b>{pct1((here.g / Math.max(1, meta.total)) * 100)}</b>
            </div>
            <div>
              <small>밴률</small>
              <b>{pct1((meta.bans / Math.max(1, meta.total)) * 100)}</b>
            </div>
            <div>
              <small>판</small>
              <b>{here.g.toLocaleString('ko-KR')}</b>
            </div>
          </div>
        )}
      </section>
      <div className="lc-bar">
        {posList.length > 0 && (
          <div className="st-seg" role="group" aria-label="포지션">
            {posList.map((p) => (
              <button key={p.k} className={pos === p.k ? 'on' : ''} onClick={() => setTab(tab, p.k)}>
                {POS[p.k]} <small>{Math.round((p.g / Math.max(1, totalPos)) * 100)}%</small>
              </button>
            ))}
          </div>
        )}
        {meta && meta.patches.length > 0 && (
          <select className="st-input lc-patch" value={patch || meta.patch} onChange={(e) => setPatch(e.target.value)} aria-label="패치">
            {meta.patches.map((p) => (
              <option key={p.patch} value={p.patch}>
                패치 {p.patch}
              </option>
            ))}
            <option value="all">모든 패치</option>
          </select>
        )}
      </div>
      {tab !== 'skills' && tab !== 'tips' && meta && !here && <p className="st-muted">아직 모은 경기가 적어요.</p>}
      {tab === 'build' && here && meta && <Build meta={meta} pos={pos} dd={dd} items={items} runes={runes} onTab={setTab} />}
      {tab === 'runes' && here && meta && <Runes meta={meta} pos={pos} runes={runes} />}
      {tab === 'items' && here && meta && <Items meta={meta} pos={pos} dd={dd} items={items} />}
      {tab === 'counter' && here && meta && <Counter meta={meta} pos={pos} dd={dd} me={champ.id} />}
      {tab === 'skills' && <Skills detail={detail} dd={dd} />}
      {tab === 'tips' && <Tips detail={detail} name={champ.name} meta={here ? meta : null} pos={pos} dd={dd} />}
    </div>
  );
}

const forPos = (list: LolAggRow[], pos: string) =>
  list
    .filter((r) => r.k.split('|')[0] === pos)
    .map((r) => ({ ...r, key: r.k.split('|')[1] }))
    .sort((a, b) => b.g - a.g);

function ItemIcon({ dd, id, items, size = 36 }: { dd: Dd; id: number; items: Record<number, Item> | null; size?: number }) {
  return <img className="lc-item" style={{ width: size, height: size }} src={`${DD}/${dd.v}/img/item/${id}.png`} alt={items?.[id]?.name ?? ''} title={items?.[id]?.name ?? ''} loading="lazy" />;
}

/** 완성 아이템(더 올라가는 곳이 없고 2,000골드 넘는 것) · 신발 */
const isCore = (it?: Item) => !!it && !it.into && !it.boots && it.gold >= 2000;
const isBoots = (it?: Item) => !!it && it.boots && it.gold >= 900;

/** 3코어 빌드: 완성 아이템 3개를 산 순서별 (판 · 승률). 같은 챔피언이라도 AD · AP · 하이브리드처럼 갈리면 따로 나온다 */
function CoreBuilds({ meta, pos, dd, items, games }: { meta: Meta; pos: string; dd: Dd; items: Record<number, Item> | null; games: number }) {
  const list = forPos(meta.builds ?? [], pos).slice(0, 6);
  if (!list.length) return null;
  const all = list.reduce((s, x) => s + x.g, 0);
  // 첫 코어별로 묶어 계열 보기 (예: 바루스 마법사 · 치명타 · 적중)
  const first = new Map<string, { g: number; w: number }>();
  for (const x of forPos(meta.builds ?? [], pos)) {
    const f = x.key.split('>')[0];
    const c = first.get(f) ?? { g: 0, w: 0 };
    c.g += x.g;
    c.w += x.w;
    first.set(f, c);
  }
  const firsts = [...first].sort((a, b) => b[1].g - a[1].g).slice(0, 4);
  return (
    <section className="st-card">
      <h3 className="st-h">3코어 빌드</h3>
      {firsts.length > 1 && (
        <div className="lc-firsts">
          {firsts.map(([id, c]) => (
            <span key={id}>
              <ItemIcon dd={dd} id={Number(id)} items={items} size={28} />
              <small className="st-muted">
                첫 코어 {pct1((c.g / Math.max(1, all)) * 100)} · 승 {pct1(wr(c))}
              </small>
            </span>
          ))}
        </div>
      )}
      <div className="lc-builds">
        {list.map((x) => (
          <div key={x.key} className="lc-build">
            <span className="lc-path">
              {x.key.split('>').map((id, i) => (
                <span key={id}>
                  {i > 0 && <i>›</i>}
                  <ItemIcon dd={dd} id={Number(id)} items={items} size={34} />
                </span>
              ))}
            </span>
            <small>
              {x.g}판 · 승 <b className={wr(x) >= 52 ? 'lc-up' : wr(x) < 48 ? 'lc-down' : ''}>{pct1(wr(x))}</b>
            </small>
          </div>
        ))}
      </div>
      <small className="st-muted">{games.toLocaleString('ko-KR')}판 중 3코어까지 간 판 기준</small>
    </section>
  );
}

function Build({ meta, pos, dd, items, runes, onTab }: { meta: Meta; pos: string; dd: Dd; items: Record<number, Item> | null; runes: Record<number, RuneInfo> | null; onTab: (t: string) => void }) {
  const games = meta.pos.find((p) => p.k === pos)?.g ?? 1;
  const it = forPos(meta.items, pos);
  const core = items ? it.filter((x) => isCore(items[Number(x.key)])).slice(0, 6) : [];
  const boots = items ? it.filter((x) => isBoots(items[Number(x.key)])).slice(0, 2) : [];
  const rune = forPos(meta.runes, pos)[0];
  const spells = forPos(meta.spells, pos).slice(0, 2);
  const counters = useCounters(meta, pos);
  return (
    <div className="lc-cols">
      <CoreBuilds meta={meta} pos={pos} dd={dd} items={items} games={games} />
      <section className="st-card">
        <h3 className="st-h">핵심 아이템</h3>
        <div className="lc-items">
          {core.map((x) => (
            <div key={x.key}>
              <ItemIcon dd={dd} id={Number(x.key)} items={items} size={44} />
              <small>{items?.[Number(x.key)]?.name}</small>
              <small className="st-muted">
                {pct1((x.g / games) * 100)} · 승 {pct1(wr(x))}
              </small>
            </div>
          ))}
        </div>
        {boots.length > 0 && (
          <>
            <h4 className="ta-h">신발</h4>
            <div className="lc-items">
              {boots.map((x) => (
                <div key={x.key}>
                  <ItemIcon dd={dd} id={Number(x.key)} items={items} />
                  <small>{items?.[Number(x.key)]?.name}</small>
                  <small className="st-muted">{pct1((x.g / games) * 100)}</small>
                </div>
              ))}
            </div>
          </>
        )}
        <button className="st-link" onClick={() => onTab('items')}>
          아이템 모두 보기 ›
        </button>
      </section>
      <section className="st-card">
        <h3 className="st-h">룬 · 스펠</h3>
        {rune && runes && <RunePage code={rune.key} runes={runes} games={games} row={rune} compact />}
        <div className="lc-spells">
          {spells.map((s) => (
            <div key={s.key}>
              {s.key.split('-').map((sid) => (dd.spell[Number(sid)] ? <img key={sid} src={`${DD}/${dd.v}/img/spell/${dd.spell[Number(sid)]}.png`} alt="" /> : null))}
              <small className="st-muted">
                {pct1((s.g / games) * 100)} · 승 {pct1(wr(s))}
              </small>
            </div>
          ))}
        </div>
        <button className="st-link" onClick={() => onTab('runes')}>
          룬 모두 보기 ›
        </button>
      </section>
      {counters.hard.length > 0 && (
        <section className="st-card">
          <h3 className="st-h">상대하기 어려운 챔피언</h3>
          <CounterStrip list={counters.hard.slice(0, 5)} dd={dd} />
          <h3 className="st-h">상대하기 쉬운 챔피언</h3>
          <CounterStrip list={counters.easy.slice(0, 5)} dd={dd} />
          <button className="st-link" onClick={() => onTab('counter')}>
            카운터 자세히 ›
          </button>
        </section>
      )}
    </div>
  );
}

/** 룬 페이지: 핵심 · 주 계열 3개 · 보조 계열 2개 · 파편 3개 */
function RunePage({ code, runes, games, row, compact }: { code: string; runes: Record<number, RuneInfo>; games: number; row: { g: number; w: number }; compact?: boolean }) {
  const [main, sub, ...ps] = code.split('.').map(Number);
  const perks = ps.slice(0, 6);
  const shards = ps.slice(6);
  const icon = (id: number, big = false) => (runes[id] ? <img className={big ? 'big' : ''} src={runeImg(runes[id].icon)} alt={runes[id].name} title={runes[id].name} loading="lazy" /> : null);
  return (
    <div className={`lc-rune ${compact ? 'compact' : ''}`}>
      <div className="lc-rune-row">
        {icon(main)}
        {icon(perks[0], true)}
        {perks.slice(1, 4).map((p) => (
          <span key={p}>{icon(p)}</span>
        ))}
        <span className="lc-rune-sep" />
        {icon(sub)}
        {perks.slice(4, 6).map((p) => (
          <span key={p}>{icon(p)}</span>
        ))}
      </div>
      <small className="st-muted">
        {runes[perks[0]]?.name} · {runes[sub]?.name} · 파편 {shards.map((s) => SHARD[s] ?? s).join(' / ')}
      </small>
      <small>
        선택 {pct1((row.g / games) * 100)} · 승률 <b>{pct1(wr(row))}</b> · {row.g.toLocaleString('ko-KR')}판
      </small>
    </div>
  );
}

function Runes({ meta, pos, runes }: { meta: Meta; pos: string; runes: Record<number, RuneInfo> | null }) {
  const games = meta.pos.find((p) => p.k === pos)?.g ?? 1;
  const list = forPos(meta.runes, pos).slice(0, 6);
  if (!runes) return <p className="st-muted">룬 정보를 받는 중…</p>;
  return (
    <section className="st-card">
      <h3 className="st-h">많이 쓴 룬 페이지</h3>
      <div className="lc-runes">
        {list.map((r) => (
          <RunePage key={r.key} code={r.key} runes={runes} games={games} row={r} />
        ))}
      </div>
    </section>
  );
}

function Items({ meta, pos, dd, items }: { meta: Meta; pos: string; dd: Dd; items: Record<number, Item> | null }) {
  const games = meta.pos.find((p) => p.k === pos)?.g ?? 1;
  const [kind, setKind] = useState<'core' | 'boots' | 'all'>('core');
  const list = forPos(meta.items, pos).filter((x) => {
    const it = items?.[Number(x.key)];
    return kind === 'all' ? !!it : kind === 'core' ? isCore(it) : isBoots(it);
  });
  return (
    <section className="st-card">
      <div className="sh-head">
        <h3 className="st-h">아이템</h3>
        <div className="st-seg sm" role="group" aria-label="아이템 종류">
          {(
            [
              ['core', '완성'],
              ['boots', '신발'],
              ['all', '전체'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <table className="lc-table">
        <thead>
          <tr>
            <th className="l">아이템</th>
            <th>산 비율</th>
            <th>승률</th>
            <th>판</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 30).map((x) => (
            <tr key={x.key}>
              <td className="l">
                <span className="lc-champ">
                  <ItemIcon dd={dd} id={Number(x.key)} items={items} size={30} />
                  <span>
                    <b>{items?.[Number(x.key)]?.name}</b>
                    <small className="st-muted"> {items?.[Number(x.key)]?.gold.toLocaleString('ko-KR')}골드</small>
                  </span>
                </span>
              </td>
              <td>{pct1((x.g / games) * 100)}</td>
              <td className={wr(x) >= 53 ? 'lc-up' : wr(x) < 47 ? 'lc-down' : ''}>{pct1(wr(x))}</td>
              <td>{x.g.toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ===== 카운터 =====
interface Mu {
  opp: number;
  g: number;
  w: number;
  kda: number;
  kp: number;
  dmg: number;
  /** 상대 쪽 (같은 맞대결에서 상대 챔피언의 평균) */
  okda: number;
  okp: number;
  odmg: number;
}
function useCounters(meta: Meta, pos: string) {
  return useMemo(() => {
    const games = meta.pos.find((p) => p.k === pos)?.g ?? 0;
    const min = Math.max(5, Math.round(games * 0.01));
    const theirs = new Map(forPos(meta.theirs, pos).map((r) => [r.key, r]));
    const list: Mu[] = forPos(meta.mine, pos)
      .filter((r) => r.g >= min)
      .map((r) => {
        const t = theirs.get(r.key);
        const kd = (x: LolAggRow) => (x.dd ? (x.kk + x.aa) / x.dd : x.kk + x.aa);
        return { opp: Number(r.key), g: r.g, w: r.w, kda: kd(r), kp: r.kp / 1000 / r.g, dmg: r.dmg / r.g, okda: t ? kd(t) : 0, okp: t ? t.kp / 1000 / t.g : 0, odmg: t ? t.dmg / t.g : 0 };
      });
    const by = [...list].sort((a, b) => wr(a) - wr(b));
    return { all: [...list].sort((a, b) => b.g - a.g), hard: by, easy: [...by].reverse(), min };
  }, [meta, pos]);
}

function CounterStrip({ list, dd }: { list: Mu[]; dd: Dd }) {
  return (
    <div className="lc-strip">
      {list.map((m) => (
        <div key={m.opp}>
          {dd.champ[m.opp] && <img src={champImg(dd.v, dd.champ[m.opp].id)} alt="" loading="lazy" />}
          <b className={wr(m) >= 50 ? 'lc-up' : 'lc-down'}>{pct1(wr(m))}</b>
          <small className="st-muted">{m.g}판</small>
        </div>
      ))}
    </div>
  );
}

function Counter({ meta, pos, dd, me }: { meta: Meta; pos: string; dd: Dd; me: string }) {
  const c = useCounters(meta, pos);
  const [sort, setSort] = useState<'games' | 'win' | 'lose'>('games');
  const [pick, setPick] = useState<number | null>(null);
  const list = sort === 'games' ? c.all : sort === 'win' ? c.easy : c.hard;
  const sel = c.all.find((m) => m.opp === (pick ?? list[0]?.opp));
  if (!c.all.length) return <p className="st-muted">아직 맞대결 판이 적어요.</p>;
  const myName = dd.byId[me] ?? me;
  return (
    <div className="lc-counter">
      {sel && dd.champ[sel.opp] && (
        <section className="st-card lc-vs">
          <div className="lc-vs-head">
            <img src={champImg(dd.v, me)} alt="" />
            <div className="lc-vs-bar">
              <div>
                <b>{pct1(wr(sel))}</b>
                <b>{pct1(100 - wr(sel))}</b>
              </div>
              <div className="lc-vs-track">
                <i style={{ width: `${wr(sel)}%` }} />
              </div>
              <div>
                <small>{myName}</small>
                <small>{dd.champ[sel.opp].name}</small>
              </div>
            </div>
            <img src={champImg(dd.v, dd.champ[sel.opp].id)} alt="" />
          </div>
          {(
            [
              ['KDA', sel.kda, sel.okda, (x: number) => `${x.toFixed(2)} : 1`],
              ['킬 관여율', sel.kp * 100, sel.okp * 100, (x: number) => pct1(x)],
              ['챔피언에게 준 피해', sel.dmg, sel.odmg, (x: number) => Math.round(x).toLocaleString('ko-KR')],
            ] as const
          ).map(([label, a, b, f]) => (
            <div key={label} className="lc-cmp">
              <b className={a >= b ? 'lc-up' : ''}>{f(a)}</b>
              <div>
                <small>{label}</small>
                <div className="lc-cmp-track">
                  <i style={{ width: `${(a / Math.max(0.0001, a + b)) * 100}%` }} />
                </div>
              </div>
              <b className={b > a ? 'lc-down' : 'st-muted'}>{f(b)}</b>
            </div>
          ))}
          <p className="st-muted sm">{sel.g.toLocaleString('ko-KR')}판</p>
        </section>
      )}
      <section className="st-card">
        <div className="sh-head">
          <h3 className="st-h">상대 챔피언</h3>
          <div className="st-seg sm" role="group" aria-label="정렬">
            {(
              [
                ['games', '많이 만난 순'],
                ['lose', '어려운 순'],
                ['win', '쉬운 순'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="lc-mu-list">
          {list.map((m) =>
            dd.champ[m.opp] ? (
              <button key={m.opp} className={`lc-mu ${sel?.opp === m.opp ? 'on' : ''}`} onClick={() => setPick(m.opp)}>
                <img src={champImg(dd.v, dd.champ[m.opp].id)} alt="" loading="lazy" />
                <span>{dd.champ[m.opp].name}</span>
                <b className={wr(m) >= 50 ? 'lc-up' : 'lc-down'}>{pct1(wr(m))}</b>
                <small className="st-muted">{m.g}판</small>
              </button>
            ) : null,
          )}
        </div>
        <p className="st-muted sm">
          {myName} 기준 · {c.min}판 이상
        </p>
      </section>
    </div>
  );
}

function Skills({ detail, dd }: { detail: ChampDetail | null; dd: Dd }) {
  if (!detail) return <p className="st-muted">스킬 정보를 받는 중…</p>;
  const rows = [
    { key: '패시브', name: detail.passive.name, img: `${DD}/${dd.v}/img/passive/${detail.passive.image}`, desc: detail.passive.description, cd: '', cost: '', range: '' },
    ...detail.spells.map((s, i) => ({ key: 'QWER'[i], name: s.name, img: `${DD}/${dd.v}/img/spell/${s.image}`, desc: s.description, cd: s.cooldownBurn, cost: s.costBurn, range: s.rangeBurn })),
  ];
  return (
    <section className="st-card lc-skill-list">
      {rows.map((r) => (
        <div key={r.key} className="lc-skill">
          <img src={r.img} alt="" />
          <div>
            <b>
              <span className="lc-key">{r.key}</span> {r.name}
            </b>
            {(r.cd || r.cost) && (
              <small className="st-muted">
                {r.cd && r.cd !== '0' ? `재사용 ${r.cd}초` : ''}
                {r.cost && r.cost !== '0' ? ` · 소모 ${r.cost}` : ''}
                {r.range && r.range !== '0' && r.range !== '25000' ? ` · 사거리 ${r.range}` : ''}
              </small>
            )}
            <p>{plain(r.desc)}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function Tips({ detail, name, meta, pos, dd }: { detail: ChampDetail | null; name: string; meta: Meta | null; pos: string; dd: Dd }) {
  if (!detail) return <p className="st-muted">팁을 받는 중…</p>;
  return (
    <div className="lc-cols">
      <section className="st-card">
        <h3 className="st-h">{name} 팁</h3>
        {detail.allytips.length ? (
          <ul className="lc-tips">
            {detail.allytips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="st-muted">Riot 이 이 챔피언 팁을 주지 않아요.</p>
        )}
      </section>
      {meta && <CounterTips meta={meta} pos={pos} dd={dd} />}
    </div>
  );
}

/** 대표 카운터 3명 (모은 맞대결에서 승률이 가장 낮은 상대) + 그 챔피언 상대 팁 (Riot) */
function CounterTips({ meta, pos, dd }: { meta: Meta; pos: string; dd: Dd }) {
  const c = useCounters(meta, pos);
  const top = c.hard.slice(0, 3);
  const [tips, setTips] = useState<Record<number, string[]>>({});
  useEffect(() => {
    for (const m of top) {
      const ch = dd.champ[m.opp];
      if (ch && !tips[m.opp])
        loadChamp(ch.id)
          .then((d) => setTips((t) => ({ ...t, [m.opp]: d.enemytips })))
          .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top.map((m) => m.opp).join()]);
  if (!top.length) return null;
  return (
    <section className="st-card">
      <h3 className="st-h">대표 카운터</h3>
      {top.map((m) => (
        <div key={m.opp} className="lc-ctip">
          <div className="lc-champ">
            {dd.champ[m.opp] && <img src={champImg(dd.v, dd.champ[m.opp].id)} alt="" loading="lazy" />}
            <b>{dd.champ[m.opp]?.name}</b>
            <small className="lc-down">{pct1(wr(m))}</small>
          </div>
          {tips[m.opp]?.length ? (
            <ul className="lc-tips">
              {tips[m.opp].map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}
