// 슛 분석 화면 + 홈코트 사진 넣기. 슛 위치는 기기에서 사진 색으로 찾고(homecourt.ts), 숫자는 서버 AI 가 읽는다
import { useMemo, useState } from 'react';
import { bbScan, nbaAvg, type HcRead, type NbaAverage } from '../auth/api';
import { LineChart } from '../study/charts';
import { addDays, shortDate } from '../study/dates';
import { alive, newId, type Workout } from '../study/model';
import { put, remove, setSettings, useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { confirmDelete, Empty, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { AREA_NAME, DRILLS, type DrillArea } from './drills';
import { findCard, findShots, kindOf, ZONES, type Img, type ZoneKey } from './homecourt';
import { bestWorst, durationSecs, heat, pct, report, shotSessions, whenDate, type Line, type ShotRec } from './shots';

const H = 685; // 카드 세로 (가로 1000 기준, FIBA 반코트 비율)
const M = 1000 / 15; // 1m = 66.7
const pctText = (l: Line) => (l.a ? `${Math.round(pct(l))}%` : '-');

/** 반코트 그림 + 점 또는 구역 색 */
export function ShotChart({ shots, mode = 'dots' }: { shots: ShotRec[]; mode?: 'dots' | 'zones' }) {
  const r = report(shots);
  const overall = pct(r.total);
  const rim = 1.575 * M;
  return (
    <svg className="sh-court" viewBox={`0 0 1000 ${H}`} role="img" aria-label={`슛 차트: ${r.total.a}개 중 ${r.total.m}개`}>
      <rect x="2" y="2" width="996" height={H - 4} rx="18" className="sh-floor" />
      <g className="sh-line">
        <rect x={500 - 2.45 * M} y="2" width={4.9 * M} height={5.8 * M - 2} />
        <circle cx="500" cy={5.8 * M} r={1.8 * M} />
        <line x1={500 - 0.9 * M} y1={1.2 * M} x2={500 + 0.9 * M} y2={1.2 * M} />
        <circle cx="500" cy={rim} r="15" />
        <path d={`M ${500 - 1.25 * M} ${rim} A ${1.25 * M} ${1.25 * M} 0 0 0 ${500 + 1.25 * M} ${rim}`} />
        <path d={`M ${0.9 * M} 2 L ${0.9 * M} ${2.99 * M} A ${6.75 * M} ${6.75 * M} 0 0 0 ${1000 - 0.9 * M} ${2.99 * M} L ${1000 - 0.9 * M} 2`} />
      </g>
      {mode === 'dots' &&
        shots.map((s, i) => {
          const x = s[0],
            y = (s[1] / 1000) * H;
          return s[2] ? <circle key={i} cx={x} cy={y} r="13" className="sh-made" /> : <path key={i} d={`M ${x - 10} ${y - 10} L ${x + 10} ${y + 10} M ${x + 10} ${y - 10} L ${x - 10} ${y + 10}`} className="sh-miss" />;
        })}
      {mode === 'zones' &&
        ZONES.map((z) => {
          const l = r.zones[z.key];
          if (!l.a) return null;
          const h = heat(l, overall);
          const x = Math.min(930, Math.max(70, z.at[0] * 1000)),
            y = z.at[1] * H;
          return (
            <g key={z.key} className="sh-zone" style={{ ['--h' as string]: h === null ? 0 : h }}>
              <rect x={x - 62} y={y - 34} width="124" height="68" rx="14" className={h === null ? 'few' : h > 0 ? 'hot' : 'cold'} style={{ opacity: h === null ? 0.5 : 0.35 + Math.abs(h) * 0.65 }} />
              <text x={x} y={y - 4} className="sh-zpct">
                {pctText(l)}
              </text>
              <text x={x} y={y + 22} className="sh-zn">
                {l.m}-{l.a}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

/** 농구 › 슛 분석 */
export function ShotsPage() {
  const d = useStudy();
  const today = useToday();
  const [range, setRange] = useState<'last' | '30' | 'all'>('30');
  const [mode, setMode] = useState<'dots' | 'zones'>('zones');
  const [open, setOpen] = useState<Workout | null>(null);
  const [adding, setAdding] = useState(false);
  const all = shotSessions(d);
  const list = range === 'last' ? all.slice(-1) : range === '30' ? all.filter((w) => w.date >= addDays(today, -29)) : all;
  const shots = useMemo(() => list.flatMap((w) => w.bb!.shots!), [list]);
  const r = report(shots);
  const bw = bestWorst(r);
  const secs = list.reduce((a, w) => a + (w.bb?.hc?.secs ?? (w.minutes ?? 0) * 60), 0);
  const zoneName = (k?: string) => ZONES.find((z) => z.key === k)?.label;
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>슛 분석</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> 홈코트 사진 넣기
        </button>
      </div>
      {!all.length ? (
        <Empty title="홈코트 결과 화면을 넣어 보세요">
          <p>홈코트 앱의 운동 결과 화면(점이 찍힌 슛 차트)을 캡처해서 넣으면, 슛 위치를 읽어서 구역별 성공률 · 슛 분포 · 기록 흐름을 NBA 선수 분석처럼 보여 드려요. 구역 % 화면도 같이 넣으면 숫자를 맞춰 봐요.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            사진 넣기
          </button>
        </Empty>
      ) : (
        <>
          <div className="st-seg" role="group" aria-label="기간">
            {(
              [
                ['last', '마지막 연습'],
                ['30', '최근 30일'],
                ['all', '전체'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>
                {label}
              </button>
            ))}
          </div>
          {!shots.length ? (
            <p className="st-muted">이 기간에는 기록이 없어요.</p>
          ) : (
            <>
              <section className="st-card">
                <div className="nba-avg">
                  {[
                    ['야투', `${pctText(r.total)}`, `${r.total.m}/${r.total.a}`],
                    ['유효 야투율 (eFG%)', `${Math.round(r.efg)}%`, '3점은 1.5개로'],
                    ['2점', pctText(r.two), `${r.two.m}/${r.two.a}`],
                    ['3점', pctText(r.three), `${r.three.m}/${r.three.a}`],
                    ['평균 슛 거리', `${r.avgDist.toFixed(1)}m`, `가장 먼 성공 ${r.longest.toFixed(1)}m`],
                    ['연습', `${list.length}번`, secs ? `${minutesText(Math.round(secs / 60))} · 분당 ${(r.total.a / (secs / 60)).toFixed(1)}개` : ''],
                  ].map(([k, v, sub]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <b>{v}</b>
                      {sub && <small>{sub}</small>}
                    </div>
                  ))}
                </div>
              </section>
              <section className="st-card">
                <div className="sh-head">
                  <h3 className="st-h">슛 차트</h3>
                  <div className="st-seg sm" role="group" aria-label="보기">
                    <button className={mode === 'zones' ? 'on' : ''} onClick={() => setMode('zones')}>
                      구역
                    </button>
                    <button className={mode === 'dots' ? 'on' : ''} onClick={() => setMode('dots')}>
                      점
                    </button>
                  </div>
                </div>
                <ShotChart shots={shots} mode={mode} />
                <p className="st-muted sm">{mode === 'zones' ? '빨강일수록 내 평균보다 잘 넣는 곳, 파랑일수록 못 넣는 곳 (5개 안 던진 곳은 흐리게).' : '주황 ● 넣은 슛 · 파랑 × 놓친 슛'}</p>
                {(bw.best || bw.worst) && (
                  <p className="sh-bw">
                    {bw.best && (
                      <span>
                        🔥 가장 잘 넣는 곳: <b>{zoneName(bw.best)}</b> {pctText(r.zones[bw.best as keyof typeof r.zones])}
                      </span>
                    )}
                    {bw.worst && (
                      <span>
                        🧊 연습이 필요한 곳: <b>{zoneName(bw.worst)}</b> {pctText(r.zones[bw.worst as keyof typeof r.zones])}
                      </span>
                    )}
                  </p>
                )}
                {bw.worst && <DrillTips zone={bw.worst} />}
              </section>
              <ShotGoals r={r} />
              <section className="st-card">
                <h3 className="st-h">슛 분포</h3>
                <div className="sh-dist">
                  {(
                    [
                      ['paint', '페인트존'],
                      ['mid', '미드레인지'],
                      ['three', '3점'],
                    ] as const
                  ).map(([k, label]) => {
                    const l = r.kinds[k];
                    const share = r.total.a ? (l.a / r.total.a) * 100 : 0;
                    return (
                      <div key={k} className={`sh-dist-row ${k}`}>
                        <span>{label}</span>
                        <div className="sh-bar">
                          <i style={{ width: `${share}%` }} />
                        </div>
                        <small>
                          시도 {Math.round(share)}% · 성공 {pctText(l)} ({l.m}/{l.a})
                        </small>
                      </div>
                    );
                  })}
                </div>
                <h3 className="st-h">거리별 성공률</h3>
                <div className="sh-dist">
                  {r.byDist.map((l, i) =>
                    l.a ? (
                      <div key={i} className="sh-dist-row">
                        <span>{i === r.byDist.length - 1 ? `${i}m 이상` : `${i}~${i + 1}m`}</span>
                        <div className="sh-bar">
                          <i style={{ width: `${pct(l)}%` }} />
                        </div>
                        <small>
                          {pctText(l)} ({l.m}/{l.a})
                        </small>
                      </div>
                    ) : null,
                  )}
                </div>
              </section>
              <section className="st-card">
                <h3 className="st-h">구역별</h3>
                <div className="nba-scroll">
                  <table className="nba-table">
                    <thead>
                      <tr>
                        <th className="l">구역</th>
                        <th>성공</th>
                        <th>성공률</th>
                        <th>시도 비율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ZONES.filter((z) => r.zones[z.key].a).map((z) => (
                        <tr key={z.key}>
                          <td className="l">{z.label}</td>
                          <td>
                            {r.zones[z.key].m}/{r.zones[z.key].a}
                          </td>
                          <td>{pctText(r.zones[z.key])}</td>
                          <td>{Math.round((r.zones[z.key].a / r.total.a) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {shots.length > 0 && <NbaCompare r={r} />}
          {all.length > 1 && (
            <section className="st-card">
              <h3 className="st-h">연습마다</h3>
              <LineChart label="야투 성공률" height={150} domain={[0, 100]} points={all.slice(-20).map((w) => ({ label: shortDate(w.date).replace(/\(.\)/, ''), title: shortDate(w.date), y: Math.round(pct(report(w.bb!.shots!).total)) }))} format={(x) => `${Math.round(x)}%`} />
              <LineChart
                label="3점 성공률"
                height={150}
                domain={[0, 100]}
                points={all.slice(-20).map((w) => ({ label: shortDate(w.date).replace(/\(.\)/, ''), title: shortDate(w.date), y: report(w.bb!.shots!).three.a ? Math.round(pct(report(w.bb!.shots!).three)) : null }))}
                format={(x) => `${Math.round(x)}%`}
              />
            </section>
          )}
          <section className="st-card">
            <h3 className="st-h">기록</h3>
            {[...all].reverse().map((w) => {
              const rr = report(w.bb!.shots!);
              return (
                <div key={w.id} className="st-item st-tap" {...tap(() => setOpen(w))}>
                  <small className="st-muted nowrap">{shortDate(w.date)}</small>
                  <div className="st-item-main">
                    <div className="st-item-title">
                      {rr.total.m}/{rr.total.a} · {pctText(rr.total)}
                      {w.minutes ? ` · ${minutesText(w.minutes)}` : ''}
                    </div>
                    <div className="st-item-sub">
                      페인트 {pctText(rr.kinds.paint)} · 미드 {pctText(rr.kinds.mid)} · 3점 {pctText(rr.kinds.three)}
                      {w.memo ? ` · ${w.memo}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
      {open && <SessionSheet w={open} onClose={() => setOpen(null)} />}
      {adding && <HcImport today={today} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** 연습 한 번 자세히 */
function SessionSheet({ w, onClose }: { w: Workout; onClose: () => void }) {
  const [mode, setMode] = useState<'dots' | 'zones'>('dots');
  const r = report(w.bb!.shots!);
  const hc = w.bb?.hc;
  return (
    <Sheet title={`${shortDate(w.date)} 슛 연습`} onClose={onClose}>
      <div className="st-seg sm" role="group" aria-label="보기">
        <button className={mode === 'dots' ? 'on' : ''} onClick={() => setMode('dots')}>
          점
        </button>
        <button className={mode === 'zones' ? 'on' : ''} onClick={() => setMode('zones')}>
          구역
        </button>
      </div>
      <ShotChart shots={w.bb!.shots!} mode={mode} />
      <div className="nba-avg">
        {[
          ['야투', `${pctText(r.total)} (${r.total.m}/${r.total.a})`],
          ['페인트존', pctText(r.kinds.paint)],
          ['미드레인지', pctText(r.kinds.mid)],
          ['3점', pctText(r.kinds.three)],
          ['eFG%', `${Math.round(r.efg)}%`],
          ['걸린 시간', w.minutes ? minutesText(w.minutes) : '-'],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {hc && (hc.paint !== undefined || hc.mid !== undefined || hc.three !== undefined) && (
        <p className="st-muted sm">
          홈코트 화면에 적힌 값: 페인트 {hc.paint ?? '-'}% · 미드 {hc.mid ?? '-'}% · 3점 {hc.three ?? '-'}% (구역 경계가 조금 달라서 위 값과 1~2개 차이 날 수 있어요)
        </p>
      )}
      <div className="st-row end">
        <button className="btn btn-sm st-danger" onClick={() => confirmDelete('이 슛 연습 기록') && (remove('workouts', w.id), onClose())}>
          지우기
        </button>
      </div>
    </Sheet>
  );
}

// ===== 홈코트 사진 넣기 =====
interface Read {
  name: string;
  status: string;
  read?: HcRead;
  shots?: ShotRec[];
  error?: string;
}

/** 사진 → 화면 크기 그대로의 픽셀 + 서버에 보낼 작은 JPEG */
async function loadImage(f: File): Promise<{ img: Img; small: { mime: string; data: string } }> {
  const bmp = await createImageBitmap(f);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  // 서버로는 긴 쪽 1400px 로 줄인 JPEG (글자는 읽을 수 있게)
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const s = document.createElement('canvas');
  s.width = Math.round(bmp.width * k);
  s.height = Math.round(bmp.height * k);
  s.getContext('2d')!.drawImage(bmp, 0, 0, s.width, s.height);
  const url = s.toDataURL('image/jpeg', 0.85);
  return { img: { width: data.width, height: data.height, data: data.data }, small: { mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) } };
}

function HcImport({ today, onClose }: { today: string; onClose: () => void }) {
  const d = useStudy();
  const [reads, setReads] = useState<Read[]>([]);
  const [busy, setBusy] = useState(false);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [skip, setSkip] = useState<Record<number, boolean>>({});

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setDates({});
    setSkip({});
    const fs = [...files].slice(0, 10);
    const list: Read[] = fs.map((f) => ({ name: f.name, status: '읽는 중…' }));
    setReads(list);
    const update = (i: number, p: Partial<Read>) => {
      list[i] = { ...list[i], ...p };
      setReads([...list]);
    };
    // 서버 AI 한도를 아끼려고 2장씩
    for (let k = 0; k < fs.length; k += 2)
      await Promise.all(
        fs.slice(k, k + 2).map(async (f, j) => {
          const i = k + j;
          try {
            const { img, small } = await loadImage(f);
            const { read } = await bbScan(small);
            update(i, { read, status: read.kind === 'chart' ? '슛 차트' : read.kind === 'zones' ? '구역 화면' : '홈코트 결과 화면이 아닌 것 같아요' });
            if (read.kind === 'chart') {
              const box = findCard(img);
              if (!box) return update(i, { status: '슛 차트 칸을 찾지 못했어요' });
              const want = read.make !== null && read.attempt !== null ? { made: read.make, miss: read.attempt - read.make } : undefined;
              const shots = findShots(img, box, want).map((s) => [Math.round(s.x * 1000), Math.round(s.y * 1000), s.made ? 1 : 0] as ShotRec);
              update(i, { shots, status: `슛 차트 · 점 ${shots.length}개` });
            }
          } catch (e) {
            update(i, { status: '읽지 못했어요', error: e instanceof Error ? e.message : String(e) });
          }
        }),
      );
    setBusy(false);
  };

  // 슛 차트 한 장 = 연습 한 번. 같은 시각 · 시간이 적힌 구역 화면은 그 연습에 붙인다
  const sameTime = (a?: HcRead, b?: HcRead) => !!a && !!b && a.when === b.when && a.duration === b.duration;
  const sessions = reads
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.shots?.length)
    .map(({ r, i }) => {
      const zones = reads.find((z) => z.read?.kind === 'zones' && sameTime(z.read, r.read))?.read;
      const date = dates[i] ?? whenDate(r.read?.when, today);
      const made = r.shots!.filter((s) => s[2]).length;
      const dup = alive(d.workouts).some((w) => w.date === date && w.bb?.shots?.length === r.shots!.length && w.bb.shots.filter((s) => s[2]).length === made);
      return { i, r, zones, date, made, dup, secs: durationSecs(r.read?.duration) };
    });

  const save = () => {
    let n = 0;
    for (const x of sessions) {
      if (skip[x.i] ?? x.dup) continue;
      const shots = x.r.shots!;
      const r = report(shots);
      const hcPct = x.zones ?? x.r.read;
      put('workouts', {
        id: newId(),
        created: Date.now() + n,
        date: x.date,
        kind: '농구',
        minutes: x.secs ? Math.max(1, Math.round(x.secs / 60)) : undefined,
        bb: {
          mode: 'practice',
          fgm: r.two.m || undefined,
          fga: r.two.a || undefined,
          tpm: r.three.a ? r.three.m : undefined,
          tpa: r.three.a || undefined,
          items: [{ name: '홈코트 슛 연습', made: x.made, att: shots.length }],
          shots,
          hc: { paint: hcPct?.paint ?? undefined, mid: hcPct?.mid ?? undefined, three: hcPct?.three ?? undefined, secs: x.secs },
        },
      } as Workout);
      n++;
    }
    toast(n ? `슛 연습 ${n}번을 넣었어요` : '넣을 것이 없어요');
    if (n) onClose();
  };

  return (
    <Sheet title="홈코트 사진 넣기" onClose={onClose}>
      <p className="st-muted sm">홈코트 앱 운동 결과에서 점이 찍힌 슛 차트 화면을 캡처해서 골라 주세요. 여러 번 연습한 캡처를 한꺼번에 골라도 돼요 (10장까지). 구역 % 화면도 함께 고르면 같은 연습에 숫자를 붙여요. 사진은 숫자를 읽는 데만 쓰고 저장하지 않아요.</p>
      <label className="btn">
        사진 고르기
        <input type="file" accept="image/*" multiple hidden onChange={(e) => void pick(e.target.files)} />
      </label>
      {reads.map((r, i) => (
        <p key={i} className="st-muted sm">
          {r.name}: {r.status}
          {r.error ? ` (${r.error})` : ''}
        </p>
      ))}
      {busy && <p className="st-muted">사진을 읽는 중… (AI 가 숫자를 읽느라 한 장에 몇 초~1분 걸릴 수 있어요)</p>}
      {!busy &&
        sessions.map((x, k) => {
          const found = x.r.shots!.length;
          const make = x.r.read?.make ?? null;
          const attempt = x.r.read?.attempt ?? null;
          const off = skip[x.i] ?? x.dup;
          return (
            <div key={x.i} className={`sh-sess ${off ? 'off' : ''}`}>
              <b>
                연습 {k + 1}
                {x.r.read?.when ? ` · ${x.r.read.when}` : ''}
              </b>
              <ShotChart shots={x.r.shots!} />
              <p className="sm">
                넣은 슛 {x.made}개 · 놓친 슛 {found - x.made}개{make !== null && attempt !== null && (make !== x.made || attempt !== found) ? ` (홈코트 화면에는 ${attempt}개 중 ${make}개 — 겹친 점 때문에 조금 다를 수 있어요)` : make !== null ? ' (홈코트 화면 숫자와 같아요)' : ''}
                {x.zones ? ' · 구역 화면 숫자도 붙였어요' : ''}
              </p>
              <div className="st-row">
                <label className="sh-date">
                  날짜
                  <input className="st-input" type="date" value={x.date} max={today} onChange={(e) => setDates({ ...dates, [x.i]: e.target.value })} />
                </label>
                {x.secs && <span className="st-muted sm">걸린 시간 {minutesText(Math.round(x.secs / 60))}</span>}
                <label className="st-toggle">
                  <input type="checkbox" checked={!off} onChange={(e) => setSkip({ ...skip, [x.i]: !e.target.checked })} /> 넣기{x.dup ? ' (이미 넣은 것 같아요)' : ''}
                </label>
              </div>
            </div>
          );
        })}
      {!busy && sessions.length > 0 && (
        <div className="st-row end">
          <button className="btn btn-primary" onClick={save}>
            {sessions.filter((x) => !(skip[x.i] ?? x.dup)).length}번 넣기
          </button>
        </div>
      )}
      {!busy && reads.length > 0 && !sessions.length && <p className="st-muted">점이 찍힌 슛 차트 화면이 있어야 넣을 수 있어요. (구역 % 화면만으로는 위치를 알 수 없어요)</p>}
    </Sheet>
  );
}

/** 약한 구역에 맞는 연습 (농구 연습의 드릴 목록에서) */
function DrillTips({ zone }: { zone: ZoneKey }) {
  const area: DrillArea = { paint: 'finish', mid: 'shoot', three: 'three' }[kindOf(zone)] as DrillArea;
  const list = DRILLS.filter((x) => x.area === area).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="sh-tips">
      <small className="st-muted">{AREA_NAME[area]} 연습 추천</small>
      {list.map((x) => (
        <details key={x.id}>
          <summary>
            <b>{x.name}</b>{' '}
            <small className="st-muted">
              {x.minutes}분 · {x.reps}
            </small>
          </summary>
          <ol>
            {x.steps.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </details>
      ))}
      <button className="st-link" onClick={() => go('/basketball/drills')}>
        농구 연습에서 오늘 연습 짜기 ›
      </button>
    </div>
  );
}

/** 슛 목표: 야투 · 2점 · 3점 성공률 목표와 지금(고른 기간) */
function ShotGoals({ r }: { r: ReturnType<typeof report> }) {
  const d = useStudy();
  const goals = d.settings.shotGoals ?? {};
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ fg: String(goals.fg ?? ''), two: String(goals.two ?? ''), three: String(goals.three ?? '') });
  const rows = (
    [
      ['fg', '야투', r.total],
      ['two', '2점', r.two],
      ['three', '3점', r.three],
    ] as const
  ).filter(([k]) => goals[k]);
  const save = () => {
    const n = (x: string) => (Number(x) >= 1 && Number(x) <= 100 ? Math.round(Number(x)) : undefined);
    setSettings({ shotGoals: { fg: n(v.fg), two: n(v.two), three: n(v.three) } });
    setEdit(false);
    toast('슛 목표를 정했어요');
  };
  return (
    <section className="st-card">
      <div className="sh-head">
        <h3 className="st-h">슛 목표</h3>
        <button className="st-link" onClick={() => setEdit(!edit)}>
          {edit ? '닫기' : rows.length ? '고치기' : '정하기'}
        </button>
      </div>
      {edit ? (
        <div className="sh-goal-edit">
          {(
            [
              ['fg', '야투'],
              ['two', '2점'],
              ['three', '3점'],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <input className="st-input xs" inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="%" aria-label={`${label} 목표 %`} />%
            </label>
          ))}
          <button className="btn btn-sm btn-primary" onClick={save}>
            저장
          </button>
        </div>
      ) : !rows.length ? (
        <p className="st-muted sm">예: 3점 40% · 야투 50%처럼 목표를 정하면 지금 얼마나 왔는지 보여 줘요.</p>
      ) : (
        <div className="sh-dist">
          {rows.map(([k, label, l]) => {
            const now = pct(l);
            const goal = goals[k]!;
            return (
              <div key={k} className={`sh-dist-row ${now >= goal ? 'done' : ''}`}>
                <span>
                  {label} {goal}%
                </span>
                <div className="sh-bar">
                  <i style={{ width: `${Math.min(100, (now / goal) * 100)}%` }} />
                </div>
                <small>{l.a ? (now >= goal ? `지금 ${Math.round(now)}% · 목표 달성! 🎉` : `지금 ${Math.round(now)}% · ${Math.ceil(goal - now)}%p 남음`) : '아직 이 슛 기록이 없어요'}</small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** NBA 선수와 비교: 이번 시즌 경기 기록(Highlightly)의 야투 · 3점 성공률 */
const PICKS = ['Stephen Curry', 'Luka Doncic', 'Shai Gilgeous-Alexander', 'Nikola Jokic', 'LeBron James'];
function NbaCompare({ r }: { r: ReturnType<typeof report> }) {
  const [name, setName] = useState('');
  const [who, setWho] = useState('');
  const [avg, setAvg] = useState<NbaAverage | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const now = new Date(Date.now() - 5 * 3600_000);
  const season = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const look = (n: string) => {
    if (!n.trim()) return;
    setWho(n.trim());
    setAvg(undefined);
    setErr('');
    nbaAvg({ id: 0, name: n.trim(), season, src: 'bdl' })
      .then((x) => setAvg(x.avg))
      .catch((e) => setErr(e instanceof Error ? e.message : '기록을 받지 못했어요'));
  };
  const rows: [string, number, number][] = avg
    ? [
        ['야투', pct(r.total), avg.fgPct <= 1 ? avg.fgPct * 100 : avg.fgPct],
        ['3점', pct(r.three), avg.fg3Pct <= 1 ? avg.fg3Pct * 100 : avg.fg3Pct],
      ]
    : [];
  return (
    <section className="st-card">
      <h3 className="st-h">NBA 선수와 비교</h3>
      <form
        className="st-inline"
        onSubmit={(e) => {
          e.preventDefault();
          look(name);
        }}
      >
        <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="선수 이름 (영어)" aria-label="NBA 선수 이름" />
        <button className="btn btn-sm btn-primary">비교</button>
      </form>
      <div className="st-chips">
        {PICKS.map((p) => (
          <button key={p} className={`st-chip ${who === p ? 'on' : ''}`} onClick={() => (setName(p), look(p))}>
            {p}
          </button>
        ))}
      </div>
      {who && err && <p className="st-muted sm">{err}</p>}
      {who && !err && avg === undefined && <p className="st-muted sm">{who} 기록을 받는 중…</p>}
      {who && avg === null && <p className="st-muted sm">{who}의 이번 시즌 기록을 찾지 못했어요.</p>}
      {avg && (
        <>
          <div className="sh-vs">
            {rows.map(([label, me, him]) => (
              <div key={label}>
                <small>{label}</small>
                <div className="sh-vs-row">
                  <span>나</span>
                  <div className="sh-bar">
                    <i style={{ width: `${me}%` }} />
                  </div>
                  <b>{Math.round(me)}%</b>
                </div>
                <div className="sh-vs-row nba">
                  <span>{who.split(' ').pop()}</span>
                  <div className="sh-bar">
                    <i style={{ width: `${him}%` }} />
                  </div>
                  <b>{him.toFixed(1)}%</b>
                </div>
              </div>
            ))}
          </div>
          <p className="st-muted sm">
            {who}: {season}-{String(season + 1).slice(2)} 시즌 {avg.gp}경기 평균 {avg.pts.toFixed(1)}점 (실제 경기 기록 · 수비가 있는 경기라 연습 기록과 그대로 비교하긴 어려워요)
          </p>
        </>
      )}
    </section>
  );
}
