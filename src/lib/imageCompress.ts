// 문제 사진 줄이기: 가로 1400px 넘으면 줄이고 WebP(화질 80%)로.
// 아이패드·아이폰 Safari 는 캔버스에서 WebP 로 저장하지 못해서(그냥 PNG 가 나옴) 그때는 JPEG(80%)로.
export async function compressProblemImage(file: Blob, maxWidth = 1400, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width > maxWidth ? maxWidth / bmp.width : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bmp, 0, 0, c.width, c.height);
  const as = (type: string) => new Promise<Blob | null>((r) => c.toBlob(r, type, quality));
  const webp = await as('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpg = await as('image/jpeg');
  if (!jpg) throw new Error('사진을 줄이지 못했어요');
  return jpg;
}
