// 홈코트(HomeCourt) 앱 운동 결과 화면 사진에서 슛 위치 읽기.
// 슛 차트: 주황 동그라미 = 넣은 슛, 파란 × = 놓친 슛, 흰 카드(회색 테두리) 안의 반코트 (림이 위쪽).
// 숫자(성공 · 시도 · 구역 %)는 서버 AI 가 읽고, 점 위치는 여기서 색으로 찾는다.

export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** 카드 안 위치 (0~1, 왼쪽 위가 0,0 · 위쪽이 베이스라인) */
export interface Shot {
  x: number;
  y: number;
  made: boolean;
}

const isGray = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b) < 14 && r >= 185 && r <= 246;
const isOrange = (r: number, g: number, b: number) => r > 200 && g > 35 && g < 155 && b < 95;
const isBlue = (r: number, g: number, b: number) => b > 110 && b - r > 50 && r < 120 && g < 150;

/** 슛 차트 카드 찾기: 회색 테두리 가로줄 두 개(위 · 아래)와 세로줄 두 개(왼쪽 · 오른쪽). 못 찾으면 null */
export function findCard(img: Img, hint?: Box): Box | null {
  const { width: W, height: H, data } = img;
  const gray = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return isGray(data[i], data[i + 1], data[i + 2]);
  };
  // 가로줄: 화면 폭의 70~98% 를 차지하는 회색 줄 (화면 끝까지 이어지는 구분선은 빼고). 붙어 있는 줄은 하나로
  // 줄마다 [시작, 끝] (두꺼운 테두리 · 그림자는 한 줄로)
  const lines: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (gray(x, y)) n++;
    if (!(n > 0.7 * W && n < 0.985 * W)) continue;
    const last = lines[lines.length - 1];
    if (last && y - last[1] <= 3) last[1] = y;
    else lines.push([y, y]);
  }
  // 위 · 아래 줄: 사이가 화면 높이의 15% 넘고, 그 사이에 주황 · 파란 점이 가장 많은 짝
  const colored = (ya: number, yb: number) => {
    let n = 0;
    for (let y = ya; y < yb; y += 2)
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4;
        if (isOrange(data[i], data[i + 1], data[i + 2]) || isBlue(data[i], data[i + 1], data[i + 2])) n++;
      }
    return n;
  };
  let top = -1,
    bottom = -1,
    most = 0;
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i][1],
      b = lines[i + 1][0];
    if (b - a < 0.15 * H) continue;
    if (hint && (b < hint.y0 || a > hint.y1)) continue;
    const n = colored(a, b);
    if (n > most) {
      most = n;
      top = a;
      bottom = b;
    }
  }
  if (top < 0) return null;
  // 세로줄: 그 높이의 80% 넘게 회색인 열. 왼쪽은 가운데보다 왼쪽에서 가장 바깥, 오른쪽은 가운데보다 오른쪽에서 가장 가까운 것 (옆 카드가 살짝 보일 수 있어서)
  const cols: number[] = [];
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = top; y <= bottom; y++) if (gray(x, y)) n++;
    if (n > 0.8 * (bottom - top)) cols.push(x);
  }
  const left = cols.filter((x) => x < W / 2)[0];
  const right = cols.find((x) => x > W / 2);
  if (left === undefined || right === undefined || right - left < 0.5 * W) return null;
  return { x0: left, y0: top, x1: right, y1: bottom };
}

