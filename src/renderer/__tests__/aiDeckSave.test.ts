// @vitest-environment jsdom
// jsdom because the deck store is localStorage-backed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AiEnrichmentResult } from '../../shared/mining';
import { saveAiResultsToDeck } from '../aiDeckSave';
import { loadDeck, replaceImportedDeck } from '../flashcardDeck';

const result = (expression: string, backs: string[]): AiEnrichmentResult =>
  ({
    expression,
    reading: `${expression}-reading`,
    meaning: `${expression}-meaning`,
    sentence: `${expression}を使った文。`,
    cards: backs.map((back) => ({ front: expression, back })),
  }) as unknown as AiEnrichmentResult;

beforeEach(() => {
  localStorage.clear();
});

describe('saveAiResultsToDeck', () => {
  it('flattens every card of every result, not one card per result', () => {
    const saved = saveAiResultsToDeck([result('猫', ['a', 'b']), result('犬', ['c'])], 'Studio');
    expect(saved).toBe(3);
    expect(loadDeck().map((card) => card.back).sort()).toEqual(['a', 'b', 'c']);
  });

  it('writes nothing and reports zero when there are no cards to save', () => {
    localStorage.setItem('probe', 'untouched');
    expect(saveAiResultsToDeck([], 'Studio')).toBe(0);
    expect(saveAiResultsToDeck([result('猫', [])], 'Studio')).toBe(0);
    expect(loadDeck()).toEqual([]);
    expect(localStorage.getItem('probe')).toBe('untouched');
  });

  it('names the group with an ai- prefix so it cannot collide with an EPUB import', () => {
    saveAiResultsToDeck([result('猫', ['a'])], 'Studio');
    const [card] = loadDeck();
    expect(card.bookId ?? '').toMatch(/^ai-/);
    expect(card.bookTitle).toBe('Studio');
    expect(card.source).toBe('epub-ai');
  });

  it('falls back to a default title rather than writing an unnamed group', () => {
    saveAiResultsToDeck([result('猫', ['a'])], '   ');
    expect(loadDeck()[0].bookTitle).toBe('AI card studio');
  });

  /**
   * The destructive half, pinned deliberately.
   *
   * `replaceImportedDeck` DELETES every card matching the `(bookId, bookTitle)`
   * pair before inserting. That is correct for a re-save — it updates in place
   * instead of duplicating — and it is exactly why `AiCardStudio.runGenerate`
   * must not call this on its own: two batches generated under the same preset
   * share a title, so an automatic save destroyed the earlier batch with no
   * confirmation and nothing to undo.
   */
  it('REPLACES the deck it saves into — the reason generation must not call it', () => {
    saveAiResultsToDeck([result('猫', ['first-batch'])], 'Studio');
    expect(loadDeck().map((card) => card.back)).toEqual(['first-batch']);

    saveAiResultsToDeck([result('犬', ['second-batch'])], 'Studio');
    const backs = loadDeck().map((card) => card.back);
    expect(backs).toEqual(['second-batch']);
    expect(backs).not.toContain('first-batch');
  });

  it('leaves a different deck title untouched when it replaces', () => {
    saveAiResultsToDeck([result('猫', ['keep-me'])], 'Other studio');
    saveAiResultsToDeck([result('犬', ['first'])], 'Studio');
    saveAiResultsToDeck([result('狐', ['second'])], 'Studio');
    expect(loadDeck().map((card) => card.back).sort()).toEqual(['keep-me', 'second']);
  });

  it('does not disturb a hand-made card that shares neither id nor title', () => {
    replaceImportedDeck('hand-made', 'My deck', [
      { word: 'x', reading: '', meaning: '', front: 'x', back: 'mine', source: 'dictionary' },
    ]);
    saveAiResultsToDeck([result('猫', ['ai'])], 'Studio');
    expect(loadDeck().map((card) => card.back).sort()).toEqual(['ai', 'mine']);
  });
});

/**
 * A source-level guard, in the same spirit as the catalog-hygiene checks in
 * `shared/__tests__/i18n.test.ts`.
 *
 * The property being protected is structural — "generating does not write" — and
 * there is no React test renderer in this project to assert it behaviourally.
 * Reading the source is the honest second choice: it states the invariant, and it
 * fails the moment someone puts the save call back where it was.
 */
describe('AiCardStudio generation does not write to the deck', () => {
  // Resolved from the project root, not from `import.meta.url`: this file runs
  // under jsdom, whose `URL` global is not node's, and `fs` rejects it.
  const source = readFileSync(
    resolve(process.cwd(), 'src/renderer/components/AiCardStudio.tsx'),
    'utf8',
  );

  it('found the component, so the assertions below are reading something', () => {
    expect(source).toContain('export default function AiCardStudio');
  });

  /**
   * Comments are removed before scanning. The comment left where the save call
   * used to be names `saveAiResultsToDeck` on purpose, and a *commented-out*
   * call must not satisfy the guard either — only real code counts.
   */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  function bodyOf(name: string): string {
    const start = source.indexOf(`async function ${name}(`);
    expect(start, `${name} not found — rename it here too`).toBeGreaterThan(-1);
    // Bounded by the next top-level `function` declaration at the same indent,
    // which is how every sibling in this component is written.
    const next = source.indexOf('\n  async function ', start + 1);
    const alt = source.indexOf('\n  function ', start + 1);
    const end = Math.min(next < 0 ? source.length : next, alt < 0 ? source.length : alt);
    return stripComments(source.slice(start, end));
  }

  it('does not save inside runGenerate', () => {
    expect(bodyOf('runGenerate')).not.toContain('saveAiResultsToDeck');
  });

  it('still offers the explicit save, so the fix removed a write and not the feature', () => {
    expect(source).toContain('saveAiResultsToDeck');
    expect(source).toContain('aiStudio.btn.saveFlash');
  });

  it('no longer promises a save in the text it shows after generating', () => {
    // The status string used to interpolate `{saved}`. Leaving that placeholder
    // in place would render it literally now that nothing is saved.
    expect(bodyOf('runGenerate')).not.toContain('saved');
  });
});
