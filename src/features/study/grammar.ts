// 영어 어법 유형: 수능 · 모의고사 어법 문항(밑줄 친 부분 중 어법상 틀린 것 고르기)에서 따져 보는 문법 항목.
// 설명은 일반 영어 문법 규칙이다 (해마다 어느 유형이 몇 번 나왔는지 같은 통계는 넣지 않았다).
export interface GrammarType {
  key: string;
  name: string;
  /** 무엇을 보는지 */
  what: string;
  /** 밑줄을 만났을 때 확인할 것 */
  check: string[];
  /** 예 (맞는 문장 → 틀린 꼴) */
  example: string;
}

export const GRAMMAR_TYPES: GrammarType[] = [
  {
    key: 'agree',
    name: '주어 · 동사 수일치',
    what: '동사가 진짜 주어의 수(단수 · 복수)에 맞는지',
    check: ['주어와 동사 사이의 전치사구 · 관계절 · 분사구를 지우고 진짜 주어 찾기', '「the number of + 복수 명사」 는 단수, 「a number of + 복수 명사」 는 복수', '동명사 · to부정사 · 명사절 주어는 단수', '도치(장소 부사구 + 동사 + 주어)면 뒤에 오는 주어에 맞추기'],
    example: 'The key to the cabinets is lost. (× are)',
  },
  {
    key: 'verb',
    name: '동사 자리 · 준동사 자리',
    what: '한 절에 본동사가 있어야 하는지, 이미 있어서 준동사(to부정사 · 동명사 · 분사)가 와야 하는지',
    check: ['절(접속사 · 관계사로 묶인 덩어리)마다 본동사가 하나씩 있는지 세기', '본동사가 이미 있으면 밑줄은 준동사 자리', '본동사가 없으면 밑줄이 본동사가 돼야 함 (-ing · to 꼴이면 틀림)'],
    example: 'Students who study regularly tend to remember more. (× tending)',
  },
  {
    key: 'voice',
    name: '능동 · 수동',
    what: '주어(또는 꾸밈 받는 명사)가 그 동작을 하는지, 당하는지',
    check: ['뒤에 목적어가 있으면 보통 능동, 없으면 수동 의심 (3형식 동사 기준)', '자동사(happen, occur, appear, disappear, remain 등)는 수동태로 못 씀', '4 · 5형식 동사의 수동태는 뒤에 명사 · 보어가 남을 수 있음'],
    example: 'The accident happened last night. (× was happened)',
  },
  {
    key: 'participle',
    name: '현재분사 · 과거분사',
    what: '명사를 꾸미거나 보어 · 분사구문일 때 -ing(능동 · 진행) 와 p.p.(수동 · 완료) 중 무엇인지',
    check: ['꾸밈 받는 명사(분사구문이면 주절의 주어)가 하는 것인지 당하는 것인지', '감정 동사: 감정을 느끼는 쪽은 p.p.(bored), 감정을 일으키는 쪽은 -ing(boring)', '「with + 명사 + 분사」 도 명사와의 관계로 판단'],
    example: 'I found the movie boring. / I was bored. (× boring)',
  },
  {
    key: 'infinitive',
    name: 'to부정사 · 동명사',
    what: '동사 · 전치사 뒤에 to부정사가 오는지 동명사가 오는지',
    check: ['전치사(to 포함: look forward to, be used to, object to) 뒤에는 동명사', 'enjoy, avoid, finish, mind 등은 동명사 목적어', 'want, decide, hope, plan 등은 to부정사 목적어', 'remember · forget · stop · try 는 뜻에 따라 둘 다'],
    example: 'I look forward to seeing you. (× see)',
  },
  {
    key: 'relative',
    name: '관계대명사 · what · that',
    what: '앞에 꾸밀 명사(선행사)가 있는지, 뒤가 완전한 절인지 불완전한 절인지',
    check: ['what = 선행사 없음 + 뒤가 불완전 (주어 · 목적어가 빠짐)', 'which · who · that = 선행사 있음 + 뒤가 불완전', '접속사 that = 뒤가 완전한 절', '콤마(,) 뒤와 전치사 바로 뒤에는 관계대명사 that 을 못 씀'],
    example: 'This is what I wanted. / This is the book which I wanted. (× the book what)',
  },
  {
    key: 'reladv',
    name: '관계부사 · 「전치사 + 관계대명사」',
    what: '뒤가 완전한 절이면 관계부사(where · when · why · how) 나 「전치사 + which」, 불완전하면 관계대명사',
    check: ['선행사가 장소라도 뒤 절에 목적어가 빠졌으면 which', '「전치사 + which」 뒤는 완전한 절', 'the way 와 how 는 같이 쓰지 않음'],
    example: 'This is the house where I was born. / This is the house which I bought. (× where I bought)',
  },
  {
    key: 'conj',
    name: '접속사 · 전치사',
    what: '뒤에 절(주어 + 동사)이 오면 접속사, 명사(구)가 오면 전치사',
    check: ['because · although · while 뒤는 절', 'because of · despite · during 뒤는 명사(구)', '접속사 whether · if 와 that 의 쓰임 구별'],
    example: 'Although it rained, we went out. / Despite the rain, … (× Despite it rained)',
  },
  {
    key: 'parallel',
    name: '병렬 구조',
    what: 'and · but · or 나 both A and B, not A but B 로 이어진 것들의 꼴이 같은지',
    check: ['접속사 앞뒤를 같은 품사 · 같은 꼴로 (동사끼리, to부정사끼리, -ing 끼리)', '어느 것과 이어진 것인지 먼저 찾기 (가장 가까운 것이 아닐 수 있음)'],
    example: 'She likes reading, writing, and painting. (× to paint)',
  },
  {
    key: 'pronoun',
    name: '대명사 (수 · 재귀대명사)',
    what: '대명사가 가리키는 명사의 수에 맞는지, 주어 자신을 가리키면 재귀대명사인지',
    check: ['가리키는 명사를 찾아 단수(it · its) · 복수(they · their) 맞추기', '주어와 목적어가 같은 대상이면 -self', 'that / those 가 앞 명사를 되받을 때 수 맞추기'],
    example: 'The students did their homework. (× its)',
  },
  {
    key: 'adj',
    name: '형용사 · 부사',
    what: '보어 · 명사 꾸밈 자리면 형용사, 동사 · 형용사 · 문장 꾸밈 자리면 부사',
    check: ['감각동사(look, sound, feel, seem) · become · remain 뒤 보어는 형용사', '5형식 목적격 보어(make it possible)는 형용사', 'hard / hardly, late / lately 처럼 뜻이 다른 짝'],
    example: 'The soup tastes good. (× well)',
  },
  {
    key: 'compare',
    name: '비교 · 강조',
    what: '비교급 · 최상급 꼴과 비교 대상이 맞는지, 비교급 강조 부사(much, even, far, still, a lot)',
    check: ['비교급을 꾸밀 때 very 는 못 씀', 'as + 원급 + as', '비교 대상끼리 같은 종류인지 (that of · those of)'],
    example: 'This is much better than that. (× very better)',
  },
  {
    key: 'tense',
    name: '시제 · 가정법 · 조동사',
    what: '시간 표현과 시제가 맞는지, 가정법 꼴, 「조동사 + have p.p.」 의 뜻',
    check: ['ago · last · in 2020 같은 과거 시점과 현재완료는 함께 못 씀', '시간 · 조건 부사절(when, if)에서는 미래도 현재시제', '「should have p.p.」 = 했어야 했는데, 「must have p.p.」 = 했음이 틀림없다'],
    example: 'I saw him two days ago. (× have seen)',
  },
  {
    key: 'etc',
    name: '그 밖',
    what: '도치 · 강조 구문 · 관용 표현 · 어순 등',
    check: ['부정어(never, hardly, little)가 문장 앞에 오면 조동사 + 주어 어순', '간접의문문은 「의문사 + 주어 + 동사」 어순'],
    example: 'Never have I seen such a thing. (× Never I have seen)',
  },
];

export const grammarName = (key?: string) => GRAMMAR_TYPES.find((g) => g.key === key)?.name;

/** 영어 과목인지 (과목 이름에 「영어」 · English) */
export const isEnglish = (name?: string) => !!name && /영어|english/i.test(name);
