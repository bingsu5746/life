// 국어·영어 지문: 넣기(붙여넣기·사진 글자 읽기) · 헷갈린 점 · 영어는 해석 · 다시 보기
import { useEffect, useState } from 'react';
import { isLoggedIn, translate, wordMeanings } from '../auth/api';
import { addToInbox } from './actions';
import { shortDate } from './dates';
import { alive, newId, type Passage } from './model';
import { chunkText, dueAgain } from './passages';
import { getWords, put, remove, useStudy } from './store';
import { confirmDelete, Empty, Field, go, Icon, Sheet, tap, toast, useToday } from './ui';

type Lang = 'all' | 'ko' | 'en';
const LANG = { ko: '국어', en: '영어' } as const;

export function Passages({ open }: { open?: string }) {
  const d = useStudy();
  const today = useToday();
  const [lang, setLang] = useState<Lang>('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Passage> | null>(open === 'new' ? { lang: 'ko' } : null);
  const all = alive(d.passages).sort((a, b) => b.created - a.created);
  const viewing = open && open !== 'new' ? d.passages[open] : undefined;
  if (viewing && !viewing.deleted) return <PassageView p={viewing} today={today} onEdit={() => setEdit(viewing)} edit={edit} onCloseEdit={() => setEdit(null)} />;
  const list = all.filter((p) => (lang === 'all' || p.lang === lang) && (!q.trim() || `${p.title}\n${p.source ?? ''}\n${p.text}\n${p.note ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const again = all.filter((p) => dueAgain(p, today));
  return (
    <>
      <div className="st-inline between wrap">
        <div className="st-seg sm">
          {(['all', 'ko', 'en'] as Lang[]).map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l === 'all' ? '전체' : LANG[l]} {l === 'all' ? all.length || '' : all.filter((p) => p.lang === l).length || ''}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setEdit({ lang: lang === 'en' ? 'en' : 'ko' })}>
          <Icon name="plus" /> 지문 넣기
        </button>
      </div>
      {again.length > 0 && (
        <section className="st-card">
          <small className="aw-label">다시 볼 지문 · 헷갈림</small>
          {again.slice(0, 5).map((p) => (
            <button key={p.id} className="sr-hit" onClick={() => go(`/review/passage-${p.id}`)}>
              <b>
                <span className="st-pill">{LANG[p.lang]}</span> {p.title}
              </b>
              {p.note && <small>{p.note.split('\n')[0]}</small>}
            </button>
          ))}
        </section>
      )}
      {all.length > 3 && <input className="st-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="지문에서 찾기" aria-label="지문 찾기" />}
      {!all.length ? (
        <Empty title="헷갈리는 지문을 모아 두세요">
          <p>국어·영어(내신) 지문을 붙여 넣거나 사진으로 찍어 글자를 읽어 넣고, 헷갈린 점을 적어 두면 사흘마다 다시 보게 해 드려요.</p>
          <button className="btn btn-primary" onClick={() => setEdit({ lang: 'ko' })}>
            지문 넣기
          </button>
        </Empty>
      ) : (
        <div className="ps-list">
          {list.map((p) => (
            <article key={p.id} className="mv-card st-tap" {...tap(() => go(`/review/passage-${p.id}`))}>
              <div className="mv-top">
                <b>{p.title}</b>
                <span className="st-pill">{LANG[p.lang]}</span>
              </div>
              {p.source && <small className="st-muted">{p.source}</small>}
              <p className="mv-review">{p.text}</p>
              {p.confusing && <small className="ps-flag">헷갈림{p.seen?.length ? ` · ${p.seen.length}번 다시 봄` : ''}</small>}
            </article>
          ))}
          {!list.length && <p className="st-hint">찾는 지문이 없어요.</p>}
        </div>
      )}
      {edit && <PassageSheet item={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function PassageView({ p, today, onEdit, edit, onCloseEdit }: { p: Passage; today: string; onEdit: () => void; edit: Partial<Passage> | null; onCloseEdit: () => void }) {
  const [showTr, setShowTr] = useState(false);
  const seenToday = p.seen?.includes(today);
  return (
    <div className="ps-view">
      <div className="st-inline between">
        <button className="st-back" onClick={() => go('/review/passages')} aria-label="지문 목록">
          ‹
        </button>
        <button className="st-link" onClick={onEdit}>
          고치기
        </button>
      </div>
      <h3 className="ps-title">{p.title}</h3>
      {p.source && <small className="st-muted">{p.source}</small>}
      {p.note && (
        <div className="ps-note">
          <small className="aw-label">헷갈린 점 · 핵심</small>
          <p>{p.note}</p>
        </div>
      )}
      <div className="ps-text" lang={p.lang}>
        {p.text}
      </div>
      {p.lang === 'en' && <WordPick from={p.title} today={today} />}
      {p.lang === 'en' && p.translation && (
        <>
          <button className="st-link" onClick={() => setShowTr(!showTr)}>
            {showTr ? '해석 접기' : '해석 보기'}
          </button>
          {showTr && <div className="ps-text ps-tr">{p.translation}</div>}
        </>
      )}
      <div className="st-row end">
        <button className="st-link" onClick={() => put('passages', { ...p, confusing: !p.confusing })}>
          {p.confusing ? '이제 안 헷갈려요' : '헷갈려요 (다시 보기)'}
        </button>
        <button className="btn btn-primary" disabled={seenToday} onClick={() => (put('passages', { ...p, seen: [...(p.seen ?? []), today] }), toast('다시 본 것으로 적었어요'))}>
          {seenToday ? '오늘 다시 봤어요 ✓' : '다시 봤어요'}
        </button>
      </div>
      {p.seen && p.seen.length > 0 && <small className="st-muted">다시 본 날: {p.seen.slice(-5).map(shortDate).join(', ')}</small>}
      {edit && <PassageSheet item={edit} onClose={onCloseEdit} />}
    </div>
  );
}

function PassageSheet({ item, onClose }: { item: Partial<Passage>; onClose: () => void }) {
  const [lang, setLang] = useState<Passage['lang']>(item.lang ?? 'ko');
  const [title, setTitle] = useState(item.title ?? '');
  const [source, setSource] = useState(item.source ?? '');
  const [text, setText] = useState(item.text ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [tr, setTr] = useState(item.translation ?? '');
  const [confusing, setConfusing] = useState(item.confusing ?? true);
  const [busy, setBusy] = useState<string | null>(null);
  async function ocr(files: FileList) {
    setBusy('사진에서 글자 읽는 중…');
    try {
      const { readImageText } = await import('../../lib/ocr');
      let all = '';
      for (const [i, f] of [...files].entries()) all += (await readImageText(f, (_s, r) => setBusy(`글자 읽는 중 ${i + 1}/${files.length} ${Math.round(r * 100)}%`))).trim() + '\n\n';
      const t = all.replace(/\n{3,}/g, '\n\n').trim();
      if (!t) toast('사진에서 글자를 찾지 못했어요');
      else {
        setText((x) => (x.trim() ? `${x.trim()}\n\n${t}` : t));
        toast('읽은 글을 넣었어요. 틀린 글자는 고쳐 주세요');
      }
    } catch {
      toast('글자를 읽지 못했어요. 인터넷 연결을 확인해 주세요 (처음엔 글자 인식 자료를 받아요)');
    } finally {
      setBusy(null);
    }
  }
  async function makeTr() {
    if (!isLoggedIn()) return toast('해석은 로그인한 뒤에 쓸 수 있어요');
    const parts = chunkText(text);
    let out = '';
    try {
      for (const [i, c] of parts.entries()) {
        setBusy(`해석하는 중 ${i + 1}/${parts.length}`);
        out += (await translate(c, 'ko')).text.trim() + '\n\n';
      }
      setTr(out.trim());
      toast('AI 해석이에요. 틀린 곳이 있을 수 있어 확인해 주세요');
    } catch (e) {
      toast(e instanceof Error ? e.message : '해석하지 못했어요');
    } finally {
      setBusy(null);
    }
  }
  return (
    <Sheet title={item.id ? '지문 고치기' : '지문 넣기'} onClose={onClose}>
      <div className="st-form">
        <div className="st-seg">
          {(['ko', 'en'] as const).map((l) => (
            <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {LANG[l]}
            </button>
          ))}
        </div>
        <input className="st-input" autoFocus={!item.id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={lang === 'ko' ? '예: 고전시가 「관동별곡」' : '예: 3과 본문 Lesson 3'} aria-label="제목" />
        <input className="st-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="출처 (교재·쪽·시험, 선택)" aria-label="출처" />
        <Field label="지문">
          <textarea className="st-input ps-input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="지문을 붙여 넣거나 사진으로 넣어요" aria-label="지문" lang={lang} />
        </Field>
        <label className="st-link ps-photo">
          {busy?.startsWith('글자') || busy?.startsWith('사진') ? busy : '사진으로 글자 읽어 넣기'}
          <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => e.target.files?.length && void ocr(e.target.files)} />
        </label>
        <Field label="헷갈린 점 · 핵심 · 주제">
          <textarea className="st-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 화자의 태도가 바뀌는 부분 / 빈칸 추론에서 헷갈린 문장" aria-label="헷갈린 점" />
        </Field>
        {lang === 'en' && (
          <Field label="해석 (선택)">
            <textarea className="st-input" rows={4} value={tr} onChange={(e) => setTr(e.target.value)} aria-label="해석" />
            {text.trim() && (
              <button type="button" className="st-link" disabled={!!busy} onClick={() => void makeTr()}>
                {busy?.startsWith('해석') ? busy : tr ? 'AI 해석 다시 만들기' : 'AI 해석 넣기'}
              </button>
            )}
          </Field>
        )}
        <label className="st-toggle">
          <input type="checkbox" checked={confusing} onChange={(e) => setConfusing(e.target.checked)} /> 헷갈려요 (사흘마다 다시 보기에 올라와요)
        </label>
        <div className="st-row end">
          {item.id && (
            <button className="btn btn-sm st-danger" onClick={() => confirmDelete(`「${item.title}」`) && (remove('passages', item.id!), onClose(), go('/review/passages'))}>
              지우기
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!title.trim() || !text.trim()}
            onClick={() => {
              const id = item.id ?? newId();
              put('passages', { ...item, id, created: item.created ?? Date.now(), lang, title: title.trim(), source: source.trim() || undefined, text: text.trim(), note: note.trim() || undefined, translation: lang === 'en' ? tr.trim() || undefined : undefined, confusing } as Passage);
              toast('저장했어요');
              onClose();
              if (!item.id) go(`/review/passage-${id}`);
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 영어 지문에서 단어를 길게 눌러 고르면 「모르는 단어 모음」에 넣는 줄이 아래에 뜬다 */
function WordPick({ from, today }: { from: string; today: string }) {
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => {
      const sel = window.getSelection();
      const t = sel?.toString().trim() ?? '';
      const inText = !!sel?.anchorNode && !!(sel.anchorNode.parentElement?.closest('.ps-text'));
      // 영어 낱말 1~4개만 (문장 전체를 고른 것은 무시)
      setTerm(inText && /^[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,3}$/.test(t) ? t.replace(/[’]/g, "'") : '');
    };
    document.addEventListener('selectionchange', on);
    return () => document.removeEventListener('selectionchange', on);
  }, []);
  if (!term) return <small className="st-muted">모르는 단어는 길게 눌러 고르면 단어장에 넣을 수 있어요.</small>;
  return (
    <div className="ps-pick" role="status">
      <b lang="en">{term}</b>
      <button
        className="btn btn-sm btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          let meaning = '';
          if (isLoggedIn())
            try {
              meaning = (await wordMeanings([term])).meanings[0]?.trim() ?? '';
            } catch {
              /* 뜻은 나중에 채워도 된다 */
            }
          addToInbox(term, meaning, getWords(), today, from);
          toast(`「${term}」를 모르는 단어 모음에 넣었어요${meaning ? ` (${meaning})` : ''}`);
          window.getSelection()?.removeAllRanges();
          setTerm('');
          setBusy(false);
        }}
      >
        {busy ? '넣는 중…' : '단어장에 넣기'}
      </button>
    </div>
  );
}
