// @vitest-environment node
import { expect, it } from 'vitest';
import { parsePracticeDeepLink } from '../components/grammar/GrammarContent';

it('preserves an exact Study grammar-pattern query in the Practice deep link', () => {
  expect(parsePracticeDeepLink({
    lang: 'ja',
    level: 'N4',
    query: '〜ことがある',
    pointId: 'n4-koto-ga-aru',
  })).toEqual({
    lang: 'ja',
    levels: ['N4'],
    query: '〜ことがある',
  });
});

it('ignores non-string query payloads', () => {
  expect(parsePracticeDeepLink({ query: ['〜ことがある'] })).toEqual({});
});
