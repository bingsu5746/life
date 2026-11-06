import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API_ROUTES } from './routes';

describe('/api 주소', () => {
  it('계정 서버에 있는 주소는 모두 길목(API_ROUTES)을 지난다', () => {
    const src = readFileSync(new URL('./accounts.ts', import.meta.url), 'utf8');
    const paths = [...new Set([...src.matchAll(/path === '([a-z0-9/-]+)'/g)].map((m) => m[1]))];
    // 길목 밖에서 따로 받거나 안 쓰는 주소
    const skip = new Set<string>();
    const missing = paths.filter((p) => !skip.has(p) && !API_ROUTES.test(`/api/${p}`));
    expect(missing).toEqual([]);
  });
});
