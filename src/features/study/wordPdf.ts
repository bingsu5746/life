// 영단어장 PDF 읽기 (설계 §9.5 ⓪). PDF 는 이 기기 안에서만 읽고, 단어·뜻만 남긴다.
// 글자가 든 PDF: 글자 조각의 위치로 줄·칸·단을 나눈다 (아래 순수 함수, 시험으로 확인).
// 스캔한 PDF(글자 없음): 페이지를 그림으로 그려 글자 인식(tesseract)으로 읽는다.

export interface TextPiece {
  str: string;
  /** 왼쪽 아래 기준 위치 (PDF 좌표: y 는 위로 갈수록 큼) */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Line {
  y: number;
  pieces: TextPiece[];
}

/** 같은 높이의 조각을 한 줄로 (높이 차가 글자 높이의 절반 이내) */
export function groupLines(pieces: TextPiece[]): Line[] {
  const ps = pieces.filter((p) => p.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const p of ps) {
    const tol = Math.max(2, p.h * 0.5);
    const line = lines.find((l) => Math.abs(l.y - p.y) <= tol);
    if (line) line.pieces.push(p);
    else lines.push({ y: p.y, pieces: [p] });
  }
  for (const l of lines) l.pieces.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

/**
 * 두 단(왼쪽 반·오른쪽 반) 쪽인지: 가운데 근처에 어떤 조각도 걸치지 않는 세로 틈이 있고,
 * 그 틈 양쪽에 글자가 있는 줄이 충분히 많으면 그 틈의 x. 아니면 null.
 */
export function findGutter(lines: Line[], pageWidth: number): number | null {
  if (lines.length < 6) return null;
  let best: { x: number; both: number } | null = null;
  for (let x = pageWidth * 0.35; x <= pageWidth * 0.65; x += pageWidth / 100) {
    let crossing = 0;
    let both = 0;
    for (const l of lines) {
      if (l.pieces.some((p) => p.x < x && p.x + p.w > x)) crossing++;
      else if (l.pieces.some((p) => p.x + p.w <= x) && l.pieces.some((p) => p.x >= x)) both++;
    }
    if (crossing <= lines.length * 0.05 && both >= lines.length * 0.4 && (!best || both > best.both)) best = { x, both };
  }
  if (!best) return null;
  // 왼쪽 단 안에 단어/뜻 칸이 있어도, 오른쪽 단도 영어로 시작하는 줄이 있어야 두 단으로 본다
  const rightStarts = lines.filter((l) => {
    const first = l.pieces.find((p) => p.x >= best!.x);
    return first && /^[A-Za-z0-9]/.test(first.str.trim());
  }).length;
  return rightStarts >= lines.length * 0.3 ? best.x : null;
}

/** 한 줄의 조각 → 칸 사이가 넓으면 탭, 좁으면 띄어쓰기 */
function lineText(pieces: TextPiece[]): string {
  let out = '';
  let prev: TextPiece | null = null;
  for (const p of pieces) {
    if (prev) {
      const gap = p.x - (prev.x + prev.w);
      const h = Math.max(prev.h, p.h, 1);
      out += gap > h * 1.2 ? '\t' : gap > h * 0.15 ? ' ' : '';
    }
    out += p.str;
    prev = p;
  }
  return out.replace(/ +/g, ' ').trim();
}

const isSentence = (s: string) => {
  const first = s.split('\t')[0];
  return /^[A-Z][^가-힣]*[.!?]$/.test(first.trim()) && first.trim().split(/\s+/).length >= 4;
};

/**
 * 한 쪽의 조각 → 단어장 글 (단어<탭>뜻 줄, Day 머리줄).
 * - 두 단이면 왼쪽 단을 다 읽고 오른쪽 단.
 * - 영어로 시작하지 않는 줄(뜻이 다음 줄로 넘어간 것)은 앞 줄 뜻에 붙인다.
 * - 영어 예문은 뺀다 (keepSentences 로 남길 수 있음).
 */
export function pageToText(pieces: TextPiece[], pageWidth: number, keepSentences = false): string {
  const lines = groupLines(pieces);
  const gutter = findGutter(lines, pageWidth);
  const columns = gutter === null ? [lines.map((l) => l.pieces)] : [lines.map((l) => l.pieces.filter((p) => p.x + p.w <= gutter)), lines.map((l) => l.pieces.filter((p) => p.x >= gutter))];
  const out: string[] = [];
  for (const col of columns) {
    for (const ps of col) {
      if (!ps.length) continue;
      const t = lineText(ps);
      if (!t) continue;
      if (!keepSentences && isSentence(t)) continue;
      const startsWord = /^(?:[□☐\-•*]\s*)?(?:\d{1,4}\s*[.)]?\s*)?[A-Za-z]/.test(t) || /^(?:day|unit|lesson)\s*\d/i.test(t) || /^\d{1,3}\s*(?:일차|강|과)/.test(t);
      if (!startsWord && out.length && /[가-힣]/.test(t) && !/^\d+$/.test(t)) {
        out[out.length - 1] += (out[out.length - 1].includes('\t') ? ' ' : '\t') + t.replace(/\t/g, ' ');
        continue;
      }
      out.push(t);
    }
  }
  return out.join('\n');
}

// ===== PDF 열기 (브라우저) =====

export interface PdfResult {
  text: string;
  pages: number;
  /** 글자가 없어 글자 인식으로 읽은 쪽 */
  scanned: number[];
}

export type PdfProgress = (msg: string, ratio: number) => void;

export class PdfPasswordError extends Error {}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** PDF 의 쪽 수 (범위 고르기용) */
export async function pdfPageCount(file: File, password?: string): Promise<number> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password });
  try {
    return (await task.promise).numPages;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') throw new PdfPasswordError();
    throw e;
  } finally {
    await task.destroy();
  }
}

export async function readPdf(file: File, opts: { from: number; to: number; password?: string; keepSentences?: boolean; onProgress?: PdfProgress; signal?: AbortSignal }): Promise<PdfResult> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password: opts.password });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    if ((e as { name?: string }).name === 'PasswordException') throw new PdfPasswordError();
    throw e;
  }
  const texts: string[] = [];
  const scanned: number[] = [];
  const from = Math.max(1, opts.from);
  const numPages = doc.numPages;
  const to = Math.min(numPages, opts.to);
  try {
    for (let n = from; n <= to; n++) {
      if (opts.signal?.aborted) break;
      opts.onProgress?.(`${n}쪽 읽는 중`, (n - from) / (to - from + 1));
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        const [, , , d, e, f] = it.transform as number[];
        pieces.push({ str: it.str, x: e, y: f, w: it.width, h: Math.abs(d) || it.height });
      }
      const text = pageToText(pieces, vp.width, opts.keepSentences);
      if (/[A-Za-z]{2,}/.test(text)) {
        texts.push(text);
        continue;
      }
      // 글자가 없는 쪽: 그림으로 그려 글자 인식
      scanned.push(n);
      const scale = Math.min(3, 1800 / vp.width);
      const view = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(view.width);
      canvas.height = Math.round(view.height);
      await page.render({ canvas, viewport: view }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) continue;
      const { readImageText } = await import('../../lib/ocr');
      texts.push(await readImageText(blob, (stage, ratio) => opts.onProgress?.(`${n}쪽 글자 인식 (${stage})`, (n - from + ratio) / (to - from + 1))));
    }
  } finally {
    await task.destroy();
  }
  return { text: texts.join('\n'), pages: numPages, scanned };
}
