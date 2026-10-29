// 영영 사전 (Free Dictionary API, dictionaryapi.dev · 키 없음): 발음 기호 · 원어민 발음 소리 · 뜻 · 예문 · 동의어
// 서버를 거치지 않고 기기에서 바로 부르고, 받은 것은 기기에 30일 저장해 다시 묻지 않는다
import { speak } from './speak';

export interface EnSense {
  pos: string;
  def: string;
  example?: string;
}
export interface EnEntry {
  word: string;
  phonetic?: string;
  audio?: string;
  senses: EnSense[];
  synonyms: string[];
}

type Raw = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

/** 응답(같은 단어의 여러 묶음)을 하나로 */
export function parseEnDict(json: unknown): EnEntry | null {
  const entries = arr(json);
  if (!entries.length) return null;
  const phonetics = entries.flatMap((e) => arr(e.phonetics));
  const audioRaw = phonetics.map((p) => s(p.audio)).find(Boolean);
  const senses: EnSense[] = [];
  const synonyms = new Set<string>();
  for (const e of entries)
    for (const m of arr(e.meanings)) {
      for (const syn of Array.isArray(m.synonyms) ? m.synonyms : []) if (s(syn)) synonyms.add(s(syn));
      for (const d of arr(m.definitions)) {
        if (!s(d.definition)) continue;
        senses.push({ pos: s(m.partOfSpeech), def: s(d.definition), example: s(d.example) || undefined });
        for (const syn of Array.isArray(d.synonyms) ? d.synonyms : []) if (s(syn)) synonyms.add(s(syn));
      }
    }
  return {
    word: s(entries[0].word),
    phonetic: s(entries[0].phonetic) || phonetics.map((p) => s(p.text)).find(Boolean) || undefined,
    // 「//ssl.gstatic.com/…」 처럼 주소 앞이 빠진 것도 있다
    audio: audioRaw ? (audioRaw.startsWith('//') ? `https:${audioRaw}` : audioRaw) : undefined,
    senses: senses.slice(0, 8),
    synonyms: [...synonyms].slice(0, 12),
  };
}

const KEY = 'my-study.endict.';
const DAY = 86_400_000;

/** 한 단어 찾기. 없는 단어면 null (그것도 저장해 둔다) */
export async function lookupEn(word: string): Promise<EnEntry | null> {
  const w = word.trim().toLowerCase();
  if (!/^[a-z][a-z' -]{0,40}$/.test(w)) return null;
  try {
    const c = JSON.parse(localStorage.getItem(KEY + w) ?? 'null') as { at: number; v: EnEntry | null } | null;
    if (c && Date.now() - c.at < 30 * DAY) return c.v;
  } catch {
    /* 저장소를 못 쓰면 그냥 묻는다 */
  }
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
  if (!res.ok && res.status !== 404) throw new Error(`사전 응답 ${res.status}`);
  const v = res.ok ? parseEnDict(await res.json()) : null;
  try {
    localStorage.setItem(KEY + w, JSON.stringify({ at: Date.now(), v }));
  } catch {
    /* 가득 차면 저장하지 않는다 */
  }
  return v;
}

let player: HTMLAudioElement | null = null;
/** 원어민 발음(사전에 소리가 있으면), 없으면 기기 읽어 주기 */
export async function playWord(word: string) {
  try {
    const e = await lookupEn(word);
    if (e?.audio) {
      player?.pause();
      player = new Audio(e.audio);
      await player.play();
      return;
    }
  } catch {
    /* 사전·소리를 못 받으면 기기 읽어 주기로 */
  }
  speak(word, 'en');
}
