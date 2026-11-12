import { describe, expect, it } from 'vitest';
import { diaryTags, onThisDay, parseQuery, searchDiary, similarEntries, snippetOf } from './diarySearch';
import type { DiaryEntry } from '../study/model';

const e = (id: string, text: string, title?: string, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({ id, updatedAt: 1, text, title, ...extra });
const all = [
  e('2025-11-12', '수학 시험을 망쳐서 속상했다. 산책하고 오답을 정리하니 마음이 좀 나아졌다. #시험', '시험 망한 날'),
  e('2025-03-02', '새 학기 첫날. 친구를 사귀는 게 어려웠다. 먼저 말을 걸어 봤다. #학교'),
  e('2026-06-01', '농구를 했다. 너무 재밌었다 #농구 #친구'),
  e('2024-11-13', '2년 전 이맘때 일기'),
];

describe('일기 찾기', () => {
  it('찾는 말 나누기', () => {
    expect(parseQuery('수학 "오답 정리" -농구')).toEqual({ must: ['수학', '오답 정리'], not: ['농구'] });
  });
  it('모든 말이 들어간 일기만, 제목도', () => {
    expect(searchDiary(all, '시험 산책').map((h) => h.e.id)).toEqual(['2025-11-12']);
    expect(searchDiary(all, '망한').map((h) => h.inTitle)).toEqual([true]);
    expect(searchDiary(all, '친구 -농구').map((h) => h.e.id)).toEqual(['2025-03-02']);
    expect(searchDiary(all, '  ')).toEqual([]);
  });
  it('둘레 글', () => {
    expect(snippetOf('가나다라마바사아자차카타파하', '마', 2)).toBe('…다라마바사…');
  });
  it('태그', () => {
    expect(diaryTags(all).map((t) => t.tag)).toEqual(['#농구', '#시험', '#친구', '#학교']);
  });
});

describe('N년 전 오늘', () => {
  it('같은 날, 없으면 앞뒤 3일', () => {
    const diary = Object.fromEntries(all.map((x) => [x.id, x]));
    expect(onThisDay(diary, '2026-11-12').map((x) => [x.years, x.e.id, x.exact])).toEqual([
      [1, '2025-11-12', true],
      [2, '2024-11-13', false],
    ]);
  });
});

describe('고민과 비슷한 지난 일기', () => {
  it('겹치는 말이 많은 일기가 위', () => {
    const r = similarEntries(all, '시험을 망쳐서 너무 속상해');
    expect(r[0].e.id).toBe('2025-11-12');
    expect(r.some((x) => x.e.id === '2026-06-01')).toBe(false);
    expect(similarEntries(all, '오늘')).toEqual([]);
  });
});

describe('사람 · 기분 말', async () => {
  const { personEntries, nameCandidates, moodWords, wordsOf } = await import('./diarySearch');
  const es = [
    e('2026-01-01', '민수랑 농구했다. 재밌었다', '', { mood: 5 }),
    e('2026-01-02', '민수랑 떡볶이 먹었다. 농구 이겼다', '', { mood: 5 }),
    e('2026-01-03', '시험 망쳤다. 숙제도 밀렸다', '', { mood: 1 }),
    e('2026-01-04', '시험 걱정. 숙제가 너무 많다', '', { mood: 2 }),
    e('2026-01-05', '지민이한테 연락했다. 엄마랑 장 봤다', '', { mood: 3 }),
  ];
  it('사람이 나온 일기', () => {
    expect(personEntries(es, ['민수']).map((x) => x.id)).toEqual(['2026-01-01', '2026-01-02']);
    expect(personEntries(es, ['지민', '지민이']).map((x) => x.id)).toEqual(['2026-01-05']);
  });
  it('이름 같은 말 (두 번 넘게, 엄마 · 아빠는 빼고)', () => {
    expect(nameCandidates(es).map((x) => x.name)).toEqual(['민수']);
    expect(nameCandidates(es, ['민수'])).toEqual([]);
  });
  it('조사 떼기', () => {
    expect([...wordsOf('농구를 했다. 숙제가 많다')]).toEqual(['농구', '숙제', '많다']);
  });
  it('기분 좋은 날 · 나쁜 날 말', () => {
    const r = moodWords(es);
    expect(r.good.map((x) => x.w)).toContain('농구');
    expect(r.bad.map((x) => x.w)).toEqual(expect.arrayContaining(['시험', '숙제']));
    expect(r.good.map((x) => x.w)).not.toContain('시험');
  });
});
