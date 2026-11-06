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
