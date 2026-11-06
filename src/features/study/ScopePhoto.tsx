// 시험 범위 공지 사진 → AI 가 과목별 범위로 나눠 읽는다 → 확인 · 고쳐서 이 시험 범위에 넣기
import { useRef, useState } from 'react';
import { scopeScan } from '../auth/api';
import { compressProblemImage } from '../../lib/imageCompress';
import { scopeLines, scopeText } from './exams';
import { alive, newId, SUBJECT_COLORS, type Exam, type ExamScope } from './model';
import { put, useStudy } from './store';
import { Sheet, subjectsOf, toast } from './ui';

type Row = { on: boolean; name: string; subjectId: string; date: string; text: string };

/** 사진 속 과목 이름 → 내 과목 (같은 이름 · 앞 두 글자 · 서로 들어 있음) */
function matchSubject(name: string, subs: { id: string; name: string }[]): string {
  const n = name.replace(/\s/g, '');
  return (subs.find((s) => s.name.replace(/\s/g, '') === n) ?? subs.find((s) => n.includes(s.name.replace(/\s/g, '')) || s.name.replace(/\s/g, '').includes(n)) ?? subs.find((s) => s.name.slice(0, 2) === n.slice(0, 2)))?.id ?? '';
}

export function ScopePhotoButton({ exam }: { exam: Exam }) {
  const d = useStudy();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const subs = subjectsOf(d);
  async function read(files: FileList) {
    setBusy(true);
    try {
      const images = await Promise.all(
        [...files].slice(0, 4).map(async (f) => {
          const small = await compressProblemImage(f, 1600, 0.85);
          const data = await new Promise<string>((ok, no) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result).split(',')[1] ?? '');
            r.onerror = () => no(new Error('사진을 읽지 못했어요'));
            r.readAsDataURL(small);
          });
          return { mime: small.type || 'image/jpeg', data };
        }),
      );
      const got = await scopeScan(images, subs.map((s) => s.name));
      if (!got.scopes.length) throw new Error('범위를 찾지 못했어요. 더 밝게 · 가까이 찍어 주세요');
      setRows(got.scopes.map((x) => ({ on: true, name: x.subject, subjectId: matchSubject(x.subject, subs), date: x.date && x.date >= exam.date ? x.date : '', text: x.lines.join('\n') })));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'AI 가 읽지 못했어요');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }
  function save() {
    if (!rows) return;
    let list = [...(exam.scopes ?? [])];
    let n = 0;
    let order = subs.length;
    for (const r of rows) {
      if (!r.on || !r.text.trim()) continue;
      let sid = r.subjectId;
      // 내 과목에 없으면 사진에 적힌 이름으로 만든다
      if (!sid) {
        const same = alive(d.subjects).find((s) => s.name === r.name.trim());
        sid = same?.id ?? newId();
        if (!same) put('subjects', { id: sid, name: r.name.trim().slice(0, 20), color: SUBJECT_COLORS[order % SUBJECT_COLORS.length], order: order++ });
      }
      const had = list.find((x) => x.subjectId === sid);
      // 이미 범위가 있는 과목은 새 줄만 덧붙인다 (체크한 것은 그대로)
      const text = had ? [scopeText(had.lines), ...r.text.split('\n').filter((l) => l.trim() && !had.lines.some((x) => x.text === l.trim()))].join('\n') : r.text;
      const next: ExamScope = { id: had?.id ?? newId(), subjectId: sid, date: r.date && r.date !== exam.date ? r.date : had?.date, lines: scopeLines(text, had?.lines), note: had?.note, at: Date.now() };
      list = had ? list.map((x) => (x.id === had.id ? next : x)) : [...list, next];
      n++;
    }
    put('exams', { ...exam, scopes: list });
    toast(`${n}과목 범위를 넣었어요`);
    setRows(null);
  }
  return (
    <>
      <button className="st-addline" disabled={busy} onClick={() => file.current?.click()}>
        📷 {busy ? 'AI 가 범위 공지를 읽는 중… (10~40초)' : '시험 범위 공지 사진으로 넣기'}
      </button>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && void read(e.target.files)} />
      {rows && (
        <Sheet title="읽은 시험 범위" onClose={() => setRows(null)} wide>
          <div className="st-form">
            <p className="st-hint">사진에 적힌 것만 옮겼어요. 틀린 곳은 고친 뒤 넣어 주세요.</p>
            {rows.map((r, i) => {
              const set = (p: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <div key={i} className={`sp-row ${r.on ? '' : 'off'}`}>
                  <label className="st-inline">
                    <input type="checkbox" checked={r.on} onChange={(e) => set({ on: e.target.checked })} />
                    <b>{r.name}</b>
                  </label>
                  <div className="st-inline wrap">
                    <select className="st-input sm" value={r.subjectId} onChange={(e) => set({ subjectId: e.target.value })} aria-label={`${r.name} 내 과목`}>
                      <option value="">새 과목 「{r.name}」 만들기</option>
                      {subs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <input className="st-input sm" type="date" value={r.date} min={exam.date} onChange={(e) => set({ date: e.target.value })} aria-label={`${r.name} 시험 날`} />
                  </div>
                  <textarea className="st-input" rows={Math.min(8, Math.max(2, r.text.split('\n').length))} value={r.text} onChange={(e) => set({ text: e.target.value })} aria-label={`${r.name} 범위`} />
                </div>
              );
            })}
            <div className="st-row end">
              <button className="btn btn-primary" disabled={!rows.some((r) => r.on && r.text.trim())} onClick={save}>
                {rows.filter((r) => r.on && r.text.trim()).length}과목 범위 넣기
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
