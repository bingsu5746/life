// 롤 전적 › 경기 하나 자세히: 양 팀 10명 · 팀 오브젝트
import { useEffect, useState } from 'react';
import { lolMatch, type LolMatch, type LolMatchP } from '../auth/api';
import { Sheet } from '../study/ui';

const IMG = 'https://ddragon.leagueoflegends.com/cdn';
const OBJ: [string, string][] = [
  ['champion', '킬'],
  ['tower', '포탑'],
  ['dragon', '드래곤'],
  ['baron', '바론'],
  ['riftHerald', '전령'],
  ['horde', '유충'],
  ['atakhan', '아타칸'],
  ['inhibitor', '억제기'],
];
interface Dd {
  v: string;
  spell: Record<number, string>;
}

export function MatchSheet({ id, me: g, dd, onClose }: { id: string; me: { champ: string; k: number; d: number; a: number }; dd: Dd | null; onClose: () => void }) {
  const [m, setM] = useState<LolMatch | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    lolMatch(id)
      .then(setM)
      .catch((e) => setErr(e instanceof Error ? e.message : '받지 못했어요.'));
  }, [id]);
  const maxDmg = m ? Math.max(1, ...m.players.map((p) => p.dmg)) : 1;
  // 내 줄: 같은 챔피언 · 같은 K/D/A
  const meP = m?.players.find((p) => p.champ === g.champ && p.k === g.k && p.d === g.d && p.a === g.a);
  const me = meP?.puuid;
  const mine = meP?.team;
  const teams = m ? [...m.teams].sort((a, b) => (a.id === mine ? -1 : b.id === mine ? 1 : 0)) : [];
  return (
    <Sheet title="경기 자세히" onClose={onClose} wide>
      {err && <p className="st-muted">{err}</p>}
      {!m && !err && <p className="st-muted">받는 중…</p>}
      {m &&
        teams.map((t) => {
          const ps = m.players.filter((p) => p.team === t.id);
          const gold = ps.reduce((s, p) => s + p.gold, 0);
          return (
            <section key={t.id} className={`lm-team ${t.win ? 'win' : 'lose'}`}>
              <div className="lm-head">
                <b>{t.win ? '승리' : '패배'}</b>
                <small>
                  {OBJ.filter(([k]) => t.obj[k] !== undefined)
                    .map(([k, l]) => `${l} ${t.obj[k]}`)
                    .join(' · ')}{' '}
                  · 골드 {gold.toLocaleString('ko-KR')}
                </small>
              </div>
              {ps.map((p) => (
                <Row key={p.puuid} p={p} dd={dd} me={p.puuid === me} maxDmg={maxDmg} min={m.dur / 60} />
              ))}
            </section>
          );
        })}
    </Sheet>
  );
}

function Row({ p, dd, me, maxDmg, min }: { p: LolMatchP; dd: Dd | null; me: boolean; maxDmg: number; min: number }) {
  return (
    <div className={`lm-row ${me ? 'me' : ''}`}>
      <span className="lm-champ">
        {dd && <img src={`${IMG}/${dd.v}/img/champion/${p.champ}.png`} alt="" loading="lazy" />}
        <i>{p.lvl}</i>
      </span>
      <span className="lm-sp">{dd && p.spells.map((s, i) => (dd.spell[s] ? <img key={i} src={`${IMG}/${dd.v}/img/spell/${dd.spell[s]}.png`} alt="" loading="lazy" /> : null))}</span>
      <span className="lm-name">{p.name.split('#')[0]}</span>
      <span className="lm-kda">
        <b>
          {p.k}/{p.d}/{p.a}
        </b>
        <small>{(p.d ? (p.k + p.a) / p.d : p.k + p.a).toFixed(2)}</small>
      </span>
      <span className="lm-dmg" title={`받은 피해 ${p.taken.toLocaleString('ko-KR')}`}>
        <small>{p.dmg.toLocaleString('ko-KR')}</small>
        <i style={{ width: `${(p.dmg / maxDmg) * 100}%` }} />
      </span>
      <span className="lm-cs">
        <small>
          CS {p.cs} ({(p.cs / Math.max(1, min)).toFixed(1)})
        </small>
        <small>시야 {p.vision}</small>
      </span>
      <span className="lm-items">{dd && p.items.map((it, i) => (it ? <img key={i} src={`${IMG}/${dd.v}/img/item/${it}.png`} alt="" loading="lazy" /> : <b key={i} />))}</span>
    </div>
  );
}
