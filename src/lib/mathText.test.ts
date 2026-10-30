import { describe, expect, it } from 'vitest';
import { toHtml } from './mathText';

describe('toHtml', () => {
  it('수식과 굵게, 위험한 글자는 막는다', () => {
    const h = toHtml('**정답: ③** $x^2$ <script>');
    expect(h).toContain('<b>정답: ③</b>');
    expect(h).toContain('katex');
    expect(h).toContain('&lt;script&gt;');
    expect(h).not.toContain('<script>');
  });
  it('목록 · 제목', () => {
    expect(toHtml('# 풀이\n- 하나')).toBe('<div class="mt-h">풀이</div><div class="mt-li">• 하나</div>');
  });
});
