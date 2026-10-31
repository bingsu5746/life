import { describe, expect, it } from 'vitest';
import { parseSeoji, parseYes24 } from './books';

describe('국립중앙도서관 응답', () => {
  it('칸 읽기', () => {
    const r = parseSeoji({ TOTAL_COUNT: '1', docs: [{ TITLE: '수학의 정석', AUTHOR: '홍성대', PUBLISHER: '성지출판', EA_ISBN: '9788988297', TITLE_URL: 'http://www.nl.go.kr/x.jpg', BOOK_TB_CNT_URL: '', PRE_PRICE: '23,000', PAGE: '512p', PUBLISH_PREDATE: '20240101' }] });
    expect(r).toEqual([{ title: '수학의 정석', author: '홍성대', publisher: '성지출판', isbn: '9788988297', cover: 'https://www.nl.go.kr/x.jpg', toc: '', price: 23000, pages: '512p', date: '20240101' }]);
  });
});

describe('예스24 응답 (문서 예시 모양)', () => {
  it('칸 읽기', () => {
    const r = parseYes24({
      success: true,
      data: {
        items: [
          {
            itemId: 12345678,
            title: '클린 코드',
            subTitle: '애자일',
            author: '로버트 C. 마틴',
            publisher: '인사이트',
            isbn13: '9788966260959',
            shopPrice: 33000,
            salePrice: 29700,
            publishDate: '2013-12-24',
            cover: 'https://image.yes24.com/goods/12345678/L',
            link: 'https://www.yes24.com/product/goods/12345678',
            pages: 584,
            contentDetail: { tableOfContents: '<B>1장 깨끗한 코드</b>\r\n\r\n2장 의미 있는 이름   ' },
          },
        ],
      },
    });
    expect(r[0]).toMatchObject({ src: 'yes24', title: '클린 코드 : 애자일', price: 33000, sale: 29700, pages: '584쪽', date: '20131224', cover: 'https://image.yes24.com/goods/12345678/L', tocText: '1장 깨끗한 코드\n2장 의미 있는 이름' });
  });
});
