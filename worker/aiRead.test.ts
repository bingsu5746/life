import { describe, expect, it } from 'vitest';
import { parseDiary, parseNote } from './aiRead';

describe('aiRead', () => {
  it('문제 사진: 모르는 과목은 null', () => {
    expect(parseNote('{"subject":"수학","number":"12","question":"$x^2=4$ 의 해는?"}', ['수학', '영어'])).toEqual({ subject: '수학', number: '12', question: '$x^2=4$ 의 해는?' });
    expect(parseNote('{"subject":"물리","number":null,"question":null}', ['수학']).subject).toBeNull();
  });
  it('일기 나누기: 빈 칸 · 모르는 칸은 뺀다', () => {
    expect(parseDiary('```json\n{"good":"농구 이겼다","hard":null,"x":"y","thanks":" "}\n```')).toEqual({ good: '농구 이겼다' });
  });
});
