// 농구 › 이번 주 농구: 연습한 날 · 시간 · 슛(홈코트) · 드릴 + NBA 2K 한 시간(Steam) 나란히
import { useEffect, useState } from 'react';
import { isLoggedIn, steamMe } from '../auth/api';
import { addDays, weekStart } from '../study/dates';
import { alive } from '../study/model';
import { useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { useToday } from '../study/ui';
import { playBetween, type SteamHist } from './steamPlay';

export function BbWeek() {
  const d = useStudy();
  const today = useToday();
  const from = weekStart(today);
  const to = addDays(from, 6);
  const sid = d.settings.steamId ?? '';
  const [steam, setSteam] = useState<{ hist: SteamHist; ids: number[] } | null>(null);
  useEffect(() => {
    if (!sid || !isLoggedIn()) return;
    steamMe(sid)
      .then((r) => setSteam({ hist: r.hist ?? {}, ids: (r.me?.owned ?? []).filter((g) => /NBA 2K/i.test(g.name)).map((g) => g.appid) }))
      .catch(() => {});
  }, [sid]);
  const bb = alive(d.workouts).filter((w) => w.kind === '농구' && w.date >= from && w.date <= to);
  const min = bb.reduce((a, w) => a + (w.minutes ?? 0), 0);
  const shots = bb.flatMap((w) => w.bb?.shots ?? []);
  const made = shots.filter((s) => s[2]).length;
  const drills = alive(d.drillLogs).filter((x) => x.date >= from && x.date <= to).length;
  const twoK = steam && steam.ids.length ? playBetween(steam.hist, from, to, (id) => steam.ids.includes(id)) : null;
  if (!bb.length && !drills && !twoK) return null;
  return (
    <section className="st-card">
      <h3 className="st-h">이번 주 농구</h3>
      <div className="nba-avg">
        <div>
          <small>연습한 날</small>
          <b>{new Set(bb.map((w) => w.date)).size}일</b>
        </div>
        <div>
          <small>연습 시간</small>
          <b>{minutesText(min)}</b>
        </div>
        {shots.length > 0 && (
          <div>
            <small>슛 (홈코트)</small>
            <b>
              {made}/{shots.length} · {Math.round((made / shots.length) * 100)}%
            </b>
          </div>
        )}
        {drills > 0 && (
          <div>
            <small>드릴</small>
            <b>{drills}번</b>
          </div>
        )}
        {twoK !== null && (
          <div>
            <small>NBA 2K (Steam)</small>
            <b>{minutesText(twoK)}</b>
          </div>
        )}
      </div>
      {twoK !== null && min + twoK > 0 && (
        <p className="st-muted sm">
          실제 농구 {minutesText(min)} vs NBA 2K {minutesText(twoK)}
          {twoK > min ? ' — 이번 주는 게임이 더 많아요. 코트에 한 번 나가 볼까요? 🏀' : ' — 코트에서 더 많이 했어요 👍'}
        </p>
      )}
    </section>
  );
}
