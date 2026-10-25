// 작은 그래프 (SVG, 그래프 꾸러미 없이). 흑백 화면에 맞춰 한 가지 색(--accent)으로만 그린다.
// 선·막대 위에 손가락이나 마우스를 올리면 값을 보여 주고, 「표로 보기」로 숫자를 그대로 볼 수 있다.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** 감싼 칸의 너비 (화면 크기가 바뀌면 다시 그린다) */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.clientWidth);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** 축 눈금: 보기 좋은 간격 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const PAD = { top: 14, right: 14, bottom: 26, left: 40 };

/** 아래 글자를 몇 칸마다 쓸지와, i 번째에 쓸지 (마지막 칸은 늘 쓰고, 그 바로 앞은 겹치지 않게 뺀다) */
function labelAt(n: number, width: number, minGap: number) {
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(width / minGap))));
  return (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.75);
}

interface Tip {
  x: number;
  y: number;
  title: string;
  value: string;
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  // 오른쪽 끝에서는 왼쪽으로 펼친다
  const right = tip.x > width - 120;
  return (
    <div className="ch-tip" style={{ left: right ? undefined : tip.x + 10, right: right ? width - tip.x + 10 : undefined, top: Math.max(0, tip.y - 44) }} role="status">
      <small>{tip.title}</small>
      <b>{tip.value}</b>
    </div>
  );
}

export interface LinePoint {
  label: string;
  /** 자세한 이름 (값 보기에) */
  title?: string;
  y: number | null;
}

/**
 * 꺾은선 (한 줄). invert: 작을수록 위 (등급).
 * domain 을 주지 않으면 값에 맞춘다.
 */
export function LineChart({ points, domain, ticks: fixedTicks, invert, format = String, height = 180, label, goal }: { points: LinePoint[]; domain?: [number, number]; ticks?: number[]; invert?: boolean; format?: (v: number) => string; height?: number; label: string; goal?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.y).filter((v): v is number => v !== null);
  const lo = domain ? domain[0] : Math.min(...vals);
  const hi = domain ? domain[1] : Math.max(...vals);
  const span = hi - lo || 1;
  const [min, max] = domain ? [lo, hi] : [lo - span * 0.1, hi + span * 0.1];
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.top + (invert ? (v - min) / (max - min || 1) : 1 - (v - min) / (max - min || 1)) * ih;
  const ticks = fixedTicks ?? niceTicks(min, max, 4).filter((t) => t >= min && t <= max);
  // 값이 없는 곳은 선을 끊는다
  let path = '';
  points.forEach((p, i) => {
    if (p.y === null) return;
    path += `${path && points[i - 1]?.y !== null && i > 0 ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`;
  });
  let lastI = -1;
  points.forEach((p, i) => p.y !== null && (lastI = i));
  const showLabel = labelAt(points.length, iw, 56);
  const h = hover !== null ? points[hover] : null;

  function move(clientX: number) {
    const el = ref.current;
    if (!el || !points.length) return;
    const px = clientX - el.getBoundingClientRect().left;
    const i = points.length <= 1 ? 0 : Math.round(((px - PAD.left) / (iw || 1)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <div className="ch" ref={ref} onPointerMove={(e) => move(e.clientX)} onPointerDown={(e) => move(e.clientX)} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="ch-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="ch-axis" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            showLabel(i) ? (
              <text key={i} className="ch-axis" x={x(i)} y={height - 8} textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}>
                {p.label}
              </text>
            ) : null,
          )}
          {goal !== undefined && goal >= min && goal <= max && (
            <g>
              <line className="ch-avg" x1={PAD.left} x2={width - PAD.right} y1={y(goal)} y2={y(goal)} />
              <text className="ch-axis" x={PAD.left + 4} y={y(goal) - 4}>
                목표
              </text>
            </g>
          )}
          {h && h.y !== null && <line className="ch-cross" x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + ih} />}
          <path className="ch-line" d={path} />
          {points.map((p, i) => (p.y === null ? null : <circle key={i} className={`ch-dot ${hover === i ? 'on' : ''}`} cx={x(i)} cy={y(p.y)} r={hover === i ? 5 : 4} />))}
          {lastI >= 0 && points[lastI].y !== null && hover === null && (
            <text className="ch-val" x={x(lastI)} y={y(points[lastI].y!) - 10} textAnchor={lastI === points.length - 1 && points.length > 1 ? 'end' : 'middle'}>
              {format(points[lastI].y!)}
            </text>
          )}
        </svg>
      )}
      <Tooltip tip={h && h.y !== null ? { x: x(hover!), y: y(h.y), title: h.title ?? h.label, value: format(h.y) } : null} width={width} />
    </div>
  );
}

export interface BarItem {
  label: string;
  title?: string;
  value: number;
  /** 오늘처럼 눈에 띄게 */
  strong?: boolean;
}

/** 세로 막대 (한 가지 값). avg 를 주면 평균 선 */
export function BarChart({ bars, format = String, height = 180, avg, avgLabel = '평균', label, tickUnit = 1 }: { bars: BarItem[]; format?: (v: number) => string; height?: number; avg?: number; avgLabel?: string; label: string; tickUnit?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value), avg ?? 0);
  // 눈금은 tickUnit 단위로 (분을 시간 단위 눈금으로 등)
  const ticks = niceTicks(0, max / tickUnit, 3).map((t) => t * tickUnit);
  const top = Math.max(max, ticks.at(-1) ?? max);
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const slot = bars.length ? iw / bars.length : 0;
  const bw = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => PAD.top + (1 - v / top) * ih;
  const showLabel = labelAt(bars.length, iw, 34);
  const h = hover !== null ? bars[hover] : null;

  function move(clientX: number) {
    const el = ref.current;
    if (!el || !bars.length) return;
    const i = Math.floor((clientX - el.getBoundingClientRect().left - PAD.left) / (slot || 1));
    setHover(i >= 0 && i < bars.length ? i : null);
  }

  return (
    <div className="ch" ref={ref} onPointerMove={(e) => move(e.clientX)} onPointerDown={(e) => move(e.clientX)} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'ch-base' : 'ch-grid'} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="ch-axis" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const bh = (b.value / top) * ih;
            const r = Math.min(4, bw / 2, bh);
            const x0 = cx - bw / 2;
            const y0 = PAD.top + ih - bh;
            // 위쪽만 둥글게 (바닥은 기준선에 붙인다)
            const d = bh <= 0 ? '' : `M${x0},${PAD.top + ih}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${PAD.top + ih}Z`;
            return (
              <g key={i}>
                {d && <path className={`ch-bar ${b.strong ? 'strong' : ''} ${hover !== null && hover !== i ? 'dim' : ''}`} d={d} />}
                {showLabel(i) && (
                  <text className="ch-axis" x={cx} y={height - 8} textAnchor="middle">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
          {avg !== undefined && avg > 0 && <line className="ch-avg" x1={PAD.left} x2={width - PAD.right} y1={y(avg)} y2={y(avg)} />}
        </svg>
      )}
      {avg !== undefined && avg > 0 && <small className="ch-note">점선: {avgLabel} {format(avg)}</small>}
      <Tooltip tip={h ? { x: PAD.left + slot * hover! + slot / 2, y: y(h.value), title: h.title ?? h.label, value: format(h.value) } : null} width={width} />
    </div>
  );
}

/** 그래프의 숫자를 표로 (화면 읽기·정확한 값) */
export function TableView({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="ch-table">
      <summary>표로 보기</summary>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
