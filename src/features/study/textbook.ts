// 교과서 PDF → 시험 범위 쪽 → 백지 복습: 범위 줄에서 쪽 범위를 찾고, 읽은 글을 AI 에 보낼 만큼씩 나눈다
export interface PageRange {
  from: number;
  to: number;
}

/** 범위 줄들에서 쪽 범위 찾기. 「교과서」 가 들어간 줄이 있으면 그 줄만 (학습지 · 문제집 쪽과 섞이지 않게) */
export function scopePages(lines: string[]): PageRange[] {
  const tb = lines.filter((l) => /교과서/.test(l));
  const use = tb.length ? tb : lines;
  const out: PageRange[] = [];
  for (const l of use) {
    // 「12~80쪽」 「p.12-80」 「12쪽 ~ 80쪽」 「12-80p」 「45쪽」
    const re = /(?:p\.?\s*)?(\d{1,3})\s*(?:쪽|p)?\s*(?:[~\-–]\s*(?:p\.?\s*)?(\d{1,3}))?\s*(쪽|p\b|페이지)?/gi;
    for (const m of l.matchAll(re)) {
      const hasMark = /쪽|p|페이지/i.test(m[0]);
      if (!hasMark && !m[2]) continue; // 「1단원」 같은 숫자는 빼기
      if (/단원|장|차시|과/.test(l.slice(m.index! + m[0].length, m.index! + m[0].length + 2))) continue;
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      if (a >= 1 && b >= a && b - a <= 300) out.push({ from: a, to: b });
    }
  }
  // 겹치는 범위 합치기
  out.sort((x, y) => x.from - y.from);
  const merged: PageRange[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }
  return merged;
}

export const pagesText = (rs: PageRange[]) => rs.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}~${r.to}`)).join(', ');

/** 쪽마다 읽은 글 → AI 한 번에 보낼 묶음 (글자 수 max 안, 이어진 쪽끼리) */
export function chunkPages(pages: { page: number; text: string }[], max = 4500): { label: string; text: string }[] {
  const out: { label: string; text: string; from: number; to: number }[] = [];
  for (const p of pages) {
    const t = p.text.replace(/[ \t]+/g, ' ').trim();
    if (t.length < 20) continue;
    const last = out[out.length - 1];
    if (last && last.to === p.page - 1 && last.text.length + t.length <= max) {
      last.text += `\n${t}`;
      last.to = p.page;
    } else out.push({ label: '', text: t.slice(0, max), from: p.page, to: p.page });
  }
  return out.map((x) => ({ label: x.from === x.to ? `${x.from}` : `${x.from}~${x.to}`, text: x.text }));
}
