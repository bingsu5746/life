import { describe, expect, it } from 'vitest';
import { Limiter, passwordProblem, readCookie } from './security';

describe('비밀번호 규칙', () => {
  it('짧은·아이디와 같은·쉬운 비밀번호는 안 됨', () => {
    expect(passwordProblem('short1', 'kim')).toMatch(/8자/);
    expect(passwordProblem('kimchulsu', 'KimChulsu')).toMatch(/아이디/);
    expect(passwordProblem('aaaaaaaa', 'kim')).toMatch(/쉬운/);
    expect(passwordProblem('12345678', 'kim')).toMatch(/쉬운/);
    expect(passwordProblem('password1', 'kim')).toMatch(/쉬운/);
    expect(passwordProblem('x'.repeat(129), 'kim')).toMatch(/길어요/);
    expect(passwordProblem('blue-sky-42', 'kim')).toBeNull();
  });
});

describe('횟수 제한', () => {
  it('창 안에서 max 를 넘으면 기다릴 초, 창이 지나면 다시', () => {
    const l = new Limiter(3, 60_000);
    expect([0, 1, 2].map((i) => l.hit('a', 1000 + i))).toEqual([0, 0, 0]);
    expect(l.hit('a', 2000)).toBe(59);
    expect(l.hit('b', 2000)).toBe(0);
    expect(l.hit('a', 70_000)).toBe(0);
  });
});

describe('쿠키 읽기', () => {
  it('이름이 맞는 것만', () => {
    const req = new Request('https://x/api/me', { headers: { cookie: 'a=1; life_session=abc; b=2' } });
    expect(readCookie(req)).toBe('abc');
    expect(readCookie(new Request('https://x/'))).toBeNull();
  });
});
