/**
 * Round-2 J9: the palette's matcher was a scattered-subsequence scorer, so
 * "backup" matched "Wallpaper … background … upload" and ranked it first, and a
 * search for anything short matched most of the catalog. These pin the tiers.
 */
import { describe, expect, it } from 'vitest';
import { FUZZY_TIER, fuzzyScore, scoreLabelledItem as scorePaletteItem } from '../fuzzySearch';

const score = (q: string, hay: string) => fuzzyScore(q, hay);

describe('fuzzyScore tiers', () => {
  it('ranks exact > prefix > word-prefix > substring', () => {
    const exact = score('backup', 'Backup')!;
    const prefix = score('back', 'Backup & restore')!;
    const wordPrefix = score('restore', 'Backup & restore')!;
    const substring = score('ckup', 'Backup & restore')!;
    expect(exact).toBe(FUZZY_TIER.exact);
    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(FUZZY_TIER.allWordsPrefix);
  });

  it('never lets an in-tier penalty cross into the tier below', () => {
    const longPrefix = score('a', `a${'x'.repeat(5000)}`)!;
    const shortWordPrefix = score('b', 'a b')!;
    expect(longPrefix).toBeGreaterThan(shortWordPrefix);
  });

  it('drops pure scattered subsequences', () => {
    // The J9 case: every letter of "backup" appears in order, none adjacent.
    expect(score('backup', 'Wallpaper — background image upload')).toBeNull();
    expect(score('stg', 'Settings')).toBeNull();
    expect(score('xyz', 'Anything at all')).toBeNull();
  });

  it('matches multi-word queries word by word, in any order', () => {
    const inOrder = score('subtitle style', 'Subtitle style')!;
    const shuffled = score('style subtitle', 'Subtitle style and size')!;
    expect(inOrder).toBeGreaterThanOrEqual(FUZZY_TIER.prefix - 90);
    expect(shuffled).toBeGreaterThan(FUZZY_TIER.allWordsPrefix - 91);
    expect(shuffled).toBeLessThan(FUZZY_TIER.substring - 90);
    // One word missing: no match at all.
    expect(score('subtitle colour', 'Subtitle style and size')).toBeNull();
  });

  it('accepts a short acronym of consecutive word initials, and only that', () => {
    expect(score('ps', 'Playback speed')).toBeGreaterThan(0);
    expect(score('tf', 'Toggle furigana')).toBeGreaterThan(0);
    // Initials not in sequence, or a long "acronym", do not match.
    expect(score('fp', 'Playback speed')).toBeNull();
    expect(score('abcde', 'Alpha Beta Charlie Delta Echo')).toBeNull();
  });

  it('matches CJK text through the substring tier', () => {
    expect(score('散歩', 'そうですね。散歩に行きませんか？')).toBeGreaterThanOrEqual(FUZZY_TIER.substring - 90);
    expect(score('ましょう', '〜ましょう')).not.toBeNull();
  });

  it('treats camelCase humps as word starts', () => {
    expect(score('style', 'subtitleStyle')).toBeGreaterThan(FUZZY_TIER.substring);
  });

  it('empty query matches everything with score 0', () => {
    expect(score('', 'x')).toBe(0);
    expect(score('   ', 'x')).toBe(0);
  });
});

describe('palette ranking', () => {
  it('ranks a label match above a keyword-only match ("backup")', () => {
    const backup = scorePaletteItem('backup', {
      label: 'Backup & restore',
      sub: 'Setting · Files',
      terms: 'backup export import restore',
    });
    const keywordOnly = scorePaletteItem('backup', {
      label: 'Connection profiles',
      sub: 'Setting · Scraper',
      terms: 'import export backup portable json',
    });
    const wallpaper = scorePaletteItem('backup', {
      label: 'Wallpaper',
      sub: 'Add widget · Personalization',
      terms: 'background image upload',
    });
    expect(backup).not.toBeNull();
    expect(keywordOnly).not.toBeNull();
    expect(backup!).toBeGreaterThan(keywordOnly!);
    expect(wallpaper).toBeNull();
  });

  it('caps hidden-text matches below any label word match', () => {
    // Even an exact keyword is only "a word in a bag of phrases".
    const exactTerm = scorePaletteItem('zoom', { label: 'Display', terms: 'zoom' })!;
    const labelWord = scorePaletteItem('zoom', { label: 'Reset display zoom' })!;
    expect(labelWord).toBeGreaterThan(exactTerm);
    expect(exactTerm).toBeLessThanOrEqual(FUZZY_TIER.wordPrefix);
  });
});