/** 카드 안의 점 찾기. 겹친 점은 넓이로 몇 개인지 어림해서 나눈다 */
/** want: 홈코트 화면에 적힌 넣은 수 · 놓친 수를 알면, 겹친 점을 그 수에 맞게 더 나눈다 */
export function findShots(img: Img, box: Box, want?: { made: number; miss: number }): Shot[] {
  const { width: W, data } = img;
  const x0 = box.x0 + 3,
    y0 = box.y0 + 3,
    x1 = box.x1 - 3,
    y1 = box.y1 - 3;
  const w = x1 - x0,
    h = y1 - y0;
  if (w <= 0 || h <= 0) return [];
  const out: Shot[] = [];
  for (const made of [true, false]) {
    const test = made ? isOrange : isBlue;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((y + y0) * W + x + x0) * 4;
        if (test(data[i], data[i + 1], data[i + 2])) mask[y * w + x] = 1;
      }
    // 조각 잇기: 2칸 안에 있으면 같은 덩어리 (× 선이 동그라미를 가르는 경우)
    const R = Math.max(2, Math.round(w / 300));
    const label = new Int32Array(w * h).fill(-1);
    const groups: number[][] = [];
    for (let s = 0; s < w * h; s++) {
      if (!mask[s] || label[s] >= 0) continue;
      const id = groups.length;
      const pts: number[] = [];
      const st = [s];
      label[s] = id;
      while (st.length) {
        const p = st.pop()!;
        pts.push(p);
        const px = p % w,
          py = (p - px) / w;
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const nx = px + dx,
              ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (mask[q] && label[q] < 0) {
              label[q] = id;
              st.push(q);
            }
          }
      }
      groups.push(pts);
    }
    // 점 하나의 넓이: 큰 덩어리들의 가운데 값 (화면 크기와 상관없이)
    const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
    const minSize = Math.max(8, (w * h) / 40000);
    const solid = sizes.filter((n) => n >= minSize);
    if (!solid.length) continue;
    const big = solid.filter((n) => n >= solid[solid.length - 1] * 0.25);
    const unit = big[Math.floor(big.length / 2)] || solid[0];
    const real = groups.filter((g) => g.length >= minSize);
    const ks = real.map((g) => Math.max(1, Math.round(g.length / unit)));
    // 화면에 적힌 수에 맞추기: 넓이에 비해 적게 센 덩어리부터 하나씩 더 (많이 셌으면 반대로). 너무 다르면 손대지 않음
    const target = want ? (made ? want.made : want.miss) : 0;
    const total = () => ks.reduce((a, b) => a + b, 0);
    if (target > 0 && Math.abs(target - total()) <= Math.max(3, target * 0.3)) {
      while (total() < target) {
        let bi = 0;
        real.forEach((g, i) => g.length / unit - ks[i] > real[bi].length / unit - ks[bi] && (bi = i));
        ks[bi]++;
      }
      while (total() > target) {
        let bi = -1;
        real.forEach((g, i) => ks[i] > 1 && (bi < 0 || g.length / unit - ks[i] < real[bi].length / unit - ks[bi]) && (bi = i));
        if (bi < 0) break;
        ks[bi]--;
      }
    }
    for (const [gi, g] of real.entries()) {
      const k = ks[gi];
      for (const c of split(g, w, k)) out.push({ x: (c[0] + x0 - box.x0) / (box.x1 - box.x0), y: (c[1] + y0 - box.y0) / (box.y1 - box.y0), made });
    }
  }
  return out.map((s) => ({ x: Math.round(s.x * 1000) / 1000, y: Math.round(s.y * 1000) / 1000, made: s.made }));
}

