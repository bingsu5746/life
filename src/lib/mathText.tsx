// AI 답 보여 주기: 간단한 마크다운(굵게 · 제목 · 목록 · 코드) + 수식(KaTeX: $…$, $$…$$, \(…\), \[…\])
import { memo, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function math(tex: string, display: boolean) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' });
  } catch {
    return esc(tex);
  }
}

/** 수식이 아닌 글: 굵게 · 기울임 · 코드 */
function inline(t: string) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
}

/** 한 덩어리 글 → HTML (수식 먼저 떼어 내고 나머지는 마크다운) */
export function toHtml(text: string): string {
  const parts: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const holders: string[] = [];
  let src = '';
  while ((m = re.exec(text))) {
    src += text.slice(last, m.index);
    const display = m[1] !== undefined || m[2] !== undefined;
    holders.push(math((m[1] ?? m[2] ?? m[3] ?? m[4]).trim(), display));
    src += `\u0000${holders.length - 1}\u0000`;
    last = re.lastIndex;
  }
  src += text.slice(last);
  for (const line of src.split('\n')) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (h) parts.push(`<div class="mt-h">${inline(h[2])}</div>`);
    else if (li) parts.push(`<div class="mt-li">${inline(line.trim().startsWith('-') || line.trim().startsWith('*') || line.trim().startsWith('•') ? `• ${li[1]}` : line.trim())}</div>`);
    else if (!line.trim()) parts.push('<div class="mt-gap"></div>');
    else parts.push(`<div>${inline(line)}</div>`);
  }
  return parts.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => holders[Number(i)]);
}

/** 같은 글은 다시 그리지 않는다 (수식 그리기가 무거워서) */
export const MathText = memo(function MathText({ text }: { text: string }) {
  const html = useMemo(() => toHtml(text), [text]);
  return <div className="mt" dangerouslySetInnerHTML={{ __html: html }} />;
});
