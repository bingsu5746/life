// 수행평가 준비 나누기: 남은 준비를 오늘부터 내는 날 전날까지 고르게 나눈다.
// 날마다 새로 계산하므로 하루 밀리면 남은 날에 다시 나뉜다.
import { addDays, diffDays } from './dates';
import type { Assessment, DateStr, Id } from './model';

export function stepDates(a: Pick<Assessment, 'due' | 'steps'>, today: DateStr): Map<Id, DateStr> {
  const left = a.steps.filter((s) => !s.done);
  const days = Math.max(1, diffDays(today, a.due));
  const out = new Map<Id, DateStr>();
  left.forEach((s, i) => out.set(s.id, a.due <= today ? today : addDays(today, Math.floor((i * days) / left.length))));
  return out;
}

/** 수행평가 종류에 맞는 준비 단계 (제목 낱말로 고른다). 내는 날에서 거꾸로 나눠 날짜가 붙는다 */
export function autoSteps(title: string): string[] {
  const t = title.replace(/\s/g, '');
  if (/발표|프레젠테이션|PPT|말하기|스피치|토론/i.test(t)) return ['주제 정하기', '자료 찾기', '발표 자료(PPT) 만들기', '대본 쓰기', '발표 연습 1', '발표 연습 2 (시간 재기)'];
  if (/실험|탐구보고/.test(t)) return ['실험 주제 · 가설 정하기', '준비물 · 방법 정리', '실험하기 · 결과 기록', '결과 분석 · 그래프', '보고서 쓰기', '최종 점검'];
  if (/보고서|감상문|소논문|에세이|논술|글쓰기|독후감|서평|쓰기/.test(t)) return ['주제 정하기', '자료 조사', '개요 짜기', '초안 쓰기', '고쳐 쓰기', '최종 점검 · 맞춤법'];
  if (/그리기|만들기|작품|포스터|모형|미술|디자인/.test(t)) return ['아이디어 · 스케치', '재료 준비', '만들기 1', '만들기 2', '마무리 · 설명 쓰기'];
  if (/노래|가창|연주|실기|체육|줄넘기|댄스|춤/.test(t)) return ['곡 · 동작 정하기', '연습 1', '연습 2', '연습 3 (녹화해 보기)', '최종 연습'];
  if (/단어|듣기|암기|시험|퀴즈|쪽지/.test(t)) return ['범위 확인', '1회 훑어보기', '외우기', '스스로 시험 보기', '틀린 것 다시'];
  return ['할 일 · 기준 확인', '자료 준비', '하기 1', '하기 2', '최종 점검'];
}
