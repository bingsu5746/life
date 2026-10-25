// 사진에서 형광펜으로 칠한 영어 낱말만 골라 읽기 (브라우저 안에서만: 사진은 어디에도 올리지 않는다).
// 1) 글자 인식(tesseract)으로 낱말과 그 자리(네모)를 얻고
// 2) 그 네모 안의 바탕이 형광펜 색(밝고 색이 진함)인지 원래 사진의 색으로 본다.
import type { OcrProgress } from './ocr';
import { OCR_PATHS } from './ocr';

/** 형광펜 색: 밝고(V) 색이 진한(S) 칸. 글자(어두움)와 흰 종이(색 없음)는 빠진다 */
export function isHighlight(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max ? (max - min) / max : 0;
  return v > 0.55 && s > 0.22;
}

/** 어두운 칸 (글자) */
const isInk = (r: number, g: number, b: number) => Math.max(r, g, b) < 110;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 네모 안에서 글자를 뺀 바탕 중 형광펜 색의 비율 (0~1) */
export function highlightRatio(data: Uint8ClampedArray, width: number, height: number, box: Box): number {
  let hit = 0;
  let all = 0;
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(width - 1, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0));
  const y1 = Math.min(height - 1, Math.ceil(box.y1));
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 12));
  for (let y = y0; y <= y1; y += step)
    for (let x = x0; x <= x1; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isInk(r, g, b)) continue;
      all++;
      if (isHighlight(r, g, b)) hit++;
    }
  return all ? hit / all : 0;
}

/** 낱말 앞뒤의 문장 부호를 떼고, 영어 낱말이 아니면 '' */
export function cleanWord(t: string): string {
  const w = t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').replace(/[’‘]/g, "'");
  return /^[A-Za-z][A-Za-z'-]*$/.test(w) && w.length >= 2 ? w : '';
}

/**
 * 줄마다 칠한 낱말을 모은다. 한 줄에서 이어서 칠한 낱말은 한 덩어리(숙어)로 (예: take part in).
 * 대소문자만 다른 것은 하나로. 문장 첫 글자만 대문자인 것은 소문자로.
 */
export function pickHighlighted(lines: { text: string; ratio: number }[][], min = 0.45): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (parts: string[]) => {
    if (!parts.length || parts.length > 5) return;
    let t = parts.join(' ');
    if (/^[A-Z][a-z'-]+$/.test(parts[0])) t = t[0].toLowerCase() + t.slice(1);
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  };
  for (const words of lines) {
    let run: string[] = [];
    for (const w of words) {
      const c = cleanWord(w.text);
      if (w.ratio >= min && c) run.push(c);
      else {
        push(run);
        run = [];
      }
    }
    push(run);
  }
  return out;
}

async function loadCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  // 글자가 작게 찍혀도 읽히게 키우고, 너무 큰 사진은 줄인다
  const scale = Math.min(3, 2000 / bmp.width, 4000 / bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

interface OcrWord {
  text: string;
  bbox: Box;
}
interface OcrBlock {
  paragraphs: { lines: { words: OcrWord[] }[] }[];
}

/** 사진들 → 칠한 낱말들 */
export async function readHighlightedWords(files: Blob[], onProgress?: OcrProgress): Promise<{ words: string[]; seen: number }> {
  const { createWorker } = await import('tesseract.js');
  let cur = 0;
  const worker = await createWorker('eng', 1, { ...OCR_PATHS, logger: (m: { status: string; progress: number }) => onProgress?.(`사진 ${cur + 1}/${files.length} ${m.status}`, m.progress ?? 0) });
  const lines: { text: string; ratio: number }[][] = [];
  let seen = 0;
  try {
    for (const [i, f] of files.entries()) {
      cur = i;
      const color = await loadCanvas(f);
      const { data: px, width, height } = color.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, color.width, color.height);
      // 글자 인식은 흑백·대비를 높인 그림으로 (형광펜 바탕이 글자 인식을 방해하지 않게)
      const gray = document.createElement('canvas');
      gray.width = width;
      gray.height = height;
      const gx = gray.getContext('2d')!;
      gx.filter = 'grayscale(1) contrast(1.4)';
      gx.drawImage(color, 0, 0);
      const r = await worker.recognize(gray, {}, { blocks: true, text: false });
      for (const b of (r.data.blocks ?? []) as unknown as OcrBlock[])
        for (const p of b.paragraphs)
          for (const l of p.lines) {
            seen += l.words.length;
            lines.push(l.words.map((w) => ({ text: w.text, ratio: highlightRatio(px, width, height, w.bbox) })));
          }
    }
  } finally {
    await worker.terminate();
  }
  return { words: pickHighlighted(lines), seen };
}
