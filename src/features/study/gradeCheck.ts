// 시험지 채점: 정답 · 배점 · 내 답 → 맞은 수 · 점수 · 틀린 번호

/**
 * 답 목록 읽기.
 * - 띄어쓰기 · 쉼표 · 줄바꿈이 있으면 그것으로 나눈다 (주관식 「12」 처럼 두 자리 답도 됨)
 * - 숫자만 붙여 쓰면 한 글자가 한 문제 (예: 「13524」 → 1, 3, 5, 2, 4)
 * 빈칸은 「-」 · 「.」 · 「x」 로 (안 푼 문제)
 */
export function parseAnswers(s: string): string[] {
  const t = s.trim();
  if (!t) return [];
  const sep = /[\s,/]+/;
  const parts = sep.test(t) ? t.split(sep) : /^[\dxX.\-]+$/.test(t) ? [...t] : [t];
  return parts
    .filter((p) => p !== '')
    .slice(0, 200)
    .map((p) => (/^[xX.\-]$/.test(p) ? '' : p.slice(0, 6)));
}

/** 배점 읽기 (문제 수만큼, 모자라면 마지막 값을 이어 씀). 없으면 null */
export function parsePoints(s: string, n: number): number[] | null {
  const v = s
    .split(/[\s,/]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0 && x <= 100);
  if (!v.length || !n) return null;
  return Array.from({ length: n }, (_, i) => v[Math.min(i, v.length - 1)]);
}

/** 같은 답인지 (앞뒤 빈칸 · 앞의 0 은 무시) */
const same = (a: string, b: string) => {
  const x = a.trim(),
    y = b.trim();
  if (!x || !y) return false;
  if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) === Number(y);
  return x.toLowerCase() === y.toLowerCase();
};

export interface CheckResult {
  n: number;
  right: number;
  /** 틀린 번호 (안 푼 것 포함) */
  wrong: number[];
  /** 안 푼 번호 */
  blank: number[];
  score: number;
  full: number;
}

/**
 * 채점. 배점이 없으면 모든 문제를 같은 점수로 (만점 full 을 문제 수로 나눔).
 * 점수는 소수 둘째 자리까지.
 */
export function grade(key: string[], mine: string[], points: number[] | null, full = 100): CheckResult {
  const n = key.length;
  const pts = points && points.length === n ? points : Array.from({ length: n }, () => (n ? full / n : 0));
  const wrong: number[] = [];
  const blank: number[] = [];
  let right = 0;
  let score = 0;
  key.forEach((k, i) => {
    const m = mine[i] ?? '';
    if (same(k, m)) {
      right++;
      score += pts[i];
    } else {
      wrong.push(i + 1);
      if (!m.trim()) blank.push(i + 1);
    }
  });
  const total = points && points.length === n ? points.reduce((a, b) => a + b, 0) : full;
  return { n, right, wrong, blank, score: Math.round(score * 100) / 100, full: Math.round(total * 100) / 100 };
}
