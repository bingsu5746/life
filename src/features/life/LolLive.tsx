// 게임 › 롤 실시간: 내 컴퓨터에서 롤 게임 중일 때 Riot Live Client Data API(127.0.0.1:2999)를 2초마다 읽어
// 내 기록 · 양 팀 · 라인 상대 · 다음 아이템 · 오브젝트를 보여 준다. (게임 클라이언트는 자기 컴퓨터에서만 열려 있다)
// 브라우저가 게임의 자체 인증서를 막으면, 도우미(scripts/lol-live-relay.mjs)가 http://127.0.0.1:2998 로 대신 전해 준다.
import { useEffect, useMemo, useState } from 'react';
import { lolChampMeta, type LolAggRow } from '../auth/api';
import { champImg, DD, loadChamp, loadItems, plain, type ChampDetail, type Dd, type Item } from './lolDd';
import { pct1, useDd2 } from './LolChamps';
import { POS } from './lolStats';

const SOURCES = ['https://127.0.0.1:2999/liveclientdata/allgamedata', 'http://127.0.0.1:2998/liveclientdata/allgamedata'];

interface LItem {
  itemID: number;
  count?: number;
  price?: number;
  slot?: number;
}
interface LPlayer {
  championName?: string;
  rawChampionName?: string;
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
  team?: string;
  position?: string;
  level?: number;
  isDead?: boolean;
  respawnTimer?: number;
  items?: LItem[];
  scores?: { kills?: number; deaths?: number; assists?: number; creepScore?: number; wardScore?: number };
}
interface LEvent {
  EventName: string;
  EventTime: number;
  KillerName?: string;
  DragonType?: string;
  Stolen?: string;
}
interface Live {
  activePlayer?: { riotId?: string; riotIdGameName?: string; summonerName?: string; level?: number; currentGold?: number };
  allPlayers?: LPlayer[];
  events?: { Events?: LEvent[] };
  gameData?: { gameTime?: number; gameMode?: string };
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const names = (p: { riotId?: string; riotIdGameName?: string; summonerName?: string }) => [p.riotId, p.riotIdGameName, p.summonerName].filter((x): x is string => !!x);
/** rawChampionName = 'game_character_displayname_Annie' → Data Dragon 이름 'Annie' */
const champId = (p: LPlayer) => (p.rawChampionName ?? '').split('displayname_')[1] ?? '';
const DRAGON: Record<string, string> = { Fire: '화염', Earth: '대지', Water: '바다', Air: '바람', Hextech: '마법공학', Chemtech: '화학공학', Elder: '장로' };
const OBJ: Record<string, string> = { DragonKill: '드래곤', BaronKill: '바론', HeraldKill: '전령', HordeKill: '공허 유충', AtakhanKill: '아타칸' };

function useLive() {
  const [data, setData] = useState<Live | null>(null);
  const [src, setSrc] = useState(-1);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    let at = 0;
    const tick = async () => {
      for (let i = 0; i < SOURCES.length; i++) {
        const k = (at + i) % SOURCES.length;
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 1500);
          const r = await fetch(SOURCES[k], { signal: ctl.signal, cache: 'no-store' });
          clearTimeout(t);
          if (!r.ok) continue;
          const j = (await r.json()) as Live;
          if (!live) return;
          at = k;
          setSrc(k);
          setData(j.allPlayers ? j : null);
          return;
        } catch {
          /* 다음 길 */
        }
      }
      if (live) {
        setSrc(-1);
        setData(null);
        setTries((n) => n + 1);
      }
    };
    void tick();
    const id = setInterval(() => document.visibilityState === 'visible' && void tick(), 2000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  return { data, src, tries };
}

export function LolLivePage() {
  const { data, src, tries } = useLive();
  const dd = useDd2();
  const [items, setItems] = useState<Record<number, Item> | null>(null);
  useEffect(() => {
    loadItems()
      .then(setItems)
      .catch(() => {});
  }, []);
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>롤 실시간</h2>
        <small className="st-muted">{src === 0 ? '게임에 바로 연결됨' : src === 1 ? '도우미로 연결됨' : ''}</small>
      </div>
      {!data && <Waiting tries={tries} />}
      {data && dd && <Game d={data} dd={dd} items={items} />}
    </div>
  );
}

