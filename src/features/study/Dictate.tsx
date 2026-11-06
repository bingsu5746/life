// 말로 쓰기 버튼: 녹음 → 서버 받아쓰기(Whisper, 로그인했을 때) · 안 되면 브라우저 음성 인식. 일기 · 할 일이 같이 쓴다
import { useRef, useState } from 'react';
import { isLoggedIn, speechToText } from '../auth/api';
import { canListen, listen } from '../../lib/listen';
import { toast } from './ui';

/** label: 버튼 글 (기본 「말로 쓰기」) */
export function Dictate({ onText, label = '말로 쓰기' }: { onText: (t: string) => void; label?: string }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const rec = useRef<{ stop: () => void } | null>(null);
  const [stopListen, setStopListen] = useState<(() => void) | null>(null);
  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && isLoggedIn();
  // 녹음 → 서버 Whisper 받아쓰기 (브라우저 음성 인식보다 훨씬 정확). 녹음이 안 되면 브라우저 음성 인식
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('busy');
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          const b64 = await new Promise<string>((ok, no) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result).split(',')[1] ?? '');
            r.onerror = () => no(new Error('녹음을 읽지 못했어요'));
            r.readAsDataURL(blob);
          });
          const t = await speechToText(b64);
          if (t) onText(t);
          else toast('알아들은 말이 없어요');
        } catch (e) {
          toast(e instanceof Error ? e.message : '받아쓰지 못했어요');
        } finally {
          setState('idle');
        }
      };
      mr.start();
      const timer = setTimeout(() => mr.state === 'recording' && mr.stop(), 150_000);
      rec.current = { stop: () => (clearTimeout(timer), mr.state === 'recording' && mr.stop()) };
      setState('rec');
    } catch {
      toast('마이크를 쓸 수 있게 허용해 주세요');
    }
  }
  if (canRecord)
    return (
      <button type="button" className={`btn btn-sm dy-mic ${state === 'rec' ? 'on' : ''}`} disabled={state === 'busy'} onClick={() => (state === 'rec' ? rec.current?.stop() : void start())}>
        {state === 'rec' ? '■ 그만 (2분 30초까지)' : state === 'busy' ? '받아쓰는 중…' : `🎙 ${label}`}
      </button>
    );
  if (!canListen()) return null;
  return (
    <button
      type="button"
      className={`btn btn-sm dy-mic ${stopListen ? 'on' : ''}`}
      onClick={() => {
        if (stopListen) return stopListen();
        const st = listen(onText, (e) => {
          setStopListen(null);
          if (e && e !== 'no-speech' && e !== 'aborted') toast(e === 'not-allowed' ? '마이크를 쓸 수 있게 허용해 주세요' : '음성 인식이 멈췄어요');
        });
        setStopListen(() => st);
      }}
    >
      {stopListen ? '■ 그만 듣기' : `🎙 ${label}`}
    </button>
  );
}
