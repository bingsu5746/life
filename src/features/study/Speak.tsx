// 영어 단어 옆 발음 듣기 단추
import { canSpeak, speak } from '../../lib/speak';

/** 영어 단어 + 발음 듣기 (카드가 뒤집히지 않게 누름을 막는다) */
export function WithSpeak({ text, children }: { text: string; children: React.ReactNode }) {
  if (!canSpeak() || !/[A-Za-z]/.test(text)) return <>{children}</>;
  return (
    <span className="sp-wrap">
      {children}
      <button
        type="button"
        className="sp-btn"
        aria-label={`${text} 발음 듣기`}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          speak(text, 'en');
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
        </svg>
      </button>
    </span>
  );
}
