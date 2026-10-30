// NBA 2K 능력치 (nba2kapi.com). 주소 · 머리글 · 기능은 그 GitHub 설명서(woverfield/nba2kapi)를 보고 맞췄다:
// - 주소 https://api.nba2kapi.com, 키는 X-API-Key 머리글, 키가 있으면 1시간에 100번
// - /api/players/bulk : 한 번(1번으로 침)에 전체 선수 (teamType=curr 지금 팀)
// - 키가 없으면 /api/public/players (1분에 60번, 100명씩 cursor 로 이어 받기)
// 선수 모양은 설명서에 일부만 있어서(name · slug · team · overall · positions · attributes{분류:{능력치}}) 숫자 능력치는 모두 펼쳐 담는다
export interface Nba2kPlayer {
  name: string;
  slug: string;
  team: string;
  ovr: number;
  pos: string[];
  /** 능력치 이름 → 값 (분류는 펼침) */
  attrs: Record<string, number>;
  height?: string;
  weight?: string;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())
      ? Number(v)
      : NaN;

/** 응답에서 선수 배열 꺼내기 (data · players · 배열 그대로) */
export function listOf(json: unknown): Record<string, unknown>[] {
  const j = json as { data?: unknown; players?: unknown };
  const arr = Array.isArray(json)
    ? json
    : Array.isArray(j?.data)
      ? j.data
      : Array.isArray(j?.players)
        ? j.players
        : Array.isArray((j?.data as { players?: unknown })?.players)
          ? (j.data as { players: unknown[] }).players
          : [];
  return (arr as unknown[]).filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object",
  );
}

/** attributes 를 펼쳐서 숫자만 */
export function flatAttrs(
  a: unknown,
  out: Record<string, number> = {},
): Record<string, number> {
  if (!a || typeof a !== "object") return out;
  for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
    const x = n(v);
    if (Number.isFinite(x)) out[k] = x;
    else if (v && typeof v === "object" && !Array.isArray(v)) flatAttrs(v, out);
  }
  return out;
}

export function parse2k(json: unknown): Nba2kPlayer[] {
  return listOf(json)
    .map((p) => ({
      name: s(p.name),
      slug: s(p.slug),
      team: s(p.team),
      ovr: n(p.overall) || 0,
      pos: Array.isArray(p.positions)
        ? p.positions.filter((x): x is string => typeof x === "string")
        : s(p.position)
          ? [s(p.position)]
          : [],
      attrs: flatAttrs(p.attributes),
      height: s(p.height) || undefined,
      weight: s(p.weight) || undefined,
    }))
    .filter((p) => p.name);
}

const BASE = "https://api.nba2kapi.com";

/** 지금 팀 선수 전체 */
export async function fetch2k(key: string | undefined): Promise<Nba2kPlayer[]> {
  if (key) {
    const res = await fetch(`${BASE}/api/players/bulk?teamType=curr`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return parse2k(await res.json());
    console.error(
      "nba2k bulk failed",
      res.status,
      (await res.text()).slice(0, 150),
    );
  }
  // 키가 없거나 안 되면 공개 목록을 100명씩
  const all: Nba2kPlayer[] = [];
  let cursor = "";
  for (let i = 0; i < 12; i++) {
    const res = await fetch(
      `${BASE}/api/public/players?teamType=curr&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok)
      throw new Error(
        `nba2k ${res.status} ${(await res.text()).slice(0, 100)}`,
      );
    // 실제 응답(2026-10-30 확인): { success, data: [...], meta: { pagination: { hasMore, nextCursor: "2", total } } }
    const j = (await res.json()) as {
      meta?: {
        nextCursor?: unknown;
        pagination?: { nextCursor?: unknown; hasMore?: unknown };
      };
      nextCursor?: unknown;
      pagination?: { nextCursor?: unknown };
    };
    all.push(...parse2k(j));
    const c =
      j?.meta?.pagination?.nextCursor ??
      j?.meta?.nextCursor ??
      j?.nextCursor ??
      j?.pagination?.nextCursor;
    cursor =
      j?.meta?.pagination?.hasMore === false
        ? ""
        : typeof c === "number"
          ? String(c)
          : s(c);
    if (!cursor) break;
  }
  return all;
}
