// 위시리스트 › 물건: 사고 싶은 물건(가격 · 주소)을 바로 넣고, 시장에 올려 조각으로 모으기
import { useState } from 'react';
import { alive, newId, type WishItem } from '../study/model';
import { getStudy, put, remove, setSettings, useStudy } from '../study/store';
import { confirmDelete, Field, Sheet, toast } from '../study/ui';
import { piecesOf, TIERS } from './market';

export function WishThings({ adding, onAdded }: { adding: boolean; onAdded: () => void }) {
  const d = useStudy();
  const [edit, setEdit] = useState<WishItem | 'new' | null>(null);
  const things = alive(d.wishes)
    .filter((w) => w.kind === 'thing' && w.status !== 'done')
    .sort((a, b) => b.created - a.created);
  const m = d.settings.market;
  const listed = (w: WishItem) => m?.items.find((x) => x.wishId === w.id);
  const toMarket = (w: WishItem) => {
    const cur = getStudy().settings.market;
    if (!cur) return toast('시장을 먼저 열어 주세요');
    if (!w.won) return toast('가격을 먼저 넣어 주세요');
    const pieces = w.won >= 100_000 ? 10 : w.won >= 30_000 ? 5 : undefined;
    const tier = w.won >= 300_000 ? 3 : w.won >= 150_000 ? 2 : w.won >= 50_000 ? 1 : undefined;
    setSettings({ market: { ...cur, items: [...cur.items, { id: newId(), name: w.title.slice(0, 30), kind: 'thing', price: 0, won: w.won, pieces, tier, wishId: w.id }] } });
    toast(`시장 상점에 올렸어요${pieces ? ` · ${pieces}조각` : ''}${tier ? ` · ${TIERS[tier]} 이상` : ''}`);
  };
  return (
    <section className="st-card">
      <div className="st-inline between">
        <h3 className="st-h">물건</h3>
        <button className="st-link" onClick={() => setEdit('new')}>
          ＋ 넣기
        </button>
      </div>
      {!things.length && <p className="st-muted">사고 싶은 물건을 넣어 두세요.</p>}
      {things.map((w) => {
        const it = listed(w);
        const got = it?.pieces ? piecesOf(m!, it.id) : 0;
        return (
          <div key={w.id} className="gm-row">
            <span className="dg-noimg" />
            <span>
              <b className="st-tap" onClick={() => setEdit(w)}>
                {w.title}
              </b>{' '}
              {w.won ? <small className="st-muted">{w.won.toLocaleString('ko-KR')}원</small> : null}
              {it ? (
                <small className="st-muted"> · 시장에 있음{it.pieces ? ` (${got}/${it.pieces}조각)` : ''}</small>
              ) : (
                <button className="st-link" onClick={() => toMarket(w)}>
                  {' '}
                  시장에 올리기
                </button>
              )}
              {w.link && (
                <a className="st-link" href={w.link} target="_blank" rel="noreferrer">
                  {' '}
                  파는 곳
                </a>
              )}
            </span>
          </div>
        );
      })}
      {(edit || adding) && (
        <ThingSheet
          item={edit && edit !== 'new' ? edit : undefined}
          onClose={() => {
            setEdit(null);
            onAdded();
          }}
        />
      )}
    </section>
  );
}

function ThingSheet({ item, onClose }: { item?: WishItem; onClose: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [won, setWon] = useState(item?.won ? String(item.won) : '');
  const [link, setLink] = useState(item?.link ?? '');
  return (
    <Sheet title={item ? '물건 고치기' : '사고 싶은 물건'} onClose={onClose}>
      <div className="st-form">
        <input className="st-input" autoFocus={!item} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 에어팟 프로" aria-label="이름" />
        <Field label="가격 (원)">
          <input className="st-input sm" inputMode="numeric" value={won} onChange={(e) => setWon(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="파는 곳 주소 (선택)">
          <input className="st-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        </Field>
        <div className="st-row end">
          {item && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('wishes', item.id), onClose())}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!title.trim()}
            onClick={() => {
              put('wishes', { ...(item ?? { created: Date.now(), status: 'want' }), id: item?.id ?? newId(), kind: 'thing', title: title.trim().slice(0, 80), won: Number(won) || undefined, link: /^https?:\/\//.test(link.trim()) ? link.trim() : undefined } as WishItem);
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
