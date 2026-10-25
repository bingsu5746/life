// 화면 밝기: 기기 설정 따르기 · 밝게 · 어둡게 (이 기기에만 저장)
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'my-study.theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  // 직접 고른 밝기를 두 개의 theme-color(밝은·어두운 기기용) 모두에 넣는다
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0c0c0d' : '#f7f7f5'));
}

export function setTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // 이번에만
  }
  applyTheme(t);
}