/** 덩어리를 k 개 점으로 (k-평균) */
function split(pts: number[], w: number, k: number): [number, number][] {
  const xy = pts.map((p) => [p % w, Math.floor(p / w)] as [number, number]);
  const mean = (list: [number, number][]): [number, number] => [list.reduce((a, p) => a + p[0], 0) / list.length, list.reduce((a, p) => a + p[1], 0) / list.length];
  if (k === 1) return [mean(xy)];
  // 처음 중심: 서로 가장 먼 점들
  const c: [number, number][] = [xy[0]];
  while (c.length < k) {
    let best = xy[0],
      bd = -1;
    for (const p of xy) {
      const d = Math.min(...c.map((q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2));
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    c.push(best);
  }
  for (let it = 0; it < 10; it++) {
    const buckets: [number, number][][] = c.map(() => []);
    for (const p of xy) {
      let bi = 0,
        bd = Infinity;
      c.forEach((q, i) => {
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      buckets[bi].push(p);
    }
    buckets.forEach((b, i) => b.length && (c[i] = mean(b)));
  }
  return c;
}

// ===== 구역: 홈코트 차트는 FIBA 코트 크기와 맞는다 (보내 준 화면에서 잼: 폭 15m 기준 페인트 폭 4.9m · 길이 5.8m · 3점 6.75m · 코너 6.6m 가 화면 선과 일치)
// 카드 높이는 폭의 0.685 배(=10.27m), 림은 베이스라인에서 1.575m =====
export type ZoneKey = 'ra' | 'paint' | 'midLB' | 'midL' | 'midC' | 'midR' | 'midRB' | 'c3L' | 'w3L' | 'top3' | 'w3R' | 'c3R';
export const ZONES: { key: ZoneKey; label: string; kind: 'paint' | 'mid' | 'three'; at: [number, number] }[] = [
  { key: 'ra', label: '골밑', kind: 'paint', at: [0.5, 0.16] },
  { key: 'paint', label: '페인트존', kind: 'paint', at: [0.5, 0.42] },
  { key: 'midLB', label: '왼쪽 베이스라인', kind: 'mid', at: [0.2, 0.15] },
  { key: 'midL', label: '왼쪽 엘보', kind: 'mid', at: [0.22, 0.5] },
  { key: 'midC', label: '자유투 라인 위', kind: 'mid', at: [0.5, 0.68] },
  { key: 'midR', label: '오른쪽 엘보', kind: 'mid', at: [0.78, 0.5] },
  { key: 'midRB', label: '오른쪽 베이스라인', kind: 'mid', at: [0.8, 0.15] },
  { key: 'c3L', label: '왼쪽 코너 3점', kind: 'three', at: [0.025, 0.2] },
  { key: 'w3L', label: '왼쪽 45도 3점', kind: 'three', at: [0.1, 0.8] },
  { key: 'top3', label: '탑 3점', kind: 'three', at: [0.5, 0.92] },
  { key: 'w3R', label: '오른쪽 45도 3점', kind: 'three', at: [0.9, 0.8] },
  { key: 'c3R', label: '오른쪽 코너 3점', kind: 'three', at: [0.975, 0.2] },
];
export const COURT = { w: 15, h: 10.27, rimY: 1.575, three: 6.75, corner: 6.6, cornerY: 2.99, paintHalf: 2.45, paintLen: 5.8, ra: 1.25, ftR: 1.8 };

export function zoneOf(x: number, y: number): ZoneKey {
  const fx = x * COURT.w - COURT.w / 2;
  const fy = y * COURT.h;
  const d = Math.hypot(fx, fy - COURT.rimY);
  const ang = (Math.atan2(fx, fy - COURT.rimY) * 180) / Math.PI; // 0 = 림에서 똑바로 앞(아래), - 왼쪽, + 오른쪽
  if ((fy < COURT.cornerY && Math.abs(fx) >= COURT.corner) || (fy >= COURT.cornerY && d >= COURT.three)) {
    if (fy < COURT.cornerY) return fx < 0 ? 'c3L' : 'c3R';
    return ang < -22 ? 'w3L' : ang > 22 ? 'w3R' : 'top3';
  }
  if (d < COURT.ra) return 'ra';
  if (Math.abs(fx) < COURT.paintHalf && fy < COURT.paintLen) return 'paint';
  if (fy < COURT.cornerY && Math.abs(fx) >= COURT.paintHalf) return fx < 0 ? 'midLB' : 'midRB';
  return ang < -30 ? 'midL' : ang > 30 ? 'midR' : 'midC';
}
export const kindOf = (z: ZoneKey) => ZONES.find((x) => x.key === z)!.kind;
