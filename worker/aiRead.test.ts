import { describe, expect, it } from 'vitest';
import { parseDiary, parseNote } from './aiRead';

describe('aiRead', () => {
  it('문제 사진: 모르는 과목은 null', () => {
    expect(parseNote('{"subject":"수학","number":"12","question":"$x^2=4$ 의 해는?"}', ['수학', '영어'])).toEqual({ subject: '수학', number: '12', question: '$x^2=4$ 의 해는?' });
    expect(parseNote('{"subject":"물리","number":null,"question":null}', ['수학']).subject).toBeNull();
    expect(parseNote('{"subject":null,"number":null,"question":"a\\\\nb"}', []).question).toBe('a\nb');
  });
  it('일기 나누기: 빈 칸 · 모르는 칸은 뺀다', () => {
    expect(parseDiary('```json\n{"good":"농구 이겼다","hard":null,"x":"y","thanks":" "}\n```')).toEqual({ good: '농구 이겼다' });
  });
});

describe('영수증', () => {
  it('금액 · 날짜 · 가게', async () => {
    const { parseReceipt } = await import('./aiRead');
    expect(parseReceipt('{"amount":"12,500원","date":"2026-10-30","store":"메가커피","items":["아메리카노"]}')).toEqual({ amount: 12500, date: '2026-10-30', store: '메가커피', items: ['아메리카노'] });
    expect(parseReceipt('{"amount":null,"date":"어제","store":null,"items":null}')).toEqual({ amount: null, date: null, store: null, items: [] });
  });
});

describe('목차 사진', () => {
  it('쪽이 없거나 이상한 줄은 뺀다', async () => {
    const { parseTocRead } = await import('./aiRead');
    expect(parseTocRead('{"units":[{"name":"1. 집합","from":12,"to":30},{"name":"2. 명제","from":"31","to":null},{"name":"x","from":0},{"name":"3","from":40,"to":20}]}').units).toEqual([
      { name: '1. 집합', from: 12, to: 30 },
      { name: '2. 명제', from: 31, to: null },
    ]);
  });
});

describe('AI 코치 답 읽기', () => {
  it('요일 · 분 · 칸을 정리하고 이상한 값은 버린다', async () => {
    const { parseCoach } = await import('./aiRead');
    const r = parseCoach('```json\n{"good":"매일 했어","fix":null,"focus":["수학 오답","",3],"plan":[{"day":"월요일","items":[{"subject":"수학","minutes":"45","what":"오답"},{"minutes":9999}]},{"day":"X","items":[]}],"tip":"자기 전 단어"}\n```');
    expect(r.good).toBe('매일 했어');
    expect(r.fix).toBeNull();
    expect(r.focus).toEqual(['수학 오답']);
    expect(r.plan).toEqual([{ day: '월', items: [{ subject: '수학', minutes: 45, what: '오답' }] }]);
    expect(r.tip).toBe('자기 전 단어');
  });
});

describe('시험 범위 사진 읽기 결과', () => {
  it('과목 · 날짜 · 줄만 남긴다', async () => {
    const { parseScopeRead } = await import('./aiRead');
    expect(parseScopeRead(JSON.stringify({ scopes: [{ subject: '수학', date: '2026-12-01', lines: ['교과서 12~80쪽', '', '학습지 1~5'] }, { subject: '', lines: ['x'] }, { subject: '영어', date: '12월 2일', lines: [] }] }))).toEqual({
      scopes: [{ subject: '수학', date: '2026-12-01', lines: ['교과서 12~80쪽', '학습지 1~5'] }],
    });
  });
  it('성적표 사진: 적힌 값만 · 합계 줄 빼기 · 이상한 값은 null', async () => {
    const { parseGradeCard } = await import('./aiRead');
    const r = parseGradeCard(
      JSON.stringify({
        kind: 'mock',
        name: '2026년 6월 모의평가',
        date: '6월 4일',
        scores: [
          { subject: '국어', raw: 88, grade: 2, standard: '131', percentile: 92 },
          { subject: '수학', raw: 70, grade: 3.5, percentile: 150 },
          { subject: '합계', raw: 300 },
          { subject: '영어' },
        ],
      }),
    );
    expect(r).toEqual({
      kind: 'mock',
      name: '2026년 6월 모의평가',
      date: null,
      scores: [
        { subject: '국어', raw: 88, full: null, grade: 2, average: null, standard: 131, percentile: 92 },
        { subject: '수학', raw: 70, full: null, grade: null, average: null, standard: null, percentile: null },
      ],
    });
    expect(parseGradeCard('엉뚱한 답')).toEqual({ kind: null, name: null, date: null, scores: [] });
  });
  it('교과서 → 백지 복습: 제목 · 핵심이 있는 것만', async () => {
    const { parseBlank } = await import('./aiRead');
    expect(parseBlank(JSON.stringify({ sheets: [{ title: '1. 세포의 구조', points: ['핵: 유전 물질 보관', ''] }, { title: '', points: ['x'] }, { title: '빈 것', points: [] }] }))).toEqual({ sheets: [{ title: '1. 세포의 구조', points: ['핵: 유전 물질 보관'] }] });
  });
});

describe('세계 뉴스', () => {
  it('Guardian 응답 읽기 · 번역 줄 읽기', async () => {
    const { parseGuardian, readNewsTranslate, guardianUrl } = await import('./news');
    const items = parseGuardian({ response: { results: [{ id: 'world/1', webTitle: 'A &amp; B', webUrl: 'https://www.theguardian.com/world/1', sectionName: 'World news', webPublicationDate: '2026-11-06T01:00:00Z', fields: { trailText: '<p>Hi</p>', thumbnail: 'https://media.guim.co.uk/x.jpg' } }, { id: 'x', webTitle: 'bad', webUrl: 'https://evil.com' }] } });
    expect(items).toEqual([{ id: 'world/1', title: 'A & B', trail: 'Hi', url: 'https://www.theguardian.com/world/1', section: 'World news', at: '2026-11-06T01:00:00Z', thumb: 'https://media.guim.co.uk/x.jpg' }]);
    expect(readNewsTranslate('1T: 가와 나\n1S: 안녕\n2T: 둘\n2S: -', 2)).toEqual([{ title: '가와 나', trail: '안녕' }, { title: '둘', trail: '' }]);
    expect(guardianUrl('k', 'world')).toContain('section=world');
    expect(guardianUrl('k', 'all')).not.toContain('section=');
  });
});
