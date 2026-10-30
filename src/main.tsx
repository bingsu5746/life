import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// 글꼴: Pretendard (OFL), 이 사이트에서 직접 내보낸다. 쓰는 글자 묶음만 그때그때 받는다
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";
import { applyTheme } from "./lib/theme";

applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
  applyTheme(),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 오프라인에서도 열리게 (빌드한 사이트에서만)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () => void navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
}

// 새 판이 배포됐는데 이 창(특히 홈 화면에 둔 앱)이 옛 판 그대로 남아 있지 않게:
// 화면으로 돌아올 때마다(10분에 한 번까지) 사이트 첫 쪽을 받아 지금 쓰는 코드 파일 이름과 다르면 새로 연다
if (import.meta.env.PROD) {
  const mine = document
    .querySelector<HTMLScriptElement>(
      'script[type="module"][src*="/assets/index-"]',
    )
    ?.src.split("/")
    .pop();
  let last = 0;
  const check = async () => {
    if (
      !mine ||
      document.visibilityState !== "visible" ||
      Date.now() - last < 10 * 60_000
    )
      return;
    last = Date.now();
    try {
      const html = await (await fetch("/", { cache: "no-store" })).text();
      const now = html.match(/assets\/(index-[\w-]+\.js)/)?.[1];
      // 글을 쓰는 중이면 그대로 둔다 (다음에 돌아올 때)
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (typing) last = 0;
      if (now && now !== mine && !typing) {
        await navigator.serviceWorker
          ?.getRegistration()
          .then((r) => r?.update());
        location.reload();
      }
    } catch {
      // 인터넷이 없으면 다음에
    }
  };
  document.addEventListener("visibilitychange", () => void check());
  window.addEventListener("focus", () => void check());
}
