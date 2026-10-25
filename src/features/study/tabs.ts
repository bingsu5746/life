// 아래(폰)·왼쪽(PC) 메뉴의 칸들. 설정에서 칸을 숨길 수 있다 (오늘 칸은 빼고)
export const TABS = [
  { key: 'today', label: '오늘' },
  { key: 'exams', label: '시험' },
  { key: 'books', label: '문제집' },
  { key: 'preview', label: '예습' },
  { key: 'tutor', label: '과외' },
  { key: 'words', label: '영단어' },
  { key: 'translate', label: '번역' },
  { key: 'review', label: '복습' },
  { key: 'time', label: '기록' },
  { key: 'life', label: '할 일·습관', short: '할 일' },
] as const;
