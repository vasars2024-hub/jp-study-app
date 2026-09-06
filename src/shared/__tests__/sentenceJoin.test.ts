/**
 * The Anki surface's "Bound to <profile>" line renders, in order:
 *
 *   t('anki.boundTo') + label + ' — ' + description + t('anki.deckNoteType.subTail')
 *
 * and `subTail` OPENS with the terminator that closes the clause before it, so the
 * sentence still ends properly when a profile has no description. Every one of the
 * 28 seed descriptions is English data that already ends in '.', so the two collided
 * on screen in all four languages — measured live 2026-09-06 as
 * '…for learners with Chinese background.。デッキ・マッピング…' in ja and
 * '…background.. Switch profiles above…' in en.
 *
 * Neither existing guard sees this: `tools/i18n-check.cjs` compares catalog KEY SETS
 * and never composes two strings, and a raw-literal sweep reads both halves as
 * legitimately translated. What catches it is composing the real seed data against
 * the real catalogs, which is the second block below.
 *
 * Mutation control: replace `stripTrailingTerminator`'s body with `return text;` and
 * the composition block turns red for all 4 languages x 28 profiles, while the unit
 * block below turns red on exactly the two cases that name a terminator.
 */
import { describe, expect, it } from 'vitest';
import { ensureCatalog } from '../i18n/catalogs';
import { UI_LANGS } from '../i18n/core';
import { SEED_PROFILES } from '../seedProfiles';
import { stripTrailingTerminator } from '../sentenceJoin';

describe('stripTrailingTerminator', () => {
  it('drops one ASCII full stop and the whitespace after it', () => {
    expect(stripTrailingTerminator('Best default for JLPT vocab.')).toBe(
      'Best default for JLPT vocab',
    );
    expect(stripTrailingTerminator('Trailing space after. ')).toBe('Trailing space after');
  });

  it('drops an ideographic full stop', () => {
    expect(stripTrailingTerminator('日本語の説明。')).toBe('日本語の説明');
  });

  it('leaves text that does not end in a terminator alone', () => {
    expect(stripTrailingTerminator('No terminator here')).toBe('No terminator here');
    expect(stripTrailingTerminator('')).toBe('');
  });

  it('keeps ! and ? — a following ". " does not duplicate them', () => {
    expect(stripTrailingTerminator('Really?')).toBe('Really?');
    expect(stripTrailingTerminator('Careful!')).toBe('Careful!');
  });

  it('drops only ONE terminator, so an ellipsis keeps its shape', () => {
    expect(stripTrailingTerminator('and so on...')).toBe('and so on..');
  });
});

describe('the Bound-to line composes without a doubled terminator', () => {
  const profiles = Object.values(SEED_PROFILES);

  it('has seed descriptions to test with, and they do end in a terminator', () => {
    // Without this the block below would pass vacuously if the seed data ever
    // stopped carrying descriptions, or stopped ending in '.'.
    expect(profiles.length).toBeGreaterThanOrEqual(20);
    const withTerminator = profiles.filter((p) => /[.。]$/.test(p.description));
    expect(withTerminator.length).toBe(profiles.length);
  });

  for (const lang of UI_LANGS) {
    it(`renders one terminator per profile in ${lang}`, async () => {
      const catalog = await ensureCatalog(lang);
      const subTail = catalog['anki.deckNoteType.subTail'];
      expect(typeof subTail).toBe('string');
      // The rule this whole file exists for: the tail opens with the terminator.
      expect(subTail?.trimStart().startsWith('.') || subTail?.startsWith('。')).toBe(true);

      const doubled: string[] = [];
      for (const p of profiles) {
        const line = `${catalog['anki.boundTo']} ${p.label} — ${stripTrailingTerminator(
          p.description,
        )}${subTail}`;
        if (/\.\s*\.|\.。|。。|。\s*\./.test(line)) doubled.push(p.id);
      }
      expect(doubled).toEqual([]);
    });
  }
});