function Waiting({ tries }: { tries: number }) {
  return (
    <section className="st-card">
      <p>
        <b>게임을 기다리는 중…</b> 롤이 켜진 컴퓨터에서 열어 주세요.
      </p>
      {tries > 2 && (
        <>
          <p className="st-muted sm">안 나오면:</p>
          <ol className="st-muted sm ll-help">
            <li>
              게임 중에{' '}
              <a href={SOURCES[0]} target="_blank" rel="noreferrer">
                이 주소
              </a>
              를 열어 「계속 진행」 누르기
            </li>
            <li>
              <code>node scripts/lol-live-relay.mjs</code> 켜 두기
            </li>
          </ol>
        </>
      )}
    </section>
  );
}

function Game({ d, dd, items }: { d: Live; dd: Dd; items: Record<number, Item> | null }) {
  const players = d.allPlayers ?? [];
  const myNames = names(d.activePlayer ?? {});
  const me = players.find((p) => names(p).some((n) => myNames.includes(n)));
  const t = d.gameData?.gameTime ?? 0;
  const myTeam = me?.team ?? 'ORDER';
  const allies = players.filter((p) => p.team === myTeam);
  const enemies = players.filter((p) => p.team !== myTeam);
  const opp = me?.position ? enemies.find((p) => p.position === me.position) : undefined;
  const gold = (list: LPlayer[]) => list.reduce((s, p) => s + (p.items ?? []).reduce((a, it) => a + (items?.[it.itemID]?.gold ?? 0) * (it.count ?? 1), 0), 0);
  const kills = (list: LPlayer[]) => list.reduce((s, p) => s + (p.scores?.kills ?? 0), 0);
  const teamOf = (name?: string) => (name ? players.find((p) => names(p).includes(name))?.team : undefined);
  const objs = (d.events?.Events ?? []).filter((e) => OBJ[e.EventName]);
  const dc = (p?: LPlayer) => (p ? Object.values(dd.champ).find((c) => c.id === champId(p)) : undefined);
  const s = me?.scores ?? {};
  const cs = s.creepScore ?? 0;
  return (
    <>
      <section className="st-card ll-me">
        {me && dc(me) && <img className="ll-face" src={champImg(dd.v, dc(me)!.id)} alt="" />}
        <div>
          <div className="ll-big">
            {s.kills ?? 0} / {s.deaths ?? 0} / {s.assists ?? 0}
            <small className="st-muted"> KDA {s.deaths ? (((s.kills ?? 0) + (s.assists ?? 0)) / s.deaths).toFixed(2) : 'Perfect'}</small>
          </div>
          <div className="ll-row">
            <span>⏱ {mmss(t)}</span>
            <span>레벨 {d.activePlayer?.level ?? me?.level ?? '?'}</span>
            <span>
              CS {cs} ({t > 60 ? ((cs / t) * 60).toFixed(1) : '0.0'}/분)
            </span>
            <span>💰 {Math.floor(d.activePlayer?.currentGold ?? 0).toLocaleString('ko-KR')}</span>
            <span>시야 {Math.round(s.wardScore ?? 0)}</span>
          </div>
          {me?.isDead && <div className="lc-down">💀 부활까지 {Math.ceil(me.respawnTimer ?? 0)}초</div>}
        </div>
      </section>

      <section className="st-card">
        <div className="ll-score">
          <span>
            우리 <b>{kills(allies)}</b>킬 · 아이템 {gold(allies).toLocaleString('ko-KR')}골드
          </span>
          <span className={gold(allies) >= gold(enemies) ? 'lc-up' : 'lc-down'}>
            {gold(allies) >= gold(enemies) ? '+' : ''}
            {(gold(allies) - gold(enemies)).toLocaleString('ko-KR')}
          </span>
          <span>
            상대 <b>{kills(enemies)}</b>킬 · {gold(enemies).toLocaleString('ko-KR')}골드
          </span>
        </div>
        <div className="ll-teams">
          {[allies, enemies].map((list, i) => (
            <ul key={i} className="ll-team">
              {list.map((p) => (
                <li key={names(p)[0] ?? champId(p)} className={p.isDead ? 'dead' : ''}>
                  {dc(p) && <img src={champImg(dd.v, dc(p)!.id)} alt="" />}
                  <span className="ll-name">
                    <b>{p.championName}</b>
                    <small className="st-muted">
                      {POS[p.position ?? ''] ?? ''} Lv{p.level} · {p.scores?.kills ?? 0}/{p.scores?.deaths ?? 0}/{p.scores?.assists ?? 0} · CS {p.scores?.creepScore ?? 0}
                    </small>
                  </span>
                  {p.isDead && <b className="lc-down">{Math.ceil(p.respawnTimer ?? 0)}초</b>}
                  <span className="ll-items">
                    {(p.items ?? [])
                      .filter((it) => it.slot !== 6)
                      .map((it) => (
                        <img key={`${it.slot}-${it.itemID}`} src={`${DD}/${dd.v}/img/item/${it.itemID}.png`} alt={items?.[it.itemID]?.name ?? ''} title={items?.[it.itemID]?.name ?? ''} />
                      ))}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      {objs.length > 0 && (
        <section className="st-card">
          <h3>오브젝트</h3>
          <ul className="ll-objs">
            {objs
              .slice()
              .reverse()
              .map((e) => {
                const ours = teamOf(e.KillerName) === myTeam;
                return (
                  <li key={`${e.EventName}-${e.EventTime}`}>
                    <span className={ours ? 'lc-up' : 'lc-down'}>{ours ? '우리' : '상대'}</span> {e.DragonType ? `${DRAGON[e.DragonType] ?? e.DragonType} ` : ''}
                    {OBJ[e.EventName]}
                    {e.Stolen === 'True' ? ' (스틸)' : ''} · {mmss(e.EventTime)} ({Math.floor((t - e.EventTime) / 60)}분 전)
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      {me && dc(me) && <Advice me={me} opp={opp} myCid={dc(me)!.key} oppCid={dc(opp)?.key} oppId={dc(opp)?.id} dd={dd} items={items} gold={d.activePlayer?.currentGold ?? 0} />}
    </>
  );
}

/** 이 앱 서버가 모은 마스터 이상 통계(맞대결 승률 · 많이 가는 아이템) + Data Dragon 상대 팁 */
function Advice({ me, opp, myCid, oppCid, oppId, dd, items, gold }: { me: LPlayer; opp?: LPlayer; myCid: number; oppCid?: number; oppId?: string; dd: Dd; items: Record<number, Item> | null; gold: number }) {
  const [meta, setMeta] = useState<{ items: LolAggRow[]; mine: LolAggRow[] } | null>(null);
  const [tips, setTips] = useState<ChampDetail | null>(null);
  useEffect(() => {
    lolChampMeta(myCid, 'all')
      .then(setMeta)
      .catch(() => {});
  }, [myCid]);
  useEffect(() => {
    if (oppId)
      loadChamp(oppId)
        .then(setTips)
        .catch(() => {});
  }, [oppId]);
  const pos = me.position ?? '';
  const mu = meta?.mine.find((r) => r.k === `${pos}|${oppCid}`);
  const have = new Set((me.items ?? []).map((it) => it.itemID));
  const next = useMemo(
    () =>
      (meta?.items ?? [])
        .filter((r) => r.k.startsWith(`${pos}|`))
        .map((r) => ({ id: Number(r.k.split('|')[1]), g: r.g }))
        .filter((x) => {
          const it = items?.[x.id];
          return it && !it.into && it.gold >= 2000 && !have.has(x.id);
        })
        .sort((a, b) => b.g - a.g)
        .slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, items, pos, [...have].join()],
  );
  return (
    <section className="st-card">
      <h3>도움말</h3>
      {opp && (
        <p>
          라인 상대 <b>{opp.championName}</b>
          {mu && mu.g >= 5 ? (
            <>
              {' '}
              — 승률 <b className={mu.w / mu.g >= 0.5 ? 'lc-up' : 'lc-down'}>{pct1((mu.w / mu.g) * 100)}</b> ({mu.g}판)
            </>
          ) : (
            <span className="st-muted"> — 판 수 부족</span>
          )}
        </p>
      )}
      {next.length > 0 && (
        <>
          <p className="st-muted sm">추천 아이템</p>
          <div className="ll-next">
            {next.map((x) => (
              <span key={x.id} className={gold >= (items?.[x.id]?.gold ?? 1e9) ? 'lc-up' : ''}>
                <img src={`${DD}/${dd.v}/img/item/${x.id}.png`} alt="" />
                {items?.[x.id]?.name} <small className="st-muted">{items?.[x.id]?.gold.toLocaleString('ko-KR')}골드</small>
              </span>
            ))}
          </div>
        </>
      )}
      {opp && tips && tips.enemytips.length > 0 && (
        <>
          <p className="st-muted sm">{opp.championName} 상대 팁</p>
          <ul>
            {tips.enemytips.map((x) => (
              <li key={x}>{plain(x)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
