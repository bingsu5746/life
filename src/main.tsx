import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// 글꼴: Pretendard (OFL), 이 사이트에서 직접 내보낸다. 쓰는 글자 묶음만 그때그때 받는다
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { applyTheme } from './lib/theme';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 오프라인에서도 열리게 (빌드한 사이트에서만)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
