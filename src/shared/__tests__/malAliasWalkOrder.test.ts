/**
 * The join between the two modules that decide which names a harvest searches.
 *
 * `parseAlternativeTitles` (shared/malSync.ts) emits `en`, then `ja`, then MAL's
 * free `synonyms`. `harvestSearchAliases` (shared/subtitleHarvest.ts) truncates
 * at `HARVEST_ALIAS_LIMIT` **by caller order**. Neither module knows about the
 * other, and the contract that makes the pair safe lives entirely in that
 * ordering — boss audit 2026-08-17's finding 3 asked for exactly this
 * ("prefer catalogue aliases over free synonyms"), and it is satisfied by
 * construction rather than by a guard, which is the shape that regresses in
 * silence.
 *
 * It is not a hypothetical budget. Measured on the user's own
 * `mal-library.json`: 1,373 anime rows carry aliases and the count histogram is
 * `{1:228, 2:388, 3:383, 4:220, 5:92, 6:38, 7:15, 8:6, 9:2, 10:1}`, so **374
 * rows carry more names than the walk can spend** and the order alone decides
 * which survive. The worst row is real, not invented: MAL 62405
 * `Fujimoto Tatsuki 17-26` lists ten synonyms that are the titles of ten
 * *different* one-shots.
 */
import { describe, expect, it } from 'vitest';
import { parseMalAnimeListPage } from '../malSync';
import { HARVEST_ALIAS_LIMIT, harvestSearchAliases } from '../subtitleHarvest';

/** One `/users/@me/animelist` row, shaped as MAL actually returns it. */
function listPage(node: Record<string, unknown>): unknown {
  return {
    data: [{ node, list_status: { status: 'completed', score: 5, num_episodes_watched: 1 } }],
    paging: {},
  };
}

/** Parse a row, then walk it exactly as `listNyaaHarvest` does. */
function namesSearchedFor(node: Record<string, unknown>): string[] {
  const entry = parseMalAnimeListPage(listPage(node)).entries[0];
  return harvestSearchAliases(entry.title, entry.altTitles ?? []);
}

describe('the names a harvest actually searches, parser through walk', () => {
  // The real MAL 62405 row, copied from the user's library rather than
  // paraphrased: its `synonyms` are ten other works, so which of them the walk
  // can reach is the whole question.
  const FUJIMOTO = {
    id: 62405,
    title: 'Fujimoto Tatsuki 17-26',
    alternative_titles: {
      en: 'Tatsuki Fujimoto 17-26',
      ja: '藤本タツキ17-26',
      synonyms: [
        'Niwa ni wa Niwa Niwatori ga Ita.',
        'Sasaki-kun ga Juudan Tometa',
        'Koi wa Moumoku',
        'Shikaku',
        'Ningyo Rhapsody',
        'Me ga Sametara Onnanoko ni Natteita Yamai',
        'Yogen no Nayuta',
        'Imouto no Ane',
      ],
    },
  };

  it('spends the whole budget on catalogue names before any free synonym', () => {
    expect(namesSearchedFor(FUJIMOTO)).toEqual([
      'Fujimoto Tatsuki 17-26',
      'Tatsuki Fujimoto 17-26',
      '藤本タツキ17-26',
      'Niwa ni wa Niwa Niwatori ga Ita.',
    ]);
  });

  it('never reaches the synonyms that are other works entirely', () => {
    const searched = namesSearchedFor(FUJIMOTO);
    // A first-hit walk that reached these would return another one-shot's
    // releases, and `looksLikeSameTitle` cannot catch it: that filter scores
    // results against the name it was asked about, so a release genuinely
    // called `Ningyo Rhapsody` passes.
    for (const other of ['Ningyo Rhapsody', 'Yogen no Nayuta', 'Imouto no Ane', 'Shikaku']) {
      expect(searched).not.toContain(other);
    }
    expect(searched).toHaveLength(HARVEST_ALIAS_LIMIT);
  });

  it('drops the native title when the order is reversed — the control that makes the order load-bearing', () => {
    // The assertion above passes for two different reasons: because the cap is
    // 4, or because the parser emits `en`/`ja` first. Only this separates them.
    // If `parseAlternativeTitles` were ever changed to spread `synonyms` before
    // `en`/`ja`, every assertion in this file except this one would still pass
    // while the walk quietly searched three unrelated one-shots.
    const synonymsFirst = harvestSearchAliases(FUJIMOTO.title, [
      ...FUJIMOTO.alternative_titles.synonyms,
      FUJIMOTO.alternative_titles.en,
      FUJIMOTO.alternative_titles.ja,
    ]);
    expect(synonymsFirst).toEqual([
      'Fujimoto Tatsuki 17-26',
      'Niwa ni wa Niwa Niwatori ga Ita.',
      'Sasaki-kun ga Juudan Tometa',
      'Koi wa Moumoku',
    ]);
    // Both catalogue names gone, and three unrelated one-shots in their place.
    expect(synonymsFirst).not.toContain('藤本タツキ17-26');
    expect(synonymsFirst).not.toContain('Tatsuki Fujimoto 17-26');
  });

  it('keeps the residual honest: a row with one catalogue name spends the rest on synonyms', () => {
    // MAL 1303 `The Animatrix`, also real. Its primary IS the English title, so
    // MAL publishes no `en`, and its `synonyms` are the names of its own
    // episodes. Two of them therefore enter the walk. This is a **statement of
    // what happens**, not a claim that it is guarded — asserting it means a
    // future fix has to update this test deliberately instead of believing the
    // case was already covered.
    const searched = namesSearchedFor({
      id: 1303,
      title: 'The Animatrix',
      alternative_titles: {
        ja: 'アニマトリックス',
        synonyms: ['Beyond', 'Detective Story', 'Matriculated', 'Program', 'World Record'],
      },
    });
    expect(searched).toEqual(['The Animatrix', 'アニマトリックス', 'Beyond', 'Detective Story']);
  });

  it('costs nothing for the 228 rows that carry a single alias', () => {
    const searched = namesSearchedFor({
      id: 2596,
      title: 'Shinreigari',
      alternative_titles: { en: 'Ghost Hound' },
    });
    // The motivating case of the whole alias walk, and it stays a two-request
    // listing: the cap is a ceiling, never a floor.
    expect(searched).toEqual(['Shinreigari', 'Ghost Hound']);
  });
});
