// 교과서 PDF + 시험 범위(쪽) → AI 가 소단원마다 핵심을 뽑아 백지 복습 카드로
import { useEffect, useState } from 'react';
import { blankScan, isLoggedIn } from '../auth/api';
import { loadSound, saveSound } from '../../lib/soundStore';
import { scopeDate, upcomingExams } from './exams';
import { newId, type BlankSheet } from './model';
import { getStudy, putMany, setSettings, useStudy } from './store';
import { chunkPages, pagesText, scopePages } from './textbook';
import { Field, Sheet, toast, useToday } from './ui';

const MAX_CHUNKS = 15;

export function TextbookBlanks({ onClose }: { onClose: () => void }) {
  const d = useStudy();
  const today = useToday();
  // 다가오는 시험의 과목 범위들
  const scopes = upcomingExams(d, today).flatMap((e) => (e.scopes ?? []).filter((s) => d.subjects[s.subjectId] && !d.subjects[s.subjectId].deleted).map((s) => ({ key: `${e.id}:${s.id}`, exam: e, scope: s, pages: scopePages(s.lines.map((l) => l.text)) })));
  const [pick, setPick] = useState(scopes.find((x) => x.pages.length)?.key ?? scopes[0]?.key ?? '');
  const cur = scopes.find((x) => x.key === pick);
  const sid = cur?.scope.subjectId ?? '';
  const tb = sid ? d.settings.textbooks?.[sid] : undefined;
  const [file, setFile] = useState<Blob | null>(null);
  const [offset, setOffset] = useState(String(tb?.offset ?? 0));
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    setFile(null);
    setPreview('');
    setOffset(String(getStudy().settings.textbooks?.[sid]?.offset ?? 0));
    if (sid) void loadSound(`textbook:${sid}`).then((b) => b && setFile(b)).catch(() => {});
  }, [sid]);
  const off = Math.round(Number(offset) || 0);
  const first = cur?.pages[0]?.from;

  async function check() {
    if (!file || !first) return;
    const { readPdfPages } = await import('./wordPdf');
    const [p] = await readPdfPages(file, first + off, first + off);
    setPreview(p?.text.trim().slice(0, 200) || '이 장에서 글을 찾지 못했어요 (그림으로만 된 PDF 일 수 있어요)');
  }
  async function make() {
    if (!file || !cur || !cur.pages.length) return;
    setBusy('PDF 읽는 중…');
    try {
      const { readPdfPages } = await import('./wordPdf');
      const pages: { page: number; text: string }[] = [];
      for (const r of cur.pages) {
        const got = await readPdfPages(file, r.from + off, r.to + off, (m) => setBusy(m));
        pages.push(...got.map((g) => ({ page: g.page - off, text: g.text })));
      }
      const chunks = chunkPages(pages);
      if (!chunks.length) throw new Error('PDF 에서 글을 찾지 못했어요. 글자가 들어 있는 PDF 인지, 쪽 맞추기가 맞는지 확인해 주세요');
      const name = d.subjects[sid]?.name ?? '';
      const made: BlankSheet[] = [];
      for (const [i, c] of chunks.slice(0, MAX_CHUNKS).entries()) {
        setBusy(`AI 가 핵심을 뽑는 중 ${i + 1}/${Math.min(chunks.length, MAX_CHUNKS)} (${c.label}쪽)`);
        const r = await blankScan(c.text, name, c.label);
        for (const s of r.sheets) made.push({ id: newId(), updatedAt: 0, subjectId: sid, title: `${s.title} (${c.label}쪽)`.slice(0, 60), points: s.points.map((t) => ({ id: newId(), text: t, done: false })), tries: [], box: 0, due: today, wrong: 0, created: Date.now() } as BlankSheet);
      }
      if (!made.length) throw new Error('AI 가 핵심을 뽑지 못했어요');
      putMany(made.map((x) => ({ c: 'blanks' as const, item: x as never })));
      toast(`백지 복습 ${made.length}개를 만들었어요${chunks.length > MAX_CHUNKS ? ` (앞 ${MAX_CHUNKS}묶음까지, 나머지는 다시 만들기)` : ''}`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '만들지 못했어요');
    } finally {
      setBusy('');
    }
  }

  return (
    <Sheet title="교과서로 백지 복습 만들기" onClose={onClose} wide>
      <div className="st-form">
        <p className="st-hint">교과서 PDF 와 시험 범위의 쪽을 보고, AI 가 소단원마다 꼭 외울 핵심을 뽑아 백지 복습 카드로 만들어요. 교과서에 적힌 것만 옮기라고 시키지만, 만든 뒤 한 번 확인해 주세요. PDF 는 이 기기에만 저장돼요.</p>
        {!scopes.length ? (
          <p className="st-hint bad">다가오는 시험에 과목별 시험 범위를 먼저 넣어 주세요 (예: 교과서 12~80쪽).</p>
        ) : (
          <>
            <Field label="시험 범위">
              <select className="st-input" value={pick} onChange={(e) => setPick(e.target.value)}>
                {scopes.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.exam.name} · {d.subjects[x.scope.subjectId]?.name} ({scopeDate(x.exam, x.scope)}) {x.pages.length ? `· ${pagesText(x.pages)}쪽` : '· 쪽 없음'}
                  </option>
                ))}
              </select>
            </Field>
            {cur && !cur.pages.length && <p className="st-hint bad">이 과목 범위 줄에서 쪽을 찾지 못했어요. 범위에 「교과서 12~80쪽」 처럼 쪽을 적어 주세요.</p>}
            <Field label="교과서 PDF" hint={tb && file ? `저장된 파일: ${tb.name}` : '글자가 들어 있는 PDF 여야 해요 (스캔만 한 PDF 는 못 읽어요)'}>
              <input
                type="file"
                accept="application/pdf"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f || !sid) return;
                  setBusy('PDF 저장 중…');
                  try {
                    await saveSound(`textbook:${sid}`, f);
                    setFile(f);
                    setSettings({ textbooks: { ...(getStudy().settings.textbooks ?? {}), [sid]: { name: f.name.slice(0, 80), offset: off } } });
                  } catch {
                    toast('이 기기에 저장하지 못했어요 (저장 공간을 확인해 주세요)');
                  } finally {
                    setBusy('');
                  }
                }}
              />
            </Field>
            <Field label="쪽 맞추기" hint={`교과서 쪽 번호와 PDF 장 번호의 차이예요. 교과서 ${first ?? 1}쪽이 PDF ${(first ?? 1) + off}번째 장이에요. 표지 · 목차 때문에 다르면 고쳐 주세요.`}>
              <div className="st-inline">
                <input
                  className="st-input xs"
                  inputMode="numeric"
                  value={offset}
                  onChange={(e) => {
                    setOffset(e.target.value.replace(/[^\d-]/g, ''));
                    setPreview('');
                  }}
                  onBlur={() => sid && tb && setSettings({ textbooks: { ...(getStudy().settings.textbooks ?? {}), [sid]: { ...tb, offset: off } } })}
                />
                <button type="button" className="btn btn-sm" disabled={!file || !first} onClick={() => void check()}>
                  {first ?? ''}쪽 확인
                </button>
              </div>
            </Field>
            {preview && <p className="st-hint">PDF {first! + off}번째 장 앞부분: {preview}</p>}
            <div className="st-row end">
              <button className="btn btn-primary" disabled={!!busy || !file || !cur?.pages.length || !isLoggedIn()} onClick={() => void make()}>
                {busy || (isLoggedIn() ? '백지 복습 만들기' : '로그인하면 만들 수 있어요')}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
