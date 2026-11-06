// 유튜브 링크 → 넣어서 틀 수 있는 주소 (youtube-nocookie 삽입 플레이어). 음원을 따로 내려받지는 않는다.
export interface YtRef {
  kind: 'v' | 'list';
  id: string;
}

/** 링크(또는 영상 id)에서 영상 · 재생목록 찾기. 모르면 null */
export function parseYoutube(input: string): YtRef | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return { kind: 'v', id: s };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const list = u.searchParams.get('list');
  let v: string | null = null;
  if (host === 'youtu.be') v = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    v = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1] ?? null;
  } else return null;
  if (v && /^[\w-]{11}$/.test(v)) return { kind: 'v', id: v };
  if (list && /^[\w-]{10,64}$/.test(list)) return { kind: 'list', id: list };
  return null;
}

/** 삽입 플레이어 주소 (영상은 되풀이) */
export const embedUrl = (r: YtRef) =>
  r.kind === 'v' ? `https://www.youtube-nocookie.com/embed/${r.id}?autoplay=1&loop=1&playlist=${r.id}&playsinline=1` : `https://www.youtube-nocookie.com/embed/videoseries?list=${r.id}&autoplay=1&loop=1&playsinline=1`;
