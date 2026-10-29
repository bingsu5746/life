import { describe, expect, it } from 'vitest';
import { cleanDish, parseEvents, parseMeals, parseTimetable, rowsOf } from './neis';

describe('나이스 응답 읽기', () => {
  it('줄 목록 · 자료 없음 · 오류', () => {
    expect(rowsOf({ mealServiceDietInfo: [{ head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000' } }] }, { row: [{ a: 1 }] }] }, 'mealServiceDietInfo')).toEqual([{ a: 1 }]);
    expect(rowsOf({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }, 'x')).toEqual([]);
    expect(() => rowsOf({ RESULT: { CODE: 'ERROR-290', MESSAGE: '인증키가 유효하지 않습니다.' } }, 'x')).toThrow('인증키가 유효하지 않습니다.');
  });
  it('급식: 알레르기 번호 떼기', () => {
    expect(cleanDish('김치찌개 (5.9.13.)')).toBe('김치찌개');
    expect(cleanDish('돈까스1.2.5.6.')).toBe('돈까스');
    expect(cleanDish('우유(2)')).toBe('우유');
    expect(cleanDish('비타500')).toBe('비타500');
    expect(parseMeals([{ MLSV_YMD: '20261029', MMEAL_SC_NM: '중식', DDISH_NM: '쌀밥<br/>김치찌개 (5.9.)<br/>', CAL_INFO: '780.2 Kcal' }])).toEqual([{ date: '2026-10-29', kind: '중식', dishes: ['쌀밥', '김치찌개'], cal: '780.2 Kcal' }]);
  });
  it('학사일정 · 시간표', () => {
    expect(parseEvents([{ AA_YMD: '20261102', EVENT_NM: '2학기 2차 지필평가', SBTR_DD_SC_NM: '해당없음' }, { AA_YMD: '20261225', EVENT_NM: '성탄절', SBTR_DD_SC_NM: '공휴일' }, { AA_YMD: '20261031', EVENT_NM: '토요휴업일', SBTR_DD_SC_NM: '휴업일' }])).toEqual([
      { date: '2026-11-02', name: '2학기 2차 지필평가', off: false },
      { date: '2026-12-25', name: '성탄절', off: true },
    ]);
    expect(parseTimetable([{ ALL_TI_YMD: '20261029', PERIO: '2', ITRT_CNTNT: '수학Ⅰ' }, { ALL_TI_YMD: '20261029', PERIO: '1', ITRT_CNTNT: '-' }, { ALL_TI_YMD: '20261029', PERIO: '1', ITRT_CNTNT: '문학' }])).toEqual([
      { date: '2026-10-29', period: 1, subject: '문학' },
      { date: '2026-10-29', period: 2, subject: '수학Ⅰ' },
    ]);
  });
});
