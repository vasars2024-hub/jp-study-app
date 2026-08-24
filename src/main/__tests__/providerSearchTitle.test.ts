import { describe, expect, it } from 'vitest';

import { providerSearchTitle } from '../../shared/mediaFileIdentity';

/**
 * `seriesTitle` is written once, at import time, by whatever parser was running
 * then. When it keeps release noise, every provider search is narrowed to the
 * one release the item was made from — measured live on 2026-08-24: the nyaa
 * listing for `JoJo … Ougon no Kaze 39-END` returned "Of 1 release matching it,
 * 1 is neither a subtitle pack nor a batch with separately-fetchable files."
 */
describe('providerSearchTitle', () => {
  it('drops an episode range the stored title kept', () => {
    expect(providerSearchTitle('JoJo no Kimyou na Bouken - Ougon no Kaze 39-END'))
      .toBe('JoJo no Kimyou na Bouken - Ougon no Kaze');
  });

  it('leaves a clean series title exactly as stored', () => {
    // The negative control for the whole helper: the common case must be a
    // no-op, or every search in the app changes meaning.
    for (const title of ['The Big O', 'Cowboy Bebop', 'Ghost in the Shell: Stand Alone Complex', '鬼滅の刃']) {
      expect(providerSearchTitle(title)).toBe(title);
    }
  });

  it('drops a plain episode range too', () => {
    expect(providerSearchTitle('The Big O 01-26')).toBe('The Big O');
    expect(providerSearchTitle('Dragon Ball GT 1-64')).toBe('Dragon Ball GT');
    expect(providerSearchTitle('Kimetsu no Yaiba - 01~26')).toBe('Kimetsu no Yaiba');
  });

  it('keeps a numeric title the parser would otherwise read as an episode', () => {
    // `Mob Psycho 100` is the parser's own documented trap; a helper that
    // returned `Mob Psycho` here would search for a different show. The rule
    // never matches a bare trailing number, which is what protects these.
    for (const title of ['Mob Psycho 100', 'Steins;Gate 0', 'Ghost in the Shell 2', 'Kingdom 3']) {
      expect(providerSearchTitle(title)).toBe(title);
    }
  });

  it('keeps a four-digit span that is a year range, not an episode range', () => {
    expect(providerSearchTitle('Gundam 0079-0080')).toBe('Gundam 0079-0080');
  });

  it('ignores a parse that rewrites rather than trims', () => {
    // Only a genuine prefix is taken. Anything else — a parser that reorders or
    // substitutes — is discarded in favour of what the library actually stores.
    const stored = '[Group] Kimi no Na wa';
    expect(providerSearchTitle(stored).startsWith('[Group]') || providerSearchTitle(stored) === stored
      || stored.toLowerCase().startsWith(providerSearchTitle(stored).toLowerCase())).toBe(true);
  });

  it('never returns empty for a title that is not empty', () => {
    for (const title of ['1080p', '[SubsPlease]', '- 01 -', 'S01E01']) {
      expect(providerSearchTitle(title).length).toBeGreaterThan(0);
    }
  });

  it('passes an empty or blank title through unchanged', () => {
    expect(providerSearchTitle('')).toBe('');
    expect(providerSearchTitle('   ')).toBe('');
  });
});
