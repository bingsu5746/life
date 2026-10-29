// 농구: 경기 기록(득점·리바운드·어시스트·슛 성공률)과 연습(슈팅 수). 운동 기록(workouts)에 「농구」로 함께 저장해 이번 주 운동에도 센다
import { useState } from 'react';
import { LineChart } from '../study/charts';
import { shortDate } from '../study/dates';
import { alive, newId, type BasketballStat, type PracticeItem, type Workout } from '../study/model';
import { DRILLS, guessKind, practiceTotals } from './drills';
import { put, remove, useStudy } from '../study/store';
import { minutesText } from '../study/timer';
import { BbGoals, ShotSummary } from './ShotCounter';
import { confirmDelete, Empty, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';

const md = (x: string) => shortDate(x).replace(/\(.\)/, '');
const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 1000) / 10}%` : '—');
const RESULT = { win: '승', lose: '패', draw: '무' } as const;

/** 여러 기록의 합 */
export function bbTotals(list: BasketballStat[]) {
  const sum = (k: keyof BasketballStat) => list.reduce((a, x) => a + ((x[k] as number | undefined) ?? 0), 0);
  return { fgm: sum('fgm'), fga: sum('fga'), tpm: sum('tpm'), tpa: sum('tpa'), ftm: sum('ftm'), fta: sum('fta'), pts: sum('pts'), reb: sum('reb'), ast: sum('ast') };
}

/** 슛으로 계산한 득점 (2점 × 2 + 3점 × 3 + 자유투) */
export const ptsFromShots = (b: BasketballStat) => (b.fgm ?? 0) * 2 + (b.tpm ?? 0) * 3 + (b.ftm ?? 0);

export function Basketball({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const [edit, setEdit] = useState<Workout | 'new' | null>(sub === 'new' ? 'new' : null);
  const all = alive(d.workouts)
    .filter((w) => w.kind === '농구')
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const games = all.filter((w) => w.bb?.mode === 'game');
  const stats = all.map((w) => w.bb).filter((x): x is BasketballStat => !!x);
  const t = bbTotals(stats);
  const g = bbTotals(games.map((w) => w.bb!));
  const wins = games.filter((w) => w.bb?.result === 'win').length;
  const losses = games.filter((w) => w.bb?.result === 'lose').length;
  const n = games.length || 1;
  const chrono = [...games].reverse().slice(-20);
  const close = () => {
    setEdit(null);
    if (sub) go('/fitness/basketball');
  };
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>농구</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
          <Icon name="plus" /> 농구 기록
        </button>
      </div>
      {!all.length ? (
        <Empty title="농구 기록을 넣어 보세요">
          <p>경기에서 넣은 점수·리바운드·어시스트와 슛 성공 수를 적으면 평균과 성공률, 점수 흐름을 보여 드려요. 연습은 슈팅 몇 개 중 몇 개 넣었는지만 적어도 돼요.</p>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            처음 적기
          </button>
        </Empty>
      ) : (
        <>
          <BbGoals />
          <ShotSummary />
          <section className="st-card">
            <h3 className="st-h">
              경기 {games.length}번{games.length ? ` · ${wins}승 ${losses}패` : ''}
            </h3>
            <div className="st-stat-row bb-stats">
              <div>
                <small>평균 득점</small>
                <b>{games.length ? Math.round((g.pts / n) * 10) / 10 : '—'}</b>
              </div>
              <div>
                <small>평균 리바운드</small>
                <b>{games.length ? Math.round((g.reb / n) * 10) / 10 : '—'}</b>
              </div>
              <div>
                <small>평균 어시스트</small>
                <b>{games.length ? Math.round((g.ast / n) * 10) / 10 : '—'}</b>
              </div>
            </div>
            {chrono.length > 1 && <LineChart label="경기별 득점" height={150} points={chrono.map((w) => ({ label: md(w.date), title: shortDate(w.date), y: w.bb?.pts ?? null }))} format={(x) => `${Math.round(x)}`} />}
          </section>
          <section className="st-card">
            <h3 className="st-h">슛 성공률 (경기 + 연습)</h3>
            <div className="st-stat-row">
              <div>
                <small>2점슛</small>
                <b>{pct(t.fgm, t.fga)}</b>
                <small>
                  {t.fgm}/{t.fga}
                </small>
              </div>
              <div>
                <small>3점슛</small>
                <b>{pct(t.tpm, t.tpa)}</b>
                <small>
                  {t.tpm}/{t.tpa}
                </small>
              </div>
              <div>
                <small>자유투</small>
                <b>{pct(t.ftm, t.fta)}</b>
                <small>
                  {t.ftm}/{t.fta}
                </small>
              </div>
            </div>
          </section>
          <section className="st-card">
            <h3 className="st-h">기록</h3>
            {all.slice(0, 40).map((w) => (
              <div key={w.id} className="st-item st-tap" {...tap(() => setEdit(w))}>
                <small className="st-muted nowrap">{shortDate(w.date)}</small>
                <div className="st-item-main">
                  <div className="st-item-title">
                    {w.bb?.mode === 'game' ? '경기' : '연습'}
                    {w.bb?.result ? ` · ${RESULT[w.bb.result]}` : ''}
                    {w.bb?.pts !== undefined ? ` · ${w.bb.pts}점` : ''}
                    {w.minutes ? ` · ${minutesText(w.minutes)}` : ''}
                  </div>
                  <div className="st-item-sub">
                    {[
                      w.bb?.items?.length ? w.bb.items.map((i) => (i.att ? `${i.name} ${i.made ?? 0}/${i.att}` : i.name)).join(', ') : '',
                      w.bb?.reb !== undefined && `리바운드 ${w.bb.reb}`,
                      w.bb?.ast !== undefined && `어시스트 ${w.bb.ast}`,
                      !w.bb?.items?.length && w.bb?.fga ? `2점 ${w.bb.fgm ?? 0}/${w.bb.fga}` : '',
                      !w.bb?.items?.length && w.bb?.tpa ? `3점 ${w.bb.tpm ?? 0}/${w.bb.tpa}` : '',
                      !w.bb?.items?.length && w.bb?.fta ? `자유투 ${w.bb.ftm ?? 0}/${w.bb.fta}` : '',
                      w.memo,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      {edit && <BbSheet item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
    </div>
  );
}

function BbSheet({ item, today, onClose }: { item?: Workout; today: string; onClose: () => void }) {
  const b = item?.bb;
  const [mode, setMode] = useState<BasketballStat['mode']>(b?.mode ?? 'game');
  const [date, setDate] = useState(item?.date ?? today);
  const [minutes, setMinutes] = useState(item?.minutes?.toString() ?? '60');
  const [result, setResult] = useState<BasketballStat['result']>(b?.result);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries((['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta'] as const).map((k) => [k, b?.[k]?.toString() ?? ''])));
  const [memo, setMemo] = useState(item?.memo ?? '');
  // 연습: 무엇을 · 몇 개 중 몇 개 (예전 기록은 슛 칸을 항목으로 바꿔 보여 준다)
  type Row = { name: string; kind?: 'fg' | 'tp' | 'ft'; made: string; att: string };
  const [rows, setRows] = useState<Row[]>(() => {
    if (b?.items?.length) return b.items.map((i) => ({ name: i.name, kind: i.kind, made: i.made?.toString() ?? '', att: i.att?.toString() ?? '' }));
    const old: Row[] = [];
    if (b?.mode === 'practice') {
      if (b.fga) old.push({ name: '2점슛', kind: 'fg', made: String(b.fgm ?? 0), att: String(b.fga) });
      if (b.tpa) old.push({ name: '3점슛', kind: 'tp', made: String(b.tpm ?? 0), att: String(b.tpa) });
      if (b.fta) old.push({ name: '자유투', kind: 'ft', made: String(b.ftm ?? 0), att: String(b.fta) });
    }
    return old.length ? old : [{ name: '', made: '', att: '' }];
  });
  const items: PracticeItem[] = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), kind: r.kind, made: r.made ? Number(r.made) : undefined, att: r.att ? Number(r.att) : undefined }));
  const rowBad = rows.some((r) => r.made && r.att && Number(r.made) > Number(r.att));
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const num = (k: string) => (v[k].trim() ? Math.min(500, Math.max(0, Math.round(Number(v[k])))) : undefined);
  const bad = mode === 'practice' ? rowBad : (['fg', 'tp', 'ft'] as const).some((p) => (num(`${p}m`) ?? 0) > (num(`${p}a`) ?? Infinity));
  const shots: BasketballStat = { mode, fgm: num('fgm'), fga: num('fga'), tpm: num('tpm'), tpa: num('tpa'), ftm: num('ftm'), fta: num('fta') };
  const field = (k: string, label: string) => (
    <label className="st-cond-time">
      {label}
      <input className="st-input xs" inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label={label} />
    </label>
  );
  const shot = (p: string, label: string) => (
    <div className="bb-shot">
      <span>{label}</span>
      <input className="st-input xs" inputMode="numeric" value={v[`${p}m`]} onChange={(e) => setV({ ...v, [`${p}m`]: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label={`${label} 넣은 수`} placeholder="넣은" />
      /
      <input className="st-input xs" inputMode="numeric" value={v[`${p}a`]} onChange={(e) => setV({ ...v, [`${p}a`]: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label={`${label} 던진 수`} placeholder="던진" />
    </div>
  );
  function save() {
    if (bad || !date) return;
    const m = Number(minutes);
    const pts = num('pts') ?? (mode === 'game' && ptsFromShots(shots) > 0 ? ptsFromShots(shots) : undefined);
    const tot = practiceTotals(items);
    const pr = (n: number) => (n > 0 ? n : undefined);
    const bb: BasketballStat = {
      ...(mode === 'practice' ? { mode, fgm: pr(tot.fga) && tot.fgm, fga: pr(tot.fga), tpm: pr(tot.tpa) && tot.tpm, tpa: pr(tot.tpa), ftm: pr(tot.fta) && tot.ftm, fta: pr(tot.fta), items: items.length ? items : undefined } : shots),
      result: mode === 'game' ? result : undefined,
      pts: mode === 'game' ? pts : undefined,
      reb: mode === 'game' ? num('reb') : undefined,
      ast: mode === 'game' ? num('ast') : undefined,
      stl: mode === 'game' ? num('stl') : undefined,
      blk: mode === 'game' ? num('blk') : undefined,
    };
    put('workouts', { ...(item ?? { created: Date.now() }), id: item?.id ?? newId(), date, kind: '농구', minutes: m > 0 && m <= 1440 ? Math.round(m) : undefined, memo: memo.trim() || undefined, bb } as Workout);
    toast(item ? '고쳤어요' : '농구 기록을 넣었어요');
    onClose();
  }
  return (
    <Sheet title={item ? '농구 기록 고치기' : '농구 기록'} onClose={onClose}>
      <div className="st-form">
        <div className="st-seg">
          <button type="button" className={mode === 'game' ? 'on' : ''} aria-pressed={mode === 'game'} onClick={() => setMode('game')}>
            경기
          </button>
          <button type="button" className={mode === 'practice' ? 'on' : ''} aria-pressed={mode === 'practice'} onClick={() => setMode('practice')}>
            연습
          </button>
        </div>
        <div className="st-inline wrap">
          <label className="st-cond-time">
            날짜
            <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="st-cond-time">
            시간(분)
            <input className="st-input xs" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
        </div>
        {mode === 'game' && (
          <>
            <div className="st-seg" aria-label="결과">
              {(['win', 'lose', 'draw'] as const).map((r) => (
                <button key={r} type="button" className={result === r ? 'on' : ''} aria-pressed={result === r} onClick={() => setResult(result === r ? undefined : r)}>
                  {RESULT[r]}
                </button>
              ))}
            </div>
            <div className="st-inline wrap">
              {field('pts', '득점')}
              {field('reb', '리바운드')}
              {field('ast', '어시스트')}
              {field('stl', '스틸')}
              {field('blk', '블록')}
            </div>
          </>
        )}
        {mode === 'game' ? (
          <div className="bb-shots">
            {shot('fg', '2점슛')}
            {shot('tp', '3점슛')}
            {shot('ft', '자유투')}
          </div>
        ) : (
          <div className="bb-items">
            <datalist id="bb-drills">
              {['2점슛', '3점슛', '자유투', '레이업', ...DRILLS.map((x) => x.name)].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {rows.map((r, i) => (
              <div key={i} className="bb-item">
                <input
                  className="st-input"
                  list="bb-drills"
                  value={r.name}
                  onChange={(e) => setRow(i, { name: e.target.value, kind: r.kind ?? guessKind(e.target.value) })}
                  onBlur={() => !r.kind && setRow(i, { kind: guessKind(r.name) })}
                  placeholder="무엇을 연습했나 (예: 자유투)"
                  aria-label="연습한 것"
                />
                <div className="bb-item-nums">
                  <input className="st-input xs" inputMode="numeric" value={r.made} onChange={(e) => setRow(i, { made: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="성공" aria-label={`${r.name || '연습'} 성공 수`} />
                  /
                  <input className="st-input xs" inputMode="numeric" value={r.att} onChange={(e) => setRow(i, { att: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="시도" aria-label={`${r.name || '연습'} 시도 수`} />
                  <select className="st-input xs" value={r.kind ?? ''} onChange={(e) => setRow(i, { kind: (e.target.value || undefined) as Row['kind'] })} aria-label="어느 슛으로 셀지">
                    <option value="">슛 아님</option>
                    <option value="fg">2점</option>
                    <option value="tp">3점</option>
                    <option value="ft">자유투</option>
                  </select>
                  {rows.length > 1 && (
                    <button type="button" className="st-x" aria-label="이 연습 빼기" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="st-link" onClick={() => setRows([...rows, { name: '', made: '', att: '' }])}>
              ＋ 연습 더 넣기
            </button>
          </div>
        )}
        {bad && <p className="bad">넣은 수가 던진 수보다 많아요.</p>}
        {mode === 'game' && !v.pts.trim() && ptsFromShots(shots) > 0 && <p className="st-hint">득점을 비우면 슛으로 계산한 {ptsFromShots(shots)}점으로 적어요.</p>}
        <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (예: 3대3, 왼손 레이업 연습)" aria-label="메모" />
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete('이 농구 기록') && (remove('workouts', item.id), onClose())}>
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={bad || !date} onClick={save}>
            {item ? '저장' : '넣기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
