// 책 찾기: 국립중앙도서관 ISBN 서지정보 API (www.nl.go.kr/seoji/SearchApi.do, 키 cert_key).
// 응답 칸(이 API 안내 페이지 N31101030500 에서 확인): TITLE · AUTHOR · PUBLISHER · EA_ISBN · TITLE_URL(표지) · BOOK_TB_CNT_URL(목차) · PRE_PRICE(정가) · PAGE · PUBLISH_PREDATE · SUBJECT
import { within } from './nba';

export interface BookHit {
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  cover: string;
  toc: string;
  price: number;
  pages: string;
  date: string;
}
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

export function parseSeoji(j: unknown): BookHit[] {
  const o = j as Record<string, unknown>;
  // 목록 칸 이름은 docs (대소문자 다를 수 있어 둘 다)
  const list = (Array.isArray(o?.docs) ? o.docs : Array.isArray(o?.DOCS) ? o.DOCS : []) as Record<string, unknown>[];
  return list
    .map((x) => ({
      title: s(x.TITLE),
      author: s(x.AUTHOR),
      publisher: s(x.PUBLISHER),
      isbn: s(x.EA_ISBN) || s(x.SET_ISBN),
      cover: /^https?:\/\//.test(s(x.TITLE_URL)) ? s(x.TITLE_URL).replace(/^http:/, 'https:') : '',
      toc: /^https?:\/\//.test(s(x.BOOK_TB_CNT_URL)) ? s(x.BOOK_TB_CNT_URL).replace(/^http:/, 'https:') : '',
      price: Number(s(x.PRE_PRICE).replace(/[^\d]/g, '')) || 0,
      pages: s(x.PAGE),
      date: s(x.PUBLISH_PREDATE),
    }))
    .filter((x) => x.title);
}

export async function seojiSearch(key: string, q: string): Promise<BookHit[]> {
  const isbn = /^[\d-]{10,17}$/.test(q) ? q.replace(/-/g, '') : '';
  const p = new URLSearchParams({ cert_key: key, result_style: 'json', page_no: '1', page_size: '20', ...(isbn ? { isbn } : { title: q }) });
  const res = await within(fetch(`https://www.nl.go.kr/seoji/SearchApi.do?${p}`), 15_000, '국립중앙도서관');
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (j?.RESULT === 'ERROR') throw new Error(`국립중앙도서관: ${s(j.ERR_MESSAGE)}`);
  if (!res.ok) throw new Error(`국립중앙도서관 ${res.status}`);
  return parseSeoji(j);
}

/** 목차 글 (BOOK_TB_CNT_URL 이 가리키는 글. 국립중앙도서관 주소만) */
export async function seojiToc(url: string): Promise<string> {
  const u = new URL(url);
  if (!/(^|\.)nl\.go\.kr$/.test(u.hostname)) throw new Error('목차 주소가 올바르지 않아요');
  const res = await within(fetch(u.toString()), 15_000, '목차');
  if (!res.ok) throw new Error(`목차 ${res.status}`);
  const t = await res.text();
  return t
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 8000);
}
