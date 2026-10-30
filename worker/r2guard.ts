// R2 무료 한도 지키기: 넘기 전에 막는다 (넘으면 자동 결제되므로).
// 무료 (Cloudflare 공식 가격표): 저장 10 GB-월, 쓰기 같은 Class A 작업 월 100만 번, 읽기 같은 Class B 작업 월 1,000만 번.
// 여유를 두고 그 90% 에서 멈춘다.
export const R2_FREE = { bytes: 10 * 1024 ** 3, a: 1_000_000, b: 10_000_000 };
export const R2_STOP = { bytes: Math.floor(R2_FREE.bytes * 0.9), a: Math.floor(R2_FREE.a * 0.9), b: Math.floor(R2_FREE.b * 0.9) };

export interface R2Use {
  /** 지금 저장된 바이트 */
  bytes: number;
  /** 이번 달 (UTC) 작업 수 */
  month: string;
  a: number;
  b: number;
}

export const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);

/** 달이 바뀌면 작업 수는 0부터 (저장 용량은 그대로) */
export function rollMonth(u: R2Use, now: number): R2Use {
  const m = monthOf(now);
  return u.month === m ? u : { ...u, month: m, a: 0, b: 0 };
}

/** 이 작업을 하면 한도를 넘는지: 넘으면 이유, 괜찮으면 null */
export function r2Block(u: R2Use, op: 'put' | 'get' | 'delete', addBytes = 0): string | null {
  if (op === 'put') {
    if (u.bytes + addBytes > R2_STOP.bytes) return '사진 저장 공간이 무료 한도에 가까워서 더 올리지 않아요.';
    if (u.a + 1 > R2_STOP.a) return '이번 달 사진 올리기 무료 횟수에 가까워서 막았어요. 다음 달 1일(UTC)에 풀려요.';
  }
  if (op === 'get' && u.b + 1 > R2_STOP.b) return '이번 달 사진 보기 무료 횟수에 가까워서 막았어요. 다음 달 1일(UTC)에 풀려요.';
  return null;
}
