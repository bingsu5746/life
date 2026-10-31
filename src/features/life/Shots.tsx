// 슛 분석 화면 + 홈코트 사진 넣기. 슛 위치는 기기에서 사진 색으로 찾고(homecourt.ts), 숫자는 서버 AI 가 읽는다
import { useMemo, useState } from 'react';
import { bbScan, type HcRead } from '../auth/api';
import { LineChart } from '../study/charts';
import { addDays, shortDate } from '../study/dates';
import { newId, type Workout } from '../study/model';
import { put, remove, useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { confirmDelete, Empty, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { findCard, findShots, ZONES, type Img } from './homecourt';
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
              </section>
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
                        <span>
                          {i === r.byDist.length - 1 ? `${i}m 이상` : `${i}~${i + 1}m`}
                        </span>
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
  const [reads, setReads] = useState<Read[]>([]);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState('');
  const chart = reads.find((r) => r.shots?.length);
  const zonesRead = reads.find((r) => r.read?.kind === 'zones')?.read;
  const all = reads.map((r) => r.read).filter(Boolean) as HcRead[];
  const make = all.find((x) => x.make !== null)?.make ?? null;
  const attempt = all.find((x) => x.attempt !== null)?.attempt ?? null;
  const secs = durationSecs(all.find((x) => x.duration)?.duration);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const list: Read[] = [...files].slice(0, 4).map((f) => ({ name: f.name, status: '읽는 중…' }));
    setReads(list);
    const update = (i: number, p: Partial<Read>) => {
      list[i] = { ...list[i], ...p };
      setReads([...list]);
    };
    await Promise.all(
      [...files].slice(0, 4).map(async (f, i) => {
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
          if (read.when) setDate(whenDate(read.when, today));
        } catch (e) {
          update(i, { status: '읽지 못했어요', error: e instanceof Error ? e.message : String(e) });
        }
      }),
    );
    setBusy(false);
  };

  const save = () => {
    if (!chart?.shots) return;
    const shots = chart.shots;
    const m = shots.filter((s) => s[2]).length;
    const r = report(shots);
    const hcPct = zonesRead ?? chart.read;
    put('workouts', {
      id: newId(),
      created: Date.now(),
      date,
      kind: '농구',
      minutes: secs ? Math.max(1, Math.round(secs / 60)) : undefined,
      memo: memo.trim() || undefined,
      bb: {
        mode: 'practice',
        fgm: r.two.m || undefined,
        fga: r.two.a || undefined,
        tpm: r.three.a ? r.three.m : undefined,
        tpa: r.three.a || undefined,
        items: [{ name: '홈코트 슛 연습', made: m, att: shots.length }],
        shots,
        hc: { paint: hcPct?.paint ?? undefined, mid: hcPct?.mid ?? undefined, three: hcPct?.three ?? undefined, secs },
      },
    } as Workout);
    toast('슛 연습을 넣었어요');
    onClose();
  };

  const found = chart?.shots?.length ?? 0;
  const foundMade = chart?.shots?.filter((s) => s[2]).length ?? 0;
  return (
    <Sheet title="홈코트 사진 넣기" onClose={onClose}>
      <p className="st-muted sm">홈코트 앱 운동 결과에서 점이 찍힌 슛 차트 화면을 캡처해서 골라 주세요. 구역 % 화면도 함께 고르면 숫자를 같이 읽어요. 사진은 숫자를 읽는 데만 쓰고 저장하지 않아요.</p>
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
      {busy && <p className="st-muted">사진을 읽는 중… (AI 가 숫자를 읽느라 길면 1~2분 걸릴 수 있어요)</p>}
      {chart?.shots && (
        <>
          <ShotChart shots={chart.shots} />
          <p className="sm">
            찾은 점: 넣은 슛 {foundMade}개 · 놓친 슛 {found - foundMade}개{make !== null && attempt !== null && (make !== foundMade || attempt !== found) ? ` (홈코트 화면에는 ${attempt}개 중 ${make}개 — 겹친 점 때문에 조금 다를 수 있어요)` : make !== null ? ' (홈코트 화면 숫자와 같아요)' : ''}
          </p>
          <div className="st-row">
            <label className="sh-date">
              날짜
              <input className="st-input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            {secs && <span className="st-muted sm">걸린 시간 {minutesText(Math.round(secs / 60))}</span>}
          </div>
          <input className="st-input" placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
          <div className="st-row end">
            <button className="btn btn-primary" onClick={save}>
              넣기
            </button>
          </div>
        </>
      )}
      {!busy && reads.length > 0 && !chart?.shots && <p className="st-muted">점이 찍힌 슛 차트 화면이 있어야 넣을 수 있어요. (구역 % 화면만으로는 위치를 알 수 없어요)</p>}
    </Sheet>
  );
}
