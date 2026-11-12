import { describe, expect, it } from 'vitest';
import { decodeQ, encodeQ, qSeconds, slowest, startPerQ, switchQ } from './mockExam';
import { parseYoutube, embedUrl } from '../../lib/youtube';
import { dosesOn, medReminders, toggleDose } from './meds';
import { emptyStudy, type Word } from './model';
import { sanitizeSettings } from './sanitize';
import { studyReport } from './studyReport';
import { listenWords } from './WordListen';

describe('문항별 시간', () => {
  it('번호를 옮길 때마다 쌓이고, 다시 돌아오면 더해진다', () => {
    let p = startPerQ(0);
    p = switchQ(p, 2, 60_000); // 1번 60초
    p = switchQ(p, 1, 90_000); // 2번 30초
    p = switchQ(p, 1, 95_000); // 같은 번호: 그대로
    const s = qSeconds(p, 120_000); // 1번 +30초
    expect(s).toEqual({ 1: 90, 2: 30 });
    expect(slowest(s, 1)).toEqual([{ q: 1, sec: 90 }]);
    expect(decodeQ(encodeQ(s))).toEqual(s);
    expect(decodeQ('0:5,3:0,4:x,201:9,7:12')).toEqual({ 7: 12 });
  });
});

describe('유튜브 링크', () => {
  it('여러 모양', () => {
    expect(parseYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toEqual({ kind: 'v', id: 'dQw4w9WgXcQ' });
    expect(parseYoutube('youtu.be/dQw4w9WgXcQ?si=abc')).toEqual({ kind: 'v', id: 'dQw4w9WgXcQ' });
    expect(parseYoutube('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({ kind: 'v', id: 'dQw4w9WgXcQ' });
    expect(parseYoutube('https://music.youtube.com/playlist?list=PLabcdefghij12')).toEqual({ kind: 'list', id: 'PLabcdefghij12' });
    expect(parseYoutube('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYoutube('아무 글')).toBeNull();
    expect(embedUrl({ kind: 'v', id: 'dQw4w9WgXcQ' })).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
});

describe('약 · 영양제', () => {
  it('오늘 먹을 것 · 체크 · 알림은 체크 안 한 것만', () => {
    const d = emptyStudy();
    d.settings.meds = [{ id: 'a', name: '비타민', times: ['08:00', '20:00'] }];
    d.settings.medLog = toggleDose(undefined, '2026-11-06', 'a@08:00');
    expect(dosesOn(d.settings, '2026-11-06').map((x) => x.done)).toEqual([true, false]);
    const r = medReminders(d, '2026-11-06', Date.parse('2026-11-06T07:00:00+09:00'), 0);
    expect(r.map((x) => x.at)).toEqual([Date.parse('2026-11-06T20:00:00+09:00')]);
    // 다시 누르면 해제 · 오래된 날 정리
    const log = toggleDose({ '2026-08-01': ['a@08:00'], ...d.settings.medLog }, '2026-11-06', 'a@08:00');
    expect(log).toEqual({});
  });
  it('설정에 저장 (시각 모양 · 개수)', () => {
    const s = sanitizeSettings({ meds: [{ id: 'a', name: ' 약 ', times: ['20:00', '08:00', '25:00', '08:00'] }, { name: '' }], medLog: { '2026-11-06': ['a@08:00', 3] } });
    expect(s.meds).toEqual([{ id: 'a', name: '약', times: ['08:00', '20:00'], memo: undefined }]);
    expect(s.medLog).toEqual({ '2026-11-06': ['a@08:00'] });
  });
});

describe('주간 공부 리포트', () => {
  it('기록에 있는 것만', () => {
    const d = emptyStudy();
    d.subjects = { m: { id: 'm', name: '수학', color: '#000', order: 0, updatedAt: 1 } };
    d.sessions = {
      a: { id: 'a', updatedAt: 1, date: '2026-11-02', minutes: 90, subjectId: 'm', start: 0, end: 0, kind: 'manual' },
      b: { id: 'b', updatedAt: 1, date: '2026-11-03', minutes: 30, start: 0, end: 0, kind: 'manual' },
      c: { id: 'c', updatedAt: 1, date: '2026-10-28', minutes: 60, start: 0, end: 0, kind: 'manual' },
    } as never;
    const lines = studyReport(d, '2026-11-02', '2026-11-06');
    expect(lines[0]).toMatchObject({ label: '이번 주 공부', value: '2시간', sub: '지난주 1시간 · ▲ 1시간' });
    expect(lines[1].value).toBe('7일 중 2일');
    expect(lines[2]).toMatchObject({ value: '수학', sub: '수학 1시간 30분 · 과목 없음 30분' });
    expect(lines).toHaveLength(3);
  });
});

describe('단어 듣기', () => {
  it('고르기', () => {
    const w = (id: string, listId: string, order: number, wrong = 0): Word => ({ id, listId, term: id, meaning: '뜻', order, wrong, box: 0, due: '2026-01-01', updatedAt: 1 });
    const lists = { a: {}, b: { deleted: true } };
    const all = [w('x', 'a', 2), w('y', 'a', 1, 3), w('z', 'b', 0, 5)];
    expect(listenWords(all, lists, 'all').map((x) => x.id)).toEqual(['y', 'x']);
    expect(listenWords(all, lists, 'weak').map((x) => x.id)).toEqual(['y']);
  });
});

describe('교과서 쪽 범위', async () => {
  const { scopePages, chunkPages } = await import('./textbook');
  it('범위 줄에서 쪽 찾기', () => {
    expect(scopePages(['교과서 12~80쪽', '학습지 1~5'])).toEqual([{ from: 12, to: 80 }]);
    expect(scopePages(['1단원 ~ 3단원', 'p.100-120', '45쪽'])).toEqual([{ from: 45, to: 45 }, { from: 100, to: 120 }]);
    expect(scopePages(['교과서 12쪽 ~ 30쪽', '교과서 25~40쪽'])).toEqual([{ from: 12, to: 40 }]);
  });
  it('글 묶기', () => {
    const pages = [1, 2, 3, 5].map((page) => ({ page, text: 'x'.repeat(30) + page }));
    expect(chunkPages(pages, 70).map((c) => c.label)).toEqual(['1~2', '3', '5']);
  });
});

describe('시장 · 비 예보 · 방학 · 휴대폰', async () => {
  const { rainReminders } = await import('../life/events');
  const { vacationView, afterExamReminder } = await import('./vacation');
  const { missedStats } = await import('./dayLog');
  const { parseForecast } = await import('../life/weather');
  it('비 예보: 50% 이상 · 공부 일정 빼기 · 전날 21시', () => {
    const d = emptyStudy();
    d.events = {
      e: { id: 'e', updatedAt: 1, title: '놀이공원', date: '2026-11-08', allDay: true, color: 'blue', created: 1 },
      s: { id: 's', updatedAt: 1, title: '학원', date: '2026-11-08', allDay: true, color: 'blue', study: true, created: 1 },
      f: { id: 'f', updatedAt: 1, title: '농구', date: '2026-11-07', allDay: true, color: 'blue', created: 1 },
    } as never;
    const fc = parseForecast({ daily: { time: ['2026-11-06', '2026-11-07', '2026-11-08'], precipitation_probability_max: [10, 30, 80], weather_code: [0, 3, 61] } });
    const r = rainReminders(d, fc, '2026-11-06', Date.parse('2026-11-06T12:00:00+09:00'));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ at: Date.parse('2026-11-07T21:00:00+09:00'), title: '☔ 내일 비 예보 (80%)', body: '놀이공원 — 우산 챙겨요' });
  });
  it('방학 · 시험 끝나고', () => {
    const d = emptyStudy();
    d.sessions = { a: { id: 'a', updatedAt: 1, date: '2026-12-21', minutes: 300, start: 0, end: 0, kind: 'manual' } } as never;
    const v = vacationView(d, { from: '2026-12-21', to: '2026-12-30', dailyMin: 240, goals: [{ id: 'g', text: 'x', done: true }] }, '2026-12-22');
    expect(v).toMatchObject({ total: 10, passed: 2, left: 8, kept: 1, avg: 150, goalsDone: 1, on: true });
    expect(afterExamReminder('2026-12-10', [{ id: 'a', text: '노래방', done: false }], Date.parse('2026-12-01T00:00:00Z'))[0].at).toBe(Date.parse('2026-12-10T18:00:00+09:00'));
    expect(afterExamReminder('2026-12-10', [{ id: 'a', text: '노래방', done: true }])).toEqual([]);
  });
  it('못 지킨 이유', () => {
    const d = emptyStudy();
    d.conditions = { '2026-11-05': { id: '2026-11-05', updatedAt: 1, missed: ['피곤해서'] }, '2026-11-06': { id: '2026-11-06', updatedAt: 1, missed: ['피곤해서', '폰 · 게임'] } };
    expect(missedStats(d, '2026-11-06')[0]).toEqual({ reason: '피곤해서', n: 2 });
  });
});

describe('단어 외우기 순서', async () => {
  const { nextInRound } = await import('./wordSession');
  it('모른 단어는 이번 바퀴를 다 본 뒤 섞어서', () => {
    const rev = () => 0; // 섞기를 정해진 대로 (뒤집기에 가깝게)
    let s = nextInRound(['a', 'b', 'c', 'd'], 4, false, rev); // a 모름
    expect(s).toEqual({ queue: ['b', 'c', 'd', 'a'], round: 3 });
    s = nextInRound(s.queue, s.round, true, rev); // b 앎
    s = nextInRound(s.queue, s.round, false, rev); // c 모름
    expect(s).toEqual({ queue: ['d', 'a', 'c'], round: 1 });
    s = nextInRound(s.queue, s.round, true, rev); // d 앎 → 바퀴 끝, 남은 a · c 섞어서
    expect(s.round).toBe(2);
    expect([...s.queue].sort()).toEqual(['a', 'c']);
    s = nextInRound(s.queue, s.round, true);
    s = nextInRound(s.queue, s.round, true);
    expect(s).toEqual({ queue: [], round: 0 });
  });
});

describe('아침 기록 합치기', () => {
  it('두 기기에서 따로 적은 잔 시각 · 일어난 시각이 둘 다 남는다', async () => {
    const { mergeCondition } = await import('./merge');
    const phone = { id: '2026-11-12', updatedAt: 10, sleep: '23:30' };
    const pc = { id: '2026-11-12', updatedAt: 20, wake: '07:00' };
    expect(mergeCondition(phone, pc)).toMatchObject({ sleep: '23:30', wake: '07:00', updatedAt: 20 });
    expect(mergeCondition(pc, phone)).toMatchObject({ sleep: '23:30', wake: '07:00' });
  });
});
