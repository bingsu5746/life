// 돈: 쓴 것 · 들어온 것, 달마다 합계와 예산, 분류별, 달별 흐름, 모으기 목표
import { useState } from 'react';
import { BarChart } from '../study/charts';
import { shortDate } from '../study/dates';
import { alive, newId, type MoneyTx, type SavingGoal } from '../study/model';
import { put, remove, setSettings, useStudy } from '../study/store';
import { Bar, confirmDelete, Empty, Field, go, Icon, Sheet, tap, toast, useToday } from '../study/ui';
import { budgetView, monthLabel, monthlyOut, monthOf, monthSummary, readWon, saved, shiftMonth, won } from './calc';

const OUT = ['식비', '간식·카페', '교통', '쇼핑', '문화·여가', '교육·책', '통신', '선물', '기타'];
const IN = ['용돈', '알바', '선물', '기타'];

/** sub: 'new' 이면 넣기 창, 'YYYY-MM' 이면 그 달 */
export function Money({ sub }: { sub?: string }) {
  const d = useStudy();
  const today = useToday();
  const month = sub && /^\d{4}-\d{2}$/.test(sub) ? sub : monthOf(today);
  const [edit, setEdit] = useState<MoneyTx | 'new' | null>(sub === 'new' ? 'new' : null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [goal, setGoal] = useState<SavingGoal | 'new' | null>(null);
  const s = monthSummary(d, month);
  const budget = d.settings.monthlyBudget;
  const bv = budget ? budgetView(budget, s.out, month, today) : null;
  const months = monthlyOut(d, today, 6);
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
        <h2>돈</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}>
          <Icon name="plus" /> 쓴 것·받은 것
        </button>
      </div>

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
          <button className="st-link" onClick={() => setBudgetOpen(true)}>
            한 달 예산 정하기
          </button>
        )}
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
                    {won(c.amount)} · {s.out ? Math.round((c.amount / s.out) * 100) : 0}%
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
                      <div className="st-item-sub">{t.category}</div>
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

      {edit && <TxSheet item={edit === 'new' ? undefined : edit} today={today} onClose={close} />}
      {budgetOpen && <BudgetSheet onClose={() => setBudgetOpen(false)} />}
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
        </small>
      </div>
      <Bar value={Math.max(0, Math.min(have, g.target))} max={g.target} label={`${g.name} 모은 정도`} />
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
  const t = readWon(target);
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
              put('savings', { ...(item ?? { deposits: [], created: Date.now() }), id: item?.id ?? newId(), name: name.trim().slice(0, 40), target: t!, due: due || undefined } as SavingGoal);
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
