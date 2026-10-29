// 새로 넣은 영단어에 예문을 저절로 붙인다 (로그인했을 때, 뒤에서 조금씩).
// 한 번에 30단어까지, 2분에 한 번까지. 실패한 단어는 하루 뒤에 다시 시도한다.
import { fillExamples } from './actions';
import { alive, type Word, type WordsData } from './model';

const KEY = 'my-study.auto-ex.tried';
const DAY = 86_400_000;
let running = false;
let lastRun = 0;

function tried(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function saveTried(t: Record<string, number>) {
  try {
    // 오래된 것은 지워 크기를 줄인다
    const now = Date.now();
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(t).filter(([, at]) => now - at < 30 * DAY))));
  } catch {
    /* 무시 */
  }
}

/** 예문을 붙일 단어: 뜻이 있고, 영어이고, 예문이 없고, 최근 하루 안에 시도하지 않은 것 */
export function needExamples(words: WordsData, t: Record<string, number>, now = Date.now()): Word[] {
  return alive(words).filter((w) => !w.example && w.meaning.trim() && /[A-Za-z]/.test(w.term) && !(t[w.id] && now - t[w.id] < DAY));
}

export async function autoFillExamples(words: WordsData): Promise<number> {
  if (running || Date.now() - lastRun < 2 * 60_000) return 0;
  const t = tried();
  const need = needExamples(words, t).slice(0, 30);
  if (!need.length) return 0;
  running = true;
  lastRun = Date.now();
  try {
    return await fillExamples(need);
  } catch {
    return 0;
  } finally {
    const now = Date.now();
    for (const w of need) t[w.id] = now;
    saveTried(t);
    running = false;
  }
}
