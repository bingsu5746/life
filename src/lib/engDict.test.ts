import { describe, expect, it } from 'vitest';
import { parseEnDict } from './engDict';

describe('parseEnDict', () => {
  it('발음 · 소리 · 뜻 · 예문 · 동의어를 모은다', () => {
    const e = parseEnDict([
      {
        word: 'hello',
        phonetic: 'həˈləʊ',
        phonetics: [{ text: 'həˈləʊ', audio: '//ssl.gstatic.com/dictionary/static/sounds/20200429/hello--_gb_1.mp3' }, { text: 'hɛˈləʊ' }],
        meanings: [
          { partOfSpeech: 'exclamation', definitions: [{ definition: 'used as a greeting.', example: 'hello there, Katie!', synonyms: [] }] },
          { partOfSpeech: 'noun', definitions: [{ definition: 'an utterance of “hello”; a greeting.' }], synonyms: ['greeting'] },
        ],
      },
    ]);
    expect(e).toEqual({
      word: 'hello',
      phonetic: 'həˈləʊ',
      audio: 'https://ssl.gstatic.com/dictionary/static/sounds/20200429/hello--_gb_1.mp3',
      senses: [
        { pos: 'exclamation', def: 'used as a greeting.', example: 'hello there, Katie!' },
        { pos: 'noun', def: 'an utterance of “hello”; a greeting.', example: undefined },
      ],
      synonyms: ['greeting'],
    });
  });
  it('없는 단어(배열 아님)는 null', () => {
    expect(parseEnDict({ title: 'No Definitions Found' })).toBeNull();
  });
});
