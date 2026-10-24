// 남은 양을 날마다 나누기 (설계 §5.3)

/**
 * n 개를 무게에 비례해 나눈다 (큰 나머지 방식).
 * 합은 정확히 n, 무게가 같은 날끼리는 차이가 최대 1. 나머지는 소수점 아래가 큰 날부터, 같으면 앞날부터.
 */
export function apportion(n: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (n <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (n * Math.max(0, w)) / total);
  const out = exact.map((x) => Math.floor(x + 1e-9));
  let left = n - out.reduce((s, x) => s + x, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x + 1e-9), w: weights[i] }))
    .filter((o) => o.w > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

/**
 * 하루 분량의 끝이 단원 끝에서 slack 쪽 이내면 단원 끝에 맞춘다 (다음 날 1~2쪽만 남는 일을 막음).
 * 그 날과 다음 공부하는 날 사이에서만 옮기므로 합은 그대로.
 * @param isUnitEnd 순서대로 늘어놓은 k 번째 항목이 단원의 마지막인지
 */
export function snapToUnits(counts: number[], isUnitEnd: (k: number) => boolean, total: number, slack = 2): number[] {
  const out = [...counts];
  let cum = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] <= 0) continue;
    const j = out.findIndex((c, k) => k > i && c > 0);
    if (j < 0) break;
    const b = cum + out[i]; // 다음 날 첫 항목의 번호
    let best = 0;
    for (let d = 1; d <= slack; d++) {
      // 끝을 단원 끝으로: 앞으로 당기기(-d) 또는 뒤로 늘리기(+d), 가까운 쪽 먼저, 같으면 늘리기
      for (const delta of [d, -d]) {
        const end = b + delta - 1;
        if (end < cum || end >= total - 1) continue;
        if (!isUnitEnd(end)) continue;
        if (out[i] + delta < 1 || out[j] - delta < 1) continue;
        best = delta;
        break;
      }
      if (best) break;
    }
    if (best && !isUnitEnd(b - 1)) {
      out[i] += best;
      out[j] -= best;
    }
    cum += out[i];
  }
  return out;
}

/** 순서대로 늘어놓은 항목을 날짜별 개수대로 잘라 준다 */
export function slice<T>(items: T[], counts: number[]): T[][] {
  const out: T[][] = [];
  let k = 0;
  for (const c of counts) {
    out.push(items.slice(k, k + c));
    k += c;
  }
  return out;
}
