// Steam 한 시간 기록(서버가 하루 한 번 적어 둔 게임별 모두 한 시간)으로 날마다 한 시간 구하기
export type SteamHist = Record<string, Record<number, number>>;

/** 날짜 → 그날 한 시간(분). 앞 기록과의 차이를 뒤 날짜에 넣는다 (며칠 비면 그 사이 것이 뒤 날짜에 몰림) */
export function dailyPlay(h: SteamHist, appFilter?: (appid: number) => boolean): { date: string; min: number; gap: number }[] {
  const days = Object.keys(h).sort();
  const out: { date: string; min: number; gap: number }[] = [];
  for (let i = 1; i < days.length; i++) {
    const a = h[days[i - 1]],
      b = h[days[i]];
    let min = 0;
    for (const [id, m] of Object.entries(b)) {
      const appid = Number(id);
      if (appFilter && !appFilter(appid)) continue;
      min += Math.max(0, m - (a[appid] ?? 0));
    }
    out.push({ date: days[i], min, gap: Math.round((Date.parse(days[i]) - Date.parse(days[i - 1])) / 86_400_000) });
  }
  return out;
}

/** from~to (포함) 동안 한 시간(분) */
export function playBetween(h: SteamHist, from: string, to: string, appFilter?: (appid: number) => boolean): number {
  return dailyPlay(h, appFilter)
    .filter((x) => x.date >= from && x.date <= to)
    .reduce((s, x) => s + x.min, 0);
}

/** 이번 주(또는 날짜마다 바뀌는) 「안 해 본 게임」 하나: 가진 게임 중 0분인 것에서 주마다 돌아가며 */
export function pickUnplayed<T extends { appid: number; minutes: number }>(owned: T[], weekKey: string): T | null {
  const list = owned.filter((g) => g.minutes === 0).sort((a, b) => a.appid - b.appid);
  if (!list.length) return null;
  let n = 0;
  for (const c of weekKey) n = (n * 31 + c.charCodeAt(0)) % 100003;
  return list[n % list.length];
}
