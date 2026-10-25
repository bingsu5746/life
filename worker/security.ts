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

/** 흔히 쓰여 금방 맞혀지는 비밀번호 (소문자로 비교) */
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'iloveyou', 'iloveyou1', 'sunshine', 'princess', 'football', 'baseball',
  'superman', 'starwars', 'trustno1', 'welcome1', 'letmein1', 'admin123', 'test1234', 'hello123', 'computer', 'internet', 'samsung1', 'sarang12',
  'saranghae', 'loveyou1', 'master12', 'dragon12', 'monkey12', 'abc12345', 'abcd1234', 'a1234567', 'a12345678', 'aa123456', 'qwer1234', 'q1w2e3r4',
  'q1w2e3r4t5', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'zaq12wsx', 'asdf1234', 'zxcv1234', '12341234', '11223344', '12344321', '87654321', '98765432',
]);

/** 비밀번호 규칙 (가입·바꾸기 공통). 맞으면 null */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < 8) return '비밀번호는 8자 이상으로 정해 주세요.';
  if (password.length > 128) return '비밀번호가 너무 길어요 (128자까지).';
  const p = password.toLowerCase();
  if (p === username.toLowerCase() || p.includes(username.toLowerCase()) && username.length >= 4 && p.replace(username.toLowerCase(), '').length < 4) return '비밀번호를 아이디와 다르게 정해 주세요.';
  const easy =
    COMMON.has(p) ||
    // 글자 두 가지 이하로만 (aaaaaaa1, 12121212)
    new Set(p).size <= 2 ||
    // 키보드·숫자 줄 그대로
    /^(?:0123456789|1234567890|12345678|123456789|abcdefgh|qwerty|asdfgh|zxcvbn|1q2w3e|password)/.test(p);
  if (easy) return '너무 쉬운 비밀번호예요. 다른 비밀번호를 정해 주세요.';
  return null;
}

/** 글자(이모지 포함)를 깨뜨리지 않고 앞에서 n 글자 */
export function cutText(s: string, n: number): string {
  try {
    const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    return [...seg.segment(s)].slice(0, n).map((x) => x.segment).join('');
  } catch {
    return Array.from(s).slice(0, n).join('');
  }
}

/** 아이디 비교용 (한글 자모가 나뉘어 들어와도 같게, 대소문자 무시) */
export const usernameKey = (s: string) => s.normalize('NFC').toLowerCase();

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

