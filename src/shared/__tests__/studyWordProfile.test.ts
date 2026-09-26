import { describe, expect, it } from 'vitest';
import {
  buildStudyWordProfile,
  isStudyWordProfile,
  profileLemmas,
  profileScoredTokens,
  segmentedProfileTokens,
} from '../studyWordProfile';
import { scoreComprehensibility } from '../comprehensibility';

describe('study word profiles', () => {
  it('keeps only content words, counted, and scores exactly like the token stream', () => {
    const tokens = [
      { lemma: '猫', content: true },
      { lemma: 'が', content: false },
      { lemma: '食べる', content: true },
      { lemma: '猫', content: true },
      { lemma: '東京', content: true, proper: true },
    ];
    const profile = buildStudyWordProfile(tokens, 'ja');
    expect(profile.words).toEqual([
      ['猫', 2, 0],
      ['食べる', 1, 0],
      ['東京', 1, 1],
    ]);
    const levels: Record<string, 0 | 1 | 2 | 3> = { 猫: 3 };
    const level = (w: string) => levels[w] ?? 0;
    expect(scoreComprehensibility(profileScoredTokens(profile), level)).toEqual(scoreComprehensibility(tokens, level));
    expect(profileLemmas(profile)).toEqual(['猫', '猫', '食べる']);
    expect(isStudyWordProfile(profile)).toBe(true);
    expect(isStudyWordProfile({ v: 0, lang: 'ja', words: [] })).toBe(false);
  });

  it('segments Chinese into Han words and drops punctuation and Latin', () => {
    const words = segmentedProfileTokens('今天天气很好。OK 123', 'zh').map((t) => t.lemma);
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => /\p{Script=Han}/u.test(w))).toBe(true);
    expect(words.join('')).toContain('天气');
  });

  it('folds Russian case and stress so one written form is one entry', () => {
    const profile = buildStudyWordProfile(segmentedProfileTokens('Книга, кни́га и книгу.', 'ru'), 'ru');
    const byWord = Object.fromEntries(profile.words.map(([w, n]) => [w, n]));
    expect(byWord['книга']).toBe(2);
    expect(byWord['книгу']).toBe(1);
    // The scorer maps each form to the learner's key at scoring time.
    const keys = [...profileScoredTokens(profile, (w) => w.slice(0, 4))].map((t) => t.lemma);
    expect(new Set(keys)).toEqual(new Set(['книг', 'и']));
  });
});
