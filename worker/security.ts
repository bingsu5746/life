// 서버 보안 도우미 (Cloudflare 없이도 시험할 수 있게 따로 둔다: worker/security.test.ts)

export const COOKIE_NAME = 'life_session';

/** 요청 쿠키에서 로그인 토큰 꺼내기 */
export function readCookie(req: Request, name = COOKIE_NAME): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** 비밀번호 규칙 (가입·바꾸기 공통). 맞으면 null */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < 8) return '비밀번호는 8자 이상으로 정해 주세요.';
  if (password.length > 128) return '비밀번호가 너무 길어요 (128자까지).';
  if (password.toLowerCase() === username.toLowerCase()) return '비밀번호를 아이디와 다르게 정해 주세요.';
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|12345678|123456789|abcdefgh|qwertyui|password)/i.test(password)) return '너무 쉬운 비밀번호예요. 다른 비밀번호를 정해 주세요.';
  return null;
}

/** 시간 창 안의 횟수 세기 (메모리: 서버가 다시 뜨면 처음부터. 계정 잠금은 저장소에 따로 남는다) */
export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  /** 이번 시도를 세고, 넘었으면 다시 할 수 있을 때까지 남은 초 */
  hit(key: string, now = Date.now()): number {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    list.push(now);
    // 마구 보내도 기억하는 양은 늘지 않게
    this.hits.set(key, list.slice(-(this.max + 1)));
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return list.length > this.max ? Math.ceil((list[0] + this.windowMs - now) / 1000) : 0;
  }
  reset(key: string) {
    this.hits.delete(key);
  }
}

