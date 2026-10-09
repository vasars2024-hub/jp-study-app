// @vitest-environment jsdom
/**
 * gram2 — "Seen in your media": a grammar point found in the learner's own sentences
 * by the offline highlighter, by point id.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));

import { GRAMMAR } from '../data/grammar';
import { grammarSurfaceCore } from '../../shared/grammarPatternSurface';
import { localGrammarPointSpans, localGrammarReportedId } from '../localGrammarAnalysis';
import { findGrammarSightings, sightingRuns } from '../grammarSightings';
import { GrammarDetail } from '../components/grammar/GrammarContent';
import * as flashcardDeck from '../flashcardDeck';
import { recordLookup } from '../lookupHistory';

const point = GRAMMAR.find(
  (p) => p.lang === 'ja' && grammarSurfaceCore(p.title).length >= 4 && localGrammarReportedId(p) === p.id,
)!;
const core = grammarSurfaceCore(point.title);
const sentence = `ABC${core}。`;

describe('localGrammarPointSpans', () => {
  it('places the point where the highlighter colours it, and nowhere else', () => {
    expect(point).toBeTruthy();
    expect(localGrammarPointSpans(sentence, 'ja', point.id)).toEqual({
      sentence,
      spans: [{ start: 3, end: 3 + core.length }],
    });
    expect(localGrammarPointSpans('ABCDEF。', 'ja', point.id).spans).toEqual([]);
  });
});

describe('findGrammarSightings', () => {
  it('keeps matching sentences once each, with their source', () => {
    const found = findGrammarSightings(point, [
      { id: 'd1', sentence, source: 'deck', cardId: 'c1', word: 'w' },
      { id: 'd2', sentence: ` ${sentence} `, source: 'lookup' },
      { id: 'd3', sentence: 'ABCDEF。', source: 'lookup' },
    ]);
    expect(found.map((s) => [s.id, s.source])).toEqual([['d1', 'deck']]);
    expect(sightingRuns(found[0])).toEqual([
      { text: 'ABC', mark: false },
      { text: core, mark: true },
      { text: '。', mark: false },
    ]);
  });

  it('finds nothing for a point the highlighter can never report', () => {
    expect(findGrammarSightings({ id: 'x', title: 'に', lang: 'ja' }, [{ id: 'a', sentence: 'にににに', source: 'deck' }])).toEqual([]);
  });
});

describe('GrammarDetail — seen in your media', () => {
  let root: Root | null = null;
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('lists a sentence the learner looked a word up in, marked, with its source', async () => {
    vi.spyOn(flashcardDeck, 'loadDeck').mockReturnValue([]);
    recordLookup({ query: 'ABC', lemma: 'ABC', lang: 'ja', context: sentence });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<GrammarDetail point={point} />));
    const list = host.querySelector('.gram-examples-seen');
    expect(list?.querySelector('mark')?.textContent).toBe(core);
    expect(list?.textContent).toContain('gram2.seen.source.lookup');
  });
});
