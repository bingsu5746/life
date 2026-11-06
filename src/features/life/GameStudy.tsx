// 통계 › 이것저것: 게임 시간(Steam · 롤)과 공부 시간 비교 (최근 8주)
import { useEffect, useState } from 'react';
import { isLoggedIn, lolGames, lolProfile, steamMe } from '../auth/api';
import { BarChart } from '../study/charts';
import { addDays } from '../study/dates';
import { alive } from '../study/model';
import { useStudy } from '../study/store';
import { useToday } from '../study/ui';
import { gameVsStudy } from './funStats';
import { lolDaily } from './GameTime';
import { dailyPlay } from './steamPlay';

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

export function GameStudyCard() {
  const d = useStudy();
  const today = useToday();
  const sid = d.settings.steamId ?? '';
  const lid = d.settings.lolId ?? '';
  const [game, setGame] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!isLoggedIn() || (!sid && !lid)) return;
    let on = true;
    const out: Record<string, number> = {};
    const add = (k: string, m: number) => (out[k] = (out[k] ?? 0) + m);
    Promise.all([
      sid ? steamMe(sid).then((r) => dailyPlay(r.hist ?? {}).forEach((x) => add(x.date, x.min))) : null,
      lid ? lolProfile(lid).then((p) => lolGames(p.puuid)).then((r) => Object.entries(lolDaily(r.games)).forEach(([k, m]) => add(k, m))) : null,
    ])
      .then(() => on && setGame(out))
      .catch(() => on && setErr('게임 시간을 받지 못했어요'));
    return () => {
      on = false;
    };
  }, [sid, lid]);
  if (!sid && !lid) return null;
  if (err) return <p className="st-muted">{err}</p>;
  if (!game) return <section className="st-card"><h3 className="st-h">게임과 공부</h3><small className="st-muted">게임 시간을 받는 중…</small></section>;
  const keys = Object.keys(game).sort();
  if (!keys.length) return null;
  const from = keys[0] > addDays(today, -55) ? keys[0] : addDays(today, -55);
  const study = new Map<string, number>();
  for (const s of alive(d.sessions)) study.set(s.date, (study.get(s.date) ?? 0) + s.minutes);
  const r = gameVsStudy(game, study, from, today);
  return (
    <section className="st-card">
      <h3 className="st-h">🎮 게임과 공부</h3>
      <div className="in-stats">
        {r.heavy.days > 0 && (
          <div>
            <small>게임 1시간 넘게 한 날 공부</small>
            <b>{hm(r.heavy.avg)}</b>
            <small className="st-muted">{r.heavy.days}일 평균</small>
          </div>
        )}
        {r.light.days > 0 && (
          <div>
            <small>게임 1시간 안 한 날 공부</small>
            <b>{hm(r.light.avg)}</b>
            <small className="st-muted">{r.light.days}일 평균</small>
          </div>
        )}
        {r.none.days > 0 && (
          <div>
            <small>게임 안 한 날 공부</small>
            <b>{hm(r.none.avg)}</b>
            <small className="st-muted">{r.none.days}일 평균</small>
          </div>
        )}
      </div>
      <BarChart label="주마다 게임 시간" height={120} bars={r.weeks.map((w) => ({ label: w.label, value: w.game, title: `게임 ${hm(w.game)} · 공부 ${hm(w.study)}` }))} format={(v) => (v >= 60 ? `${Math.round((v / 60) * 10) / 10}시간` : `${v}분`)} />
      <BarChart label="주마다 공부 시간" height={120} bars={r.weeks.map((w) => ({ label: w.label, value: w.study, title: `공부 ${hm(w.study)} · 게임 ${hm(w.game)}` }))} format={(v) => (v >= 60 ? `${Math.round((v / 60) * 10) / 10}시간` : `${v}분`)} />
      <small className="st-muted">Steam 은 하루 한 번 적은 기록이라 며칠 비면 뒤 날짜에 몰려요. 최근 8주까지.</small>
    </section>
  );
}
