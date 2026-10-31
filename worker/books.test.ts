import { describe, expect, it } from 'vitest';
import { parseSeoji } from './books';

describe('국립중앙도서관 응답', () => {
  it('칸 읽기', () => {
    const r = parseSeoji({ TOTAL_COUNT: '1', docs: [{ TITLE: '수학의 정석', AUTHOR: '홍성대', PUBLISHER: '성지출판', EA_ISBN: '9788988297', TITLE_URL: 'http://www.nl.go.kr/x.jpg', BOOK_TB_CNT_URL: '', PRE_PRICE: '23,000', PAGE: '512p', PUBLISH_PREDATE: '20240101' }] });
    expect(r).toEqual([{ title: '수학의 정석', author: '홍성대', publisher: '성지출판', isbn: '9788988297', cover: 'https://www.nl.go.kr/x.jpg', toc: '', price: 23000, pages: '512p', date: '20240101' }]);
  });
});
