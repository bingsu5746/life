// 기기의 읽어 주기 (Web Speech API). 없으면 아무것도 하지 않는다.
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
export function speak(text: string, lang: 'en' | 'ko' = 'en'): void {
  if (!canSpeak() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'en' ? 'en-US' : 'ko-KR';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

/** 다 읽을 때까지 기다리는 읽어 주기 (듣기 모드). 멈추면(cancel) 바로 끝난 것으로 */
export function speakWait(text: string, lang: 'en' | 'ko', rate = 0.9): Promise<void> {
  return new Promise((ok) => {
    if (!canSpeak() || !text.trim()) return ok();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : 'ko-KR';
    u.rate = rate;
    // 끝 이벤트가 안 오는 브라우저가 있어 글 길이로 넉넉히 기다린 뒤 넘어간다
    const t = window.setTimeout(ok, Math.max(4000, text.length * 400) / rate);
    u.onend = u.onerror = () => {
      clearTimeout(t);
      ok();
    };
    window.speechSynthesis.speak(u);
  });
}
export const stopSpeak = () => canSpeak() && window.speechSynthesis.cancel();
