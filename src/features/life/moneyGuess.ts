// 쓴 돈 분류 짐작: 내가 전에 같은 이름으로 적은 분류 → 없으면 흔한 낱말로
import { alive, type MoneyTx, type StudyData } from '../study/model';

const WORDS: [string, RegExp][] = [
  ['간식·카페', /카페|커피|라떼|아메리카노|스타벅스|이디야|메가|빽다방|편의점|cu|gs25|세븐일레븐|과자|음료|아이스크림|빵|디저트|탕후루|버블티|공차/i],
  ['식비', /밥|점심|저녁|아침|떡볶이|분식|김밥|라면|치킨|피자|햄버거|맥도날드|버거킹|롯데리아|맘스터치|국밥|돈가스|마라탕|짜장|짬뽕|식당|급식|배달/i],
  ['교통', /버스|지하철|택시|기차|ktx|srt|교통|티머니|따릉이|킥보드/i],
  ['교육·책', /책|문제집|교재|학원|인강|문구|필기|공책|노트|펜|샤프|형광펜|프린트|복사/i],
  ['문화·여가', /영화|cgv|메가박스|롯데시네마|노래방|코노|pc방|피시방|게임|스팀|steam|공연|콘서트|볼링|만화|웹툰|넷플릭스|유튜브|lp|음반|앨범/i],
  ['쇼핑', /옷|신발|운동화|가방|쇼핑|다이소|올리브영|무신사|쿠팡|화장품|양말|모자/i],
  ['통신', /통신|요금|데이터|폰요금|휴대폰/i],
  ['선물', /선물|생일/i],
];

/** memo → 분류 (모르면 null). 내 기록에서 같은 이름이 가장 많았던 분류가 먼저 */
export function guessCategory(d: Pick<StudyData, 'moneyTx'>, memo: string, type: MoneyTx['type'], cats: string[]): string | null {
  const m = memo.trim().toLowerCase();
  if (m.length < 1) return null;
  const count = new Map<string, number>();
  for (const t of alive(d.moneyTx)) if (t.type === type && t.memo && t.memo.trim().toLowerCase() === m && cats.includes(t.category)) count.set(t.category, (count.get(t.category) ?? 0) + 1);
  const mine = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (mine) return mine;
  if (type !== 'out') return null;
  return WORDS.find(([c, re]) => cats.includes(c) && re.test(m))?.[0] ?? null;
}

/** 이번 달 가장 많이 쓴 분류와 지난달 같은 날짜까지 비교 */
export function topCategory(d: Pick<StudyData, 'moneyTx'>, today: string): { category: string; now: number; before: number } | null {
  const month = today.slice(0, 7);
  const t = new Date(`${month}-01T12:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() - 1);
  const prev = t.toISOString().slice(0, 7);
  const sum = (mm: string, cat?: string) =>
    alive(d.moneyTx)
      .filter((x) => x.type === 'out' && x.date.startsWith(mm) && x.date.slice(8) <= today.slice(8) && (!cat || x.category === cat))
      .reduce((a, x) => a + x.amount, 0);
  const by = new Map<string, number>();
  for (const x of alive(d.moneyTx)) if (x.type === 'out' && x.date.startsWith(month)) by.set(x.category, (by.get(x.category) ?? 0) + x.amount);
  const top = [...by].sort((a, b) => b[1] - a[1])[0];
  return top ? { category: top[0], now: top[1], before: sum(prev, top[0]) } : null;
}
