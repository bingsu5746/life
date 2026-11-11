import { describe, expect, it } from 'vitest';
import { parseQuick } from './quickEvent';

// 2026-11-11 은 수요일
const T = '2026-11-11';
describe('한 줄 일정', () => {
  it('날짜 말', () => {
    expect(parseQuick('내일 치과', T)).toEqual({ title: '치과', date: '2026-11-12', allDay: true, start: undefined, end: undefined });
    expect(parseQuick('모레 영화', T)?.date).toBe('2026-11-13');
    expect(parseQuick('금요일 학원', T)?.date).toBe('2026-11-13');
    expect(parseQuick('수요일 학원', T)?.date).toBe('2026-11-11');
    expect(parseQuick('다음 주 월요일 시험', T)?.date).toBe('2026-11-16');
    expect(parseQuick('12월 24일 크리스마스 이브', T)).toMatchObject({ title: '크리스마스 이브', date: '2026-12-24' });
    expect(parseQuick('1/3 여행', T)?.date).toBe('2027-01-03');
    expect(parseQuick('20일 생일 파티', T)?.date).toBe('2026-11-20');
    expect(parseQuick('5일 결제', T)?.date).toBe('2026-12-05');
  });
  it('시각', () => {
    expect(parseQuick('내일 오후 3시 치과', T)).toMatchObject({ title: '치과', allDay: false, start: '15:00', end: '16:00' });
    expect(parseQuick('3시 반 상담', T)).toMatchObject({ title: '상담', start: '15:30', end: '16:30' });
    expect(parseQuick('오전 10시 30분 병원', T)).toMatchObject({ start: '10:30', end: '11:30' });
    expect(parseQuick('금요일 7시~9시 학원', T)).toMatchObject({ title: '학원', date: '2026-11-13', start: '19:00', end: '21:00' });
    expect(parseQuick('18:00-20:00 농구', T)).toMatchObject({ title: '농구', start: '18:00', end: '20:00' });
    expect(parseQuick('오후 3시부터 5시까지 스터디', T)).toMatchObject({ title: '스터디', start: '15:00', end: '17:00' });
  });
  it('제목이 없으면 없음', () => {
    expect(parseQuick('내일', T)).toBeNull();
    expect(parseQuick('  ', T)).toBeNull();
  });
});
