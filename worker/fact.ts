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

/** 번역이 제대로 된 한국어인지: 한글이 몇 글자 넘게 있고, 같은 글자가 6번 넘게 이어지지 않음 (깨진 번역 「!!!!!!」 거르기) */
export function goodKo(t: string): boolean {
  const s = t.trim();
  const hangul = (s.match(/[가-힣]/g) ?? []).length;
  return hangul >= 4 && hangul >= s.replace(/\s/g, '').length * 0.3 && !/(.)\1{5,}/.test(s);
}
