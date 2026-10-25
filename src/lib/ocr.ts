// 사진에서 글자 읽기 (tesseract.js, 브라우저 안에서만 돌아간다: 사진은 어디에도 올리지 않는다).
// 처음 쓸 때 한국어·영어 글자 인식 자료를 인터넷에서 받는다.

/**
 * 글자 인식 도구를 받는 곳을 판(버전)까지 정해 둔다. public/_headers 의 CSP 가 이 경로만 허락하므로
 * tesseract.js 판을 올리면 두 곳을 함께 고쳐야 한다. (언어 자료는 tesseract.js 가 정한 @tesseract.js-data/<언어>/4.0.0_best_int 에서 받는다)
 */
const CDN = 'https://cdn.jsdelivr.net/npm';
export const OCR_PATHS = {
  workerPath: `${CDN}/tesseract.js@v7.0.0/dist/worker.min.js`,
  corePath: `${CDN}/tesseract.js-core@v7.0.0`,
};

export type OcrProgress = (stage: string, ratio: number) => void;

/** 작은 사진은 키우고 흑백으로: 글자 인식이 훨씬 정확해진다 */
async function prepare(file: Blob): Promise<HTMLCanvasElement | Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(3, Math.max(1, 1800 / bmp.width));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.filter = 'grayscale(1) contrast(1.3)';
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  } catch {
    return file;
  }
}

export async function readImageText(file: Blob, onProgress?: OcrProgress): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const img = await prepare(file);
  const worker = await createWorker(['kor', 'eng'], 1, { ...OCR_PATHS, logger: (m: { status: string; progress: number }) => onProgress?.(m.status, m.progress ?? 0) });
  try {
    return (await worker.recognize(img)).data.text;
  } finally {
    await worker.terminate();
  }
}
