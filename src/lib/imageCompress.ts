// 문제 사진 줄이기: 가로 1400px 넘으면 줄이고 JPEG(화질 80%)로.
// WebP 는 아이패드·아이폰 Safari 가 만들지 못하고, AI 서비스마다 받는지도 달라서 어디서나 되는 JPEG 하나로.
// 아이폰 사진(HEIC)도 브라우저가 읽을 수 있으면 여기서 JPEG 로 바뀐다. 못 읽으면 오류 (원본을 그대로 보내지 않음)
async function decode(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file);
    return { img: bmp, w: bmp.width, h: bmp.height };
  } catch {
    // 일부 Safari 에서는 createImageBitmap 이 못 읽는 사진도 <img> 로는 읽힌다
    const url = URL.createObjectURL(file);
    try {
      const el = new Image();
      el.src = url;
      await el.decode();
      return { img: el, w: el.naturalWidth, h: el.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function compressProblemImage(file: Blob, maxWidth = 1400, quality = 0.8): Promise<Blob> {
  const { img, w, h } = await decode(file);
  if (!w || !h) throw new Error('사진을 읽지 못했어요');
  const scale = w > maxWidth ? maxWidth / w : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality));
  if (!jpg || jpg.type !== 'image/jpeg') throw new Error('사진을 줄이지 못했어요');
  return jpg;
}
