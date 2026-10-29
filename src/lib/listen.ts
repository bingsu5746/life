// 말로 쓰기: 브라우저 음성 인식 (Safari·Chrome 의 webkitSpeechRecognition). 지원하지 않으면 버튼을 숨긴다
interface Rec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecCtor = new () => Rec;

const Ctor = (): RecCtor | undefined => (globalThis as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition;

export const canListen = () => !!Ctor();

/** 듣기 시작. 확정된 말이 나올 때마다 onText, 끝나면 onEnd. 돌려준 함수로 멈춘다 */
export function listen(onText: (t: string) => void, onEnd: (error?: string) => void): () => void {
  const C = Ctor();
  if (!C) {
    onEnd('지원하지 않는 브라우저');
    return () => {};
  }
  const r = new C();
  r.lang = 'ko-KR';
  r.continuous = true;
  r.interimResults = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
  };
  let err: string | undefined;
  r.onerror = (e) => {
    err = e.error;
  };
  r.onend = () => onEnd(err);
  r.start();
  return () => r.stop();
}
