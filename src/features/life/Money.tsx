// 돈: 쓴 것 · 들어온 것, 달마다 합계와 예산, 분류별, 달별 흐름, 모으기 목표
import { useState } from 'react';
import { BarChart } from '../study/charts';
import { shortDate } from '../study/dates';
import { alive, newId, type MoneyRule, type MoneyTx, type SavingGoal } from '../study/model';
import { put, remove, setSettings, useStudy } from '../study/store';
import { Bar, confirmDelete, Empty, Field, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { budgetView, compareMonths, savingPace, weekSpent, monthlyAmount, monthLabel, monthlyOut, monthOf, monthSummary, readWon, saved, shiftMonth, upcomingRules, won } from './calc';
import { WEEKDAYS } from '../study/dates';

const OUT = ['식비', '간식·카페', '교통', '쇼핑', '문화·여가', '교육·책', '통신', '선물', '기타'];
const IN = ['용돈', '알바', '선물', '기타'];

/** sub: 'new' 이면 넣기 창, 'YYYY-MM' 이면 그 달 */
export function Money({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const view: 'month' | 'fixed' | 'saving' = sub === 'fixed' ? 'fixed' : sub === 'saving' ? 'saving' : 'month';
  const month = sub && /^\d{4}-\d{2}$/.test(sub) ? sub : monthOf(today);
  const [edit, setEdit] = useState<MoneyTx | 'new' | null>(sub === 'new' ? 'new' : null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [goal, setGoal] = useState<SavingGoal | 'new' | null>(null);
  const [rule, setRule] = useState<MoneyRule | 'new' | null>(null);
  const rules = alive(d.moneyRules).sort((a, b) => Number(!!a.paused) - Number(!!b.paused) || a.type.localeCompare(b.type) || b.amount - a.amount);
  const fixedOut = rules.filter((r) => !r.paused && r.type === 'out').reduce((a, r) => a + monthlyAmount(r), 0);
  const fixedIn = rules.filter((r) => !r.paused && r.type === 'in').reduce((a, r) => a + monthlyAmount(r), 0);
  const soon = upcomingRules(d, today, 14).slice(0, 6);
  const s = monthSummary(d, month);
  const budget = d.settings.monthlyBudget;
  const bv = budget ? budgetView(budget, s.out, month, today) : null;
  const months = monthlyOut(d, today, 6);
  const cmp = compareMonths(d, month, today);
  const delta = (n: number) => `${n > 0 ? '+' : '−'}${won(Math.abs(n))}`;
  const catMax = Math.max(1, ...s.byCategory.map((x) => x.amount));
  const goals = alive(d.savings).sort((a, b) => Number(!!a.done) - Number(!!b.done) || a.created - b.created);
  const byDate = new Map<string, MoneyTx[]>();
  for (const t of s.tx) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  const close = () => {
    setEdit(null);
    if (sub === 'new') go('/money');
  };
  const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000) / 10}만` : n > 0 ? `${Math.round(n / 1000)}천` : '0');

  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>{view === 'fixed' ? '고정 지출 · 수입' : view === 'saving' ? '모으기' : '돈'}</h2>
        {view === 'month' && (
          <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
            <Icon name="plus" /> 쓴 것·받은 것
          </button>
        )}
      </div>
      {view === 'month' && (
        <>
          <section className="st-card">
            <div className="st-inline between">
              <button className="btn btn-sm" onClick={() => go(`/money/${shiftMonth(month, -1)}`)} aria-label="지난달">
                ‹
              </button>
              <b>{monthLabel(month)}</b>
              <button className="btn btn-sm" disabled={month >= monthOf(today)} onClick={() => go(`/money/${shiftMonth(month, 1)}`)} aria-label="다음 달">
                ›
              </button>
            </div>
            <div className="st-stat-row">
              <div>
                <small>쓴 돈</small>
                <b>{won(s.out)}</b>
              </div>
              <div>
                <small>들어온 돈</small>
                <b>{won(s.in)}</b>
              </div>
              <div>
                <small>남은 돈</small>
                <b className={s.in - s.out < 0 ? 'bad' : ''}>{won(s.in - s.out)}</b>
              </div>
            </div>
            {cmp && (
              <p className={`st-hint ${cmp.diff > 0 ? 'bad' : ''}`}>
                {cmp.partial ? '지난달 같은 날까지보다' : '지난달보다'} {cmp.diff === 0 ? '똑같이 썼어요' : `${won(Math.abs(cmp.diff))} ${cmp.diff > 0 ? '더' : '덜'} 썼어요`}
              </p>
            )}
            {budget ? (
              <>
                <Bar value={Math.min(s.out, budget)} max={budget} label="예산 쓴 정도" />
                <p className={`st-hint ${bv!.left < 0 ? 'bad' : ''}`}>
                  예산 {won(budget)} 중 {bv!.left >= 0 ? `${won(bv!.left)} 남았어요` : `${won(-bv!.left)} 넘었어요`}
                  {bv!.perDay !== null && bv!.left > 0 && ` · 남은 ${bv!.daysLeft}일 동안 하루 ${won(bv!.perDay)}씩 쓸 수 있어요`}{' '}
                  <button className="st-link" onClick={() => setBudgetOpen(true)}>
                    예산 고치기
                  </button>
                </p>
              </>
            ) : (
              <button className="st-link mn-set" onClick={() => setBudgetOpen(true)}>
                한 달 예산 정하기
              </button>
            )}
            {month === monthOf(today) && <WeekLimit today={today} />}
          </section>

          {!alive(d.moneyTx).length ? (
            <Empty icon="💰" title="쓴 돈을 적어 보세요">
              <p>쓴 돈과 받은 용돈·알바비를 적으면 한 달에 어디에 얼마나 썼는지, 예산이 얼마 남았는지 보여 드려요.</p>
              <button className="btn btn-primary" onClick={() => setEdit('new')}>
                처음 적기
              </button>
            </Empty>
          ) : (
            <>
              {s.byCategory.length > 0 && (
                <section className="st-card">
                  <h3 className="st-h">어디에 썼나</h3>
                  {s.byCategory.map((c) => (
                    <div key={c.category} className="st-subj-row">
                      <span>{c.category}</span>
                      <Bar value={c.amount} max={catMax} label={`${c.category} 지출`} />
                      <small>
                        {won(c.amount)} · {s.out ? Math.round((c.amount / s.out) * 100) : 0}%{cmp?.byCategory.find((x) => x.category === c.category) && ` · ${delta(cmp.byCategory.find((x) => x.category === c.category)!.diff)}`}
                      </small>
                    </div>
                  ))}
                </section>
              )}
              <section className="st-card">
                <h3 className="st-h">달별 쓴 돈 (최근 6달)</h3>
                <BarChart label="달별 지출" height={150} bars={months.map((m) => ({ label: `${Number(m.month.slice(5))}월`, title: monthLabel(m.month), value: m.amount, strong: m.month === month }))} format={short} avg={budget} avgLabel="예산" />
              </section>
              <section className="st-card">
                <h3 className="st-h">{monthLabel(month)} 기록</h3>
                {!s.tx.length && <p className="st-hint">이 달에 적은 것이 없어요.</p>}
                {[...byDate.entries()].map(([date, list]) => (
                  <div key={date} className="mn-day">
                    <small className="st-muted">{shortDate(date)}</small>
                    {list.map((t) => (
                      <div key={t.id} className="st-item st-tap" {...tap(() => setEdit(t))}>
                        <div className="st-item-main">
                          <div className="st-item-title">{t.memo || t.category}</div>
                          {(t.memo || t.ruleId) && (
                            <div className="st-item-sub">
                              {t.memo ? t.category : ''}
                              {t.ruleId ? `${t.memo ? ' · ' : ''}고정` : ''}
                            </div>
                          )}
                        </div>
                        <b className={t.type === 'in' ? 'mn-in' : ''}>
                          {t.type === 'in' ? '+' : '−'}
                          {won(t.amount)}
                        </b>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}

      {view === 'fixed' && (
        <section className="st-card">
          <div className="st-inline between">
            <h3 className="st-h">고정 지출 · 수입</h3>
            <button className="st-link" onClick={() => setRule('new')}>
              ＋ 추가
            </button>
          </div>
          {!rules.length ? (
            <p className="st-hint">넷플릭스·통신비처럼 정해진 날마다 나가는 돈, 용돈처럼 들어오는 돈을 넣어 두면 그날 자동으로 적어요.</p>
          ) : (
            <>
              <p className="st-sub">
                한 달에 나가는 돈 약 {won(fixedOut)}
                {fixedIn > 0 && ` · 들어오는 돈 약 ${won(fixedIn)}`}
              </p>
              {rules.map((r) => (
                <div key={r.id} className={`st-item st-tap ${r.paused ? 'mn-paused' : ''}`} {...tap(() => setRule(r))}>
                  <div className="st-item-main">
                    <div className="st-item-title">{r.name}</div>
                    <div className="st-item-sub">
                      {ruleText(r)} · {r.category}
                      {r.paused ? ' · 멈춤' : ''}
                    </div>
                  </div>
                  <b className={r.type === 'in' ? 'mn-in' : ''}>
                    {r.type === 'in' ? '+' : '−'}
                    {won(r.amount)}
                  </b>
                </div>
              ))}
              {soon.length > 0 && <p className="st-hint">다가오는 것: {soon.map((x) => `${shortDate(x.date)} ${x.rule.name}`).join(' · ')}</p>}
            </>
          )}
        </section>
      )}

      {view === 'saving' && (
        <section className="st-card">
          <div className="st-inline between">
            <h3 className="st-h">모으기</h3>
            <button className="st-link" onClick={() => setGoal('new')}>
              ＋ 목표 만들기
            </button>
          </div>
          {!goals.length && <p className="st-hint">사고 싶은 것·여행처럼 모으고 싶은 돈의 목표를 만들어 보세요.</p>}
          {goals.map((g) => (
            <SavingRow key={g.id} g={g} today={today} onEdit={() => setGoal(g)} />
          ))}
        </section>
      )}

      {edit && <TxSheet item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
      {budgetOpen && <BudgetSheet onClose={() => setBudgetOpen(false)} />}
      {rule && <RuleSheet item={rule === 'new' ? undefined : rule} today={today} onClose={() => setRule(null)} />}
      {goal && <GoalSheet item={goal === 'new' ? undefined : goal} onClose={() => setGoal(null)} />}
    </div>
  );
}

function SavingRow({ g, today, onEdit }: { g: SavingGoal; today: string; onEdit: () => void }) {
  const [v, setV] = useState('');
  const have = saved(g);
  const add = (sign: 1 | -1) => {
    const n = readWon(v);
    if (!n) return toast('금액을 숫자로 넣어 주세요');
    put('savings', { ...g, deposits: [...g.deposits, { id: newId(), date: today, amount: sign * n, at: Date.now() }], done: have + sign * n >= g.target ? true : g.done });
    setV('');
    toast(sign > 0 ? `${won(n)} 모았어요` : `${won(n)} 뺐어요`);
  };
  return (
    <div className="mn-goal">
      <div className="st-inline between" {...tap(onEdit)}>
        <b>
          {g.name}
          {g.done && have >= g.target ? ' ✓' : ''}
        </b>
        <small className="st-muted">
          {won(have)} / {won(g.target)}
          {g.due ? ` · ${shortDate(g.due)}까지` : ''}
          {g.autoPct ? ` · 용돈 ${g.autoPct}% 자동` : ''}
        </small>
      </div>
      <Bar value={Math.max(0, Math.min(have, g.target))} max={g.target} label={`${g.name} 모은 정도`} />
      {!g.done && have < g.target && <PaceLine g={g} today={today} />}
      <div className="st-inline">
        <input className="st-input sm" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="금액" aria-label={`${g.name}에 넣을 금액`} />
        <button className="btn btn-sm" onClick={() => add(1)}>
          모으기
        </button>
        <button className="btn btn-sm" onClick={() => add(-1)}>
          빼기
        </button>
      </div>
    </div>
  );
}

function TxSheet({ item, today, onClose }: { item?: MoneyTx; today: string; onClose: () => void }) {
  const [type, setType] = useState<MoneyTx['type']>(item?.type ?? 'out');
  const [amount, setAmount] = useState(item ? item.amount.toLocaleString('ko-KR') : '');
  const [category, setCategory] = useState(item?.category ?? '식비');
  const [date, setDate] = useState(item?.date ?? today);
  const [memo, setMemo] = useState(item?.memo ?? '');
  const cats = type === 'out' ? OUT : IN;
  const n = readWon(amount);
  function save() {
    if (!n || !date) return;
    put('moneyTx', { ...(item ?? { created: Date.now() }), id: item?.id ?? newId(), type, amount: n, category: cats.includes(category) ? category : cats[0], date, memo: memo.trim() || undefined } as MoneyTx);
    toast(item ? '고쳤어요' : `${won(n)} 적었어요`);
    onClose();
  }
  return (
    <Sheet title={item ? '고치기' : '쓴 것·받은 것 적기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-seg">
          <button type="button" className={type === 'out' ? 'on' : ''} aria-pressed={type === 'out'} onClick={() => (setType('out'), setCategory(OUT[0]))}>
            쓴 돈
          </button>
          <button type="button" className={type === 'in' ? 'on' : ''} aria-pressed={type === 'in'} onClick={() => (setType('in'), setCategory(IN[0]))}>
            들어온 돈
          </button>
        </div>
        <div className="st-inline">
          <input
            className="st-input mn-amount"
            inputMode="numeric"
            autoFocus
            value={amount}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
              setAmount(digits ? Number(digits).toLocaleString('ko-KR') : '');
            }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="0"
            aria-label="금액 (원)"
          />
          원
        </div>
        <Field group label="분류">
          <div className="st-chips">
            {cats.map((c) => (
              <button key={c} type="button" className={`st-chip ${category === c ? 'on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </Field>
        <div className="st-inline wrap">
          <input className="st-input sm" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
          <input className="st-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="무엇에 (예: 떡볶이, 버스)" aria-label="메모" />
        </div>
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete('이 기록')) return;
                remove('moneyTx', item.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button className="btn btn-primary" disabled={!n || !date} onClick={save}>
            {item ? '저장' : '적기'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function BudgetSheet({ onClose }: { onClose: () => void }) {
  const d = useStudy();
  const [v, setV] = useState(d.settings.monthlyBudget?.toLocaleString('ko-KR') ?? '');
  return (
    <Sheet title="한 달 예산" onClose={onClose}>
      <div className="st-form">
        <div className="st-inline">
          <input className="st-input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '').slice(0, 10)).toLocaleString('ko-KR') : '')} placeholder="예: 200,000" aria-label="한 달 예산 (원)" />원
        </div>
        <p className="st-hint">비우고 저장하면 예산을 없애요.</p>
        <div className="st-row end">
          <button className="btn btn-primary" onClick={() => (setSettings({ monthlyBudget: readWon(v) || undefined }), onClose())}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function GoalSheet({ item, onClose }: { item?: SavingGoal; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [target, setTarget] = useState(item ? item.target.toLocaleString('ko-KR') : '');
  const [due, setDue] = useState(item?.due ?? '');
  const today = useToday();
  const [pct, setPct] = useState(item?.autoPct ? String(item.autoPct) : '');
  const t = readWon(target);
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <Sheet title={item ? '모으기 목표 고치기' : '모으기 목표 만들기'} onClose={onClose}>
      <div className="st-form">
        <Field label="무엇을 위해">
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 새 이어폰, 수학여행" />
        </Field>
        <div className="st-inline wrap">
          <input className="st-input sm" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '').slice(0, 10)).toLocaleString('ko-KR') : '')} placeholder="목표 금액" aria-label="목표 금액 (원)" />원
          <input className="st-input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="언제까지 (선택)" />
        </div>
        <Field label="용돈 들어오면 저절로 모으기 (선택)">
          <div className="st-inline">
            <input className="st-input xs" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="0" aria-label="모을 비율 (%)" />%
          </div>
          <small className="st-muted">{p ? `「용돈」으로 들어온 돈의 ${p}%를 그날 이 목표에 넣어요${item?.autoSince ? ` (${item.autoSince}부터)` : ' (오늘부터 들어온 용돈)'}.` : '비우면 직접 넣을 때만 모아요.'}</small>
        </Field>
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`「${item.name}」 목표`)) return;
                remove('savings', item.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!name.trim() || !t}
            onClick={() => {
              put('savings', { ...(item ?? { deposits: [], created: Date.now() }), id: item?.id ?? newId(), name: name.trim().slice(0, 40), target: t!, due: due || undefined, autoPct: p || undefined, autoSince: p ? (item?.autoPct ? item.autoSince : today) : undefined } as SavingGoal);
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 「매달 15일」 · 「매주 월요일」 · 「매일」 · 「매년 3월 2일」 */
export function ruleText(r: MoneyRule): string {
  if (r.freq === 'daily') return '매일';
  if (r.freq === 'weekly') return `매주 ${WEEKDAYS[r.day ?? 0]}요일`;
  if (r.freq === 'monthly') return `매달 ${r.day ?? Number(r.start.slice(8))}일`;
  return `매년 ${Number(r.start.slice(5, 7))}월 ${Number(r.start.slice(8))}일`;
}

const FREQ: Record<MoneyRule['freq'], string> = { daily: '매일', weekly: '매주', monthly: '매달', yearly: '매년' };

function RuleSheet({ item, today, onClose }: { item?: MoneyRule; today: string; onClose: () => void }) {
  const [type, setType] = useState<MoneyRule['type']>(item?.type ?? 'out');
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item ? item.amount.toLocaleString('ko-KR') : '');
  const [category, setCategory] = useState(item?.category ?? '문화·여가');
  const [freq, setFreq] = useState<MoneyRule['freq']>(item?.freq ?? 'monthly');
  const [wday, setWday] = useState(item?.freq === 'weekly' ? (item.day ?? 1) : 1);
  const [mday, setMday] = useState(String(item?.freq === 'monthly' ? (item.day ?? 1) : Number(today.slice(8))));
  const [start, setStart] = useState(item?.start ?? today);
  const [end, setEnd] = useState(item?.end ?? '');
  const [paused, setPaused] = useState(!!item?.paused);
  const cats = type === 'out' ? OUT : IN;
  const n = readWon(amount);
  const md = Number(mday);
  const ok = !!name.trim() && !!n && !!start && (freq !== 'monthly' || (md >= 1 && md <= 31)) && (!end || end >= start);
  return (
    <Sheet title={item ? '고정 지출·수입 고치기' : '고정 지출·수입 추가'} onClose={onClose}>
      <div className="st-form">
        <div className="st-seg">
          <button type="button" className={type === 'out' ? 'on' : ''} aria-pressed={type === 'out'} onClick={() => (setType('out'), setCategory('문화·여가'))}>
            나가는 돈
          </button>
          <button type="button" className={type === 'in' ? 'on' : ''} aria-pressed={type === 'in'} onClick={() => (setType('in'), setCategory(IN[0]))}>
            들어오는 돈
          </button>
        </div>
        <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'out' ? '이름 (예: 넷플릭스, 통신비)' : '이름 (예: 용돈)'} aria-label="이름" />
        <div className="st-inline">
          <input
            className="st-input mn-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
              setAmount(digits ? Number(digits).toLocaleString('ko-KR') : '');
            }}
            placeholder="0"
            aria-label="금액 (원)"
          />
          원
        </div>
        <div className="st-chips">
          {cats.map((c) => (
            <button key={c} type="button" className={`st-chip ${category === c ? 'on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <Field group label="언제">
          <div className="st-seg">
            {(Object.keys(FREQ) as MoneyRule['freq'][]).map((f) => (
              <button key={f} type="button" className={freq === f ? 'on' : ''} aria-pressed={freq === f} onClick={() => setFreq(f)}>
                {FREQ[f]}
              </button>
            ))}
          </div>
          {freq === 'weekly' && (
            <div className="st-chips">
              {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                <button key={w} type="button" className={`st-chip ${wday === w ? 'on' : ''}`} aria-pressed={wday === w} onClick={() => setWday(w)}>
                  {WEEKDAYS[w]}
                </button>
              ))}
            </div>
          )}
          {freq === 'monthly' && (
            <div className="st-inline">
              매달
              <input className="st-input xs" inputMode="numeric" value={mday} onChange={(e) => setMday(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="매달 며칠" />일 <small className="st-muted">(31일처럼 없는 날은 그 달 마지막 날)</small>
            </div>
          )}
        </Field>
        <div className="st-inline wrap">
          <label className="st-cond-time">
            {freq === 'yearly' ? '날짜 (매년 이 날)' : '시작하는 날'}
            <input className="st-input sm" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="st-cond-time">
            끝나는 날 (선택)
            <input className="st-input sm" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {item && (
          <label className="st-toggle">
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> 잠시 멈추기 (구독을 쉬는 동안)
          </label>
        )}
        <p className="st-hint">그날이 되면 자동으로 기록에 들어가요. 시작하는 날을 지난날로 정하면 최근 90일 안의 것은 바로 들어가요. 자동으로 들어간 기록을 지우면 다시 생기지 않아요.</p>
        <div className="st-row end">
          {item && (
            <button
              className="btn btn-sm st-danger"
              onClick={() => {
                if (!confirmDelete(`「${item.name}」 고정 ${item.type === 'out' ? '지출' : '수입'}`, '이미 들어간 기록은 그대로 남아요.')) return;
                remove('moneyRules', item.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              put('moneyRules', {
                ...(item ?? { created: Date.now() }),
                id: item?.id ?? newId(),
                name: name.trim().slice(0, 30),
                type,
                amount: n!,
                category: cats.includes(category) ? category : cats[0],
                freq,
                day: freq === 'weekly' ? wday : freq === 'monthly' ? md : undefined,
                start,
                end: end || undefined,
                paused: paused || undefined,
              } as MoneyRule);
              toast(item ? '고쳤어요' : '추가했어요');
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 이번 주 쓴 돈 · 일주일 한도 (넘으면 저녁 알림) */
function WeekLimit({ today }: { today: string }) {
  const d = useStudy();
  const lim = d.settings.weeklyLimit;
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(lim ? lim.toLocaleString('ko-KR') : '');
  const spent = weekSpent(d, today);
  if (edit)
    return (
      <div className="st-inline">
        일주일에
        <input className="st-input sm" inputMode="numeric" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="예: 50,000" aria-label="일주일 한도" />
        원까지
        <button
          className="btn btn-sm btn-primary"
          onClick={() => {
            const n = readWon(v);
            setSettings({ weeklyLimit: n || undefined });
            setEdit(false);
          }}
        >
          저장
        </button>
      </div>
    );
  if (!lim)
    return (
      <button className="st-link mn-set" onClick={() => setEdit(true)}>
        일주일 한도 정하기
      </button>
    );
  return (
    <div className="mn-week">
      <Bar value={Math.min(spent, lim)} max={lim} label="이번 주 한도" />
      <p className={`st-hint ${spent > lim ? 'bad' : ''}`}>
        이번 주 {won(spent)} / 한도 {won(lim)} {spent > lim ? `· ${won(spent - lim)} 넘었어요` : `· ${won(lim - spent)} 남음`}{' '}
        <button className="st-link" onClick={() => setEdit(true)}>
          고치기
        </button>
      </p>
    </div>
  );
}

/** 지금 속도로 언제 다 모으는지 · 마감에 맞추려면 · 더 모으면 며칠 당겨지는지 */
function PaceLine({ g, today }: { g: SavingGoal; today: string }) {
  const p = savingPace(g, today);
  if (!p.perWeek && !p.needPerWeek) return <small className="st-muted">모은 기록이 쌓이면 언제 다 모으는지 알려 드려요</small>;
  return (
    <small className="st-muted mn-pace">
      {p.perWeek ? `한 주에 ${won(p.perWeek)}씩 모으고 있어요 → ${p.eta ? `${shortDate(p.eta)}쯤 다 모아요` : ''}` : '최근 8주 동안 모은 돈이 없어요'}
      {p.needPerWeek !== null && ` · 마감(${shortDate(g.due!)})에 맞추려면 한 주에 ${won(p.needPerWeek)}`}
      {p.faster.length > 0 && ` · 한 주에 ${won(p.faster[0].extra)} 더 모으면 ${p.faster[0].days}일 빨라져요`}
    </small>
  );
}
