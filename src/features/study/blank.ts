// 백지 복습: 떠올려 쓴 글과 핵심 내용 비교
import type { ScopeLine } from './model';

/** 글을 비교할 낱말로: 한글·영문·숫자 덩어리 (두 글자 이상, 한 글자 한자어·숫자도 뜻이 있으면 둠) */
export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[가-힣]+|[a-z]+|\d+(?:\.\d+)?/g) ?? []).filter((t) => t.length >= 2 || /\d/.test(t));
}

/** 한국어 조사·어미를 대충 떼서 비교 (예: 광합성은 → 광합성) */
function stem(t: string): string {
  return t.replace(/(으로|에서|에게|까지|부터|처럼|이다|하다|된다|한다|은|는|이|가|을|를|의|에|와|과|로|도|만)$/, '') || t;
}

/**
 * 핵심 한 줄을 떠올려 썼는지 짐작: 그 줄의 낱말 중 절반 이상이 쓴 글에 있으면 떠올린 것으로.
 * (사람이 마지막에 고칠 수 있다)
 */
export function recalled(point: string, written: string): boolean {
  const want = [...new Set(tokens(point).map(stem))];
  if (!want.length) return false;
  const have = new Set(tokens(written).map(stem));
  const joined = written.toLowerCase().replace(/\s+/g, '');
  const hit = want.filter((w) => have.has(w) || (w.length >= 2 && joined.includes(w))).length;
  return hit / want.length >= 0.5;
}

/** 줄마다 짐작 → 빠뜨린 줄 id */
export function guessMissed(points: ScopeLine[], written: string): string[] {
  return points.filter((p) => !recalled(p.text, written)).map((p) => p.id);
}
