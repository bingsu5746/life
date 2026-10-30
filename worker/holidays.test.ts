import { describe, expect, it } from 'vitest';
import { parseSpecialDays } from './holidays';

describe('특일 정보 XML', () => {
  it('item 을 날짜 목록으로', () => {
    const xml =
      '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items><item><dateKind>01</dateKind><dateName>추석</dateName><isHoliday>Y</isHoliday><locdate>20261007</locdate><seq>1</seq></item><item><dateName>국군의 날</dateName><isHoliday>N</isHoliday><locdate>20261001</locdate></item></items></body></response>';
    expect(parseSpecialDays(xml)).toEqual([
      { date: '2026-10-07', name: '추석', holiday: true },
      { date: '2026-10-01', name: '국군의 날', holiday: false },
    ]);
  });
  it('오류 응답은 던진다', () => {
    expect(() => parseSpecialDays('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>')).toThrow(/30/);
  });
});
