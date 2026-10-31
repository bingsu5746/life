// 줄 몇 개로 공유용 그림 카드(1080px) 만들기 → 폰은 공유 창, 아니면 내려받기 (한 해 결산 · 주간 돌아보기)
export interface CardLine {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}
export async function shareCard(title: string, lines: CardLine[], file: string, colors: [string, string] = ['#1e1b4b', '#7c2d12']): Promise<boolean> {
  const W = 1080,
    H = 260 + lines.length * 150 + 80;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return false;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.font = 'bold 68px system-ui, sans-serif';
  g.fillText(title, 80, 160);
  lines.forEach((l, i) => {
    const y = 280 + i * 150;
    g.fillStyle = '#fff';
    g.font = '60px system-ui, sans-serif';
    g.fillText(l.icon, 80, y + 20);
    g.font = '36px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillText(l.label, 180, y - 20);
    g.fillStyle = '#fff';
    g.font = 'bold 56px system-ui, sans-serif';
    g.fillText(l.value, 180, y + 40);
    if (l.sub) {
      g.font = '30px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(l.sub.slice(0, 44), 180, y + 85);
    }
  });
  g.font = '28px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.fillText('Life', 80, H - 40);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) return false;
  const f = new File([blob], file, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [f] })) {
    await navigator.share({ files: [f], title }).catch(() => {});
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}
