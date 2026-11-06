// 보고 싶은 영화 소식: OTT 에 올라옴 · 극장에서 상영 중(재개봉 포함) · 재개봉 예정. 처음 본 소식만 (key 로 기억)
import type { KobisInfo } from '../auth/api';
import type { DateStr, Movie } from '../study/model';

export interface MovieNews {
  key: string;
  movieId: string;
  text: string;
  at: number;
}

const norm = (t: string) => t.toLowerCase().replace(/[\s:·.,!?'"「」『』()\-–—]/g, '');

/** 새 소식 (이미 본 key 는 뺀다) */
export function findMovieNews(want: Movie[], kobis: KobisInfo | null, providers: (string[] | null)[] | null, seen: Set<string>, now = Date.now()): MovieNews[] {
  const out: MovieNews[] = [];
  const push = (key: string, m: Movie, text: string) => !seen.has(key) && !out.some((x) => x.key === key) && out.push({ key, movieId: m.id, text, at: now });
  want.forEach((m, i) => {
    const n = norm(m.title);
    if (!n) return;
    const yearOf = (d?: DateStr) => (d ? Number(d.slice(0, 4)) : 0);
    // 지금 극장에서 (어제 박스오피스)
    const b = kobis?.boxOffice?.find((x) => norm(x.title) === n);
    if (b) {
      const re = !!m.year && yearOf(b.open) > m.year;
      push(`th:${m.id}:${b.open ?? ''}`, m, `「${m.title}」 지금 극장에서 ${re ? '재개봉' : '상영'} 중이에요 (어제 박스오피스 ${b.rank}위)`);
    }
    // 재개봉 예정 (처음 개봉 해보다 늦게 다시 걸리는 것만. 새 영화 개봉 알림은 따로 있음)
    const u = kobis?.upcoming?.find((x) => norm(x.title) === n);
    if (u && m.year && yearOf(u.open) > m.year) push(`re:${m.id}:${u.open}`, m, `「${m.title}」 ${u.open.slice(5).replace('-', '/')} 극장에서 재개봉해요`);
    // OTT
    const p = providers?.[i];
    if (p && p.length) push(`ott:${m.id}:${[...p].sort().join(',')}`, m, `「${m.title}」 이제 ${p.join(' · ')}에서 볼 수 있어요`);
  });
  return out;
}
