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
