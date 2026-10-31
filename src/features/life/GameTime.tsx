// 게임 › 게임 시간: Steam(하루 한 번 적어 둔 게임별 한 시간의 차이) + 롤(경기 시간)을 날마다 자동으로
import { useEffect, useState } from 'react';
import { isLoggedIn, lolGames, lolProfile, steamMe, steamTrack } from '../auth/api';
import { addDays, shortDate, weekStart } from '../study/dates';
import { useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { useToday } from '../study/ui';
import type { LolGame } from './lolStats';
import { dailyPlay, type SteamHist } from './steamPlay';

/** 롤 경기 → 날짜(한국)마다 분 */
export function lolDaily(games: LolGame[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of games) {
    const day = new Date(g.at + 9 * 3600_000).toISOString().slice(0, 10);
    out[day] = (out[day] ?? 0) + Math.round(g.dur / 60);
  }
  return out;
}

export function GameTimeCard() {
  const d = useStudy();
  const today = useToday();
  const sid = d.settings.steamId ?? '';
  const lid = d.settings.lolId ?? '';
  const [steam, setSteam] = useState<{ hist: SteamHist; names: Record<number, string> } | null>(null);
  const [lol, setLol] = useState<Record<string, number> | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!isLoggedIn()) return;
    if (sid) void steamTrack(sid).catch(() => {});
    if (sid)
      steamMe(sid)
        .then((r) => setSteam({ hist: r.hist ?? {}, names: Object.fromEntries((r.me?.owned ?? []).map((g) => [g.appid, g.name])) }))
        .catch(() => setNote('Steam 시간을 받지 못했어요'));
    if (lid)
      lolProfile(lid)
        .then((p) => lolGames(p.puuid))
        .then((r) => setLol(lolDaily(r.games)))
        .catch(() => setNote('롤 시간을 받지 못했어요'));
  }, [sid, lid]);
  if (!sid && !lid)
    return (
      <section className="st-card">
        <h3 className="st-h">게임 시간</h3>
        <p className="st-muted sm">설정 › 운동·돈·취미 › 게임 계정에 Steam ID · 라이엇 ID 를 넣으면 날마다 한 게임 시간을 저절로 모아 보여 드려요.</p>
      </section>
    );
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const sd = steam ? dailyPlay(steam.hist) : [];
  const steamOf = (x: string) => sd.find((v) => v.date === x)?.min ?? 0;
  const lolOf = (x: string) => lol?.[x] ?? 0;
  const week = weekStart(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((x) => x <= today);
  const sum = (f: (x: string) => number, list: string[]) => list.reduce((a, x) => a + f(x), 0);
  const max = Math.max(1, ...days.map((x) => steamOf(x) + lolOf(x)));
  // 이번 주 Steam 게임별 (앱마다 차이)
  const perApp = new Map<number, number>();
  if (steam) {
    const keys = Object.keys(steam.hist).sort();
    for (let i = 1; i < keys.length; i++) {
      if (keys[i] < week) continue;
      for (const [id, m] of Object.entries(steam.hist[keys[i]])) {
        const diff = m - (steam.hist[keys[i - 1]][Number(id)] ?? 0);
        if (diff > 0) perApp.set(Number(id), (perApp.get(Number(id)) ?? 0) + diff);
      }
    }
  }
  const top = [...perApp].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lolWeek = sum(lolOf, weekDays);
  return (
    <section className="st-card">
      <div className="sh-head">
        <h3 className="st-h">게임 시간</h3>
        <small className="st-muted">
          오늘 {minutesText(steamOf(today) + lolOf(today))} · 이번 주 {minutesText(sum(steamOf, weekDays) + lolWeek)}
        </small>
      </div>
      <div className="gs-week">
        {days.map((x) => (
          <div key={x} title={`${shortDate(x)} Steam ${minutesText(steamOf(x))} · 롤 ${minutesText(lolOf(x))}`}>
            <span className="gs-stack" style={{ height: `${((steamOf(x) + lolOf(x)) / max) * 100}%` }}>
              {lolOf(x) > 0 && <i className="l" style={{ flex: lolOf(x) }} />}
              {steamOf(x) > 0 && <i className="g" style={{ flex: steamOf(x) }} />}
            </span>
            <small>{Number(x.slice(8))}</small>
          </div>
        ))}
      </div>
      <p className="st-muted sm">
        {sid && (
          <>
            <i className="gs-dot g" /> Steam{' '}
          </>
        )}
        {lid && (
          <>
            <i className="gs-dot l" /> 롤{' '}
          </>
        )}
        · 롤은 경기 시간을 그대로, Steam 은 하루 한 번 적어 둔 한 시간의 차이로 세요 (그래서 Steam 은 하루가 밀릴 수 있어요).
      </p>
      {(top.length > 0 || lolWeek > 0) && (
        <div className="sh-dist">
          {lolWeek > 0 && (
            <div className="sh-dist-row">
              <span>리그 오브 레전드</span>
              <div className="sh-bar">
                <i style={{ width: `${(lolWeek / Math.max(lolWeek, ...top.map((t) => t[1]))) * 100}%`, background: '#2563eb' }} />
              </div>
              <small>이번 주 {minutesText(lolWeek)}</small>
            </div>
          )}
          {top.map(([id, m]) => (
            <div key={id} className="sh-dist-row">
              <span>{steam?.names[id] ?? `Steam ${id}`}</span>
              <div className="sh-bar">
                <i style={{ width: `${(m / Math.max(lolWeek, ...top.map((t) => t[1]))) * 100}%`, background: '#8b5cf6' }} />
              </div>
              <small>이번 주 {minutesText(m)}</small>
            </div>
          ))}
        </div>
      )}
      {note && <p className="st-muted sm">{note}</p>}
    </section>
  );
}
