// 쓸모없는 지식 (uselessfacts.jsph.pl) 글 다듬기
/** 지식 글 다듬기: 「Source: …」 줄 · 주소 · 뒤에 붙은 출처를 지우고 한 덩어리로 */
export function cleanFact(t: string): string {
  return t
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(source|src|via|from|permalink)\b\s*[:：]?/i.test(l))
    .join(' ')
    .replace(/\(?\s*(source|via)\s*[:：][^)]*\)?\s*$/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^>\s*/, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}
