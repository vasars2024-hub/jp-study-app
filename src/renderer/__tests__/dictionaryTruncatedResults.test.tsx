// @vitest-environment jsdom
//
// The surface half of the honest-truncation fix.
//
// The defect: the dictionary read is capped at eight entries and nothing on the
// page said so, so a first-eight-of-hundreds result rendered identically to a
// complete one and the ninth entry was unreachable. The fix is a row that states
// the page is a page, plus a control that asks for a larger one.
//
// Two things are asserted that a weaker test would skip: the row is driven by the
// result's own `truncated` flag and NOT by `entries.length`, and the button
// actually re-queries with a bigger limit rather than re-rendering the same page.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div className="anki-setup-stub" /> }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';
import { DICT_LOOKUP_LIMIT } from '../../shared/dictionaryLookup';

function entries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    word: `語${i}`,
    reading: `ご${i}`,
    isCommon: false,
    jlpt: [] as string[],
    senses: [{ partsOfSpeech: ['n'], definitions: [`sense ${i}`] }],
  }));
}

/** Records the limit every lookup asked for, so "Show more" can be proved. */
function stubApi(resultFor: (limit: number) => DictResult): { limits: number[] } {
  const limits: number[] = [];
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async (_q: string, limit?: number) => {
      limits.push(limit ?? -1);
      return resultFor(limit ?? DICT_LOOKUP_LIMIT);
    }),
    lookupChinese: vi.fn(async () => ({ query: '', entries: [] }) as DictResult),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    ankiMineNote: vi.fn(async () => ({ ok: true, noteId: 1 })),
    searchExamples: vi.fn(async () => ({ query: '', examples: [] })),
    dictConjugation: vi.fn(async () => ({ query: '', forms: [] })),
  };
  return { limits };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

/**
 * Re-render into the SAME root, which is what the query-change reset has to
 * survive. A second `createRoot` would mount a fresh component whose page size
 * starts at the default no matter what the old one was doing, so it would pass
 * against code that never resets at all.
 */
async function rerender(node: ReactNode): Promise<void> {
  await act(async () => {
    root?.render(node);
  });
}

describe('a truncated dictionary result', () => {
  it('says the list is a page and offers the rest', async () => {
    const api = stubApi((limit) => ({
      query: '語',
      entries: entries(Math.min(limit, DICT_LOOKUP_LIMIT)),
      truncated: true,
    }) as DictResult);

    await render(<DictionaryResults query="語" variant="page" lang="ja" />);

    expect(host.querySelector('.dict-truncated')).not.toBeNull();
    expect(host.querySelector('.dict-truncated')?.textContent)
      .toContain('dict.results.truncated');
    expect(api.limits).toEqual([DICT_LOOKUP_LIMIT]);
  });

  it('NEGATIVE CONTROL: a full page that is complete says nothing', async () => {
    // Same eight entries, same limit — only the flag differs. If the row were
    // driven by `entries.length === limit` it would appear here too, and it would
    // be lying on every word with exactly eight senses.
    stubApi(() => ({ query: '語', entries: entries(DICT_LOOKUP_LIMIT) }) as DictResult);

    await render(<DictionaryResults query="語" variant="page" lang="ja" />);

    expect(host.querySelectorAll('.dict-entry')).toHaveLength(DICT_LOOKUP_LIMIT);
    expect(host.querySelector('.dict-truncated')).toBeNull();
  });

  it('re-queries with a larger page when the reader asks for more', async () => {
    const api = stubApi((limit) => ({
      query: '語',
      entries: entries(Math.min(limit, 12)),
      ...(limit < 12 ? { truncated: true as const } : {}),
    }) as DictResult);

    await render(<DictionaryResults query="語" variant="page" lang="ja" />);

    const more = host.querySelector<HTMLButtonElement>('.dict-more-btn');
    expect(more, 'a truncated result must offer a way to the ninth entry').not.toBeNull();

    await act(async () => {
      more?.click();
    });

    // The second call asked for a real increase, and the surface grew because of
    // it. A button that re-rendered the same eight rows would pass neither.
    expect(api.limits).toHaveLength(2);
    expect(api.limits[1]).toBeGreaterThan(DICT_LOOKUP_LIMIT);
    expect(host.querySelectorAll('.dict-entry')).toHaveLength(12);
    // Nothing left to reach, so the row retires rather than offering more of it.
    expect(host.querySelector('.dict-truncated')).toBeNull();
  });

  it('starts a new query back at the first page', async () => {
    // The expanded page belongs to the word it was expanded for. Carrying it
    // over would make the next lookup silently more expensive, and the reset has
    // to happen without a second database read for the same word.
    const api = stubApi((limit) => ({
      query: '語',
      entries: entries(Math.min(limit, 40)),
      truncated: true,
    }) as DictResult);

    await render(<DictionaryResults query="語" variant="page" lang="ja" />);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.dict-more-btn')?.click();
    });
    expect(api.limits).toEqual([DICT_LOOKUP_LIMIT, 40]);

    await rerender(<DictionaryResults query="別" variant="page" lang="ja" />);

    // Exactly one further call: back at the default, and NOT the expanded page
    // followed by a corrective second read, which is what an effect-based reset
    // would have produced.
    expect(api.limits).toEqual([DICT_LOOKUP_LIMIT, 40, DICT_LOOKUP_LIMIT]);
  });
});
