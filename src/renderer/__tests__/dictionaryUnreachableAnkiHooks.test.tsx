// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

/**
 * Regression: with AnkiConnect unreachable, one click on "+ Add to Anki" used to take down the
 * whole desktop shell.
 *
 * `addToAnki` calls `ensureAnki`, which calls `ankiStatus()`; a disconnected reply sets
 * `showSetup`. `DictionaryResults` then took its `showSetup` early return — which sat ABOVE the
 * `knowledge` `useMemo` — so that render ran one hook fewer than the render before it. React threw
 * "Rendered fewer hooks than expected", `AppErrorBoundary` recreated the tree from scratch, and
 * every floating window on the desk disappeared.
 *
 * Measured live, not inferred: `userData/profiles.json`'s `ankiUrl` was repointed to
 * `http://127.0.0.1:1` (a closed loopback port, so the connection is refused rather than hanging),
 * the app restarted around the edit because main does not hot-reload, and one bridge click on the
 * button took the desk from four `.fwin` windows to zero. After the hoist the same click leaves all
 * four standing and the surface renders "Can't reach Anki. Open Anki desktop and make sure the
 * AnkiConnect add-on is installed." with 0 raw i18n keys.
 *
 * The guard is the RENDER ORDER, so this test asserts on the transition — one render connected,
 * the next disconnected, in the same mounted component. Asserting only the disconnected end state
 * would pass against the broken code, because a component that mounts straight into `showSetup`
 * never changes its hook count.
 */
vi.mock('../components/AnkiSetup', () => ({
  default: () => <div className="anki-setup-stub">setup</div>,
}));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';

const ENTRY = {
  word: '食べる',
  reading: 'たべる',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'] }],
};

/** Flips on the second call, reproducing "Anki was up, then the click found it gone". */
function stubApi(): { calls: () => number } {
  const result: DictResult = { query: '食べる', entries: [ENTRY] } as DictResult;
  let n = 0;
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => {
      n += 1;
      return n === 1
        ? { connected: true, decks: ['JP Study'], models: ['Basic'] }
        : { connected: false, decks: [], models: [], error: "Can't reach Anki." };
    }),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    ankiMineNote: vi.fn(async () => ({ ok: true, noteId: 1 })),
    searchExamples: vi.fn(async () => ({ query: '食べる', examples: [] })),
    // 食べる is conjugatable, so `ConjugationTable` reaches for this one. The word has to stay
    // conjugatable — a non-conjugating headword would skip the very render path under test.
    dictConjugation: vi.fn(async () => ({ query: '食べる', forms: [] })),
  };
  return { calls: () => n };
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

describe('Dictionary against an unreachable AnkiConnect', () => {
  it('switches to the setup panel without changing its hook count', async () => {
    // React reports a hooks-order violation through console.error before the boundary sees it, so
    // the assertion is on what React itself said, not on a rethrow the test harness may swallow.
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    stubApi();
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);

    // Rendered normally first: the results are up and the setup panel is not.
    expect(host.querySelector('.anki-setup-stub')).toBeNull();

    const add = [...host.querySelectorAll('button')].find((b) =>
      /dict\.results\.add|add to anki/i.test(b.textContent || ''),
    );
    expect(add, 'the "+ Add to Anki" button must be on screen to drive this').not.toBeUndefined();

    await act(async () => {
      add?.click();
    });

    // The surface swapped to setup — the honest response to a refused endpoint.
    expect(host.querySelector('.anki-setup-stub')).not.toBeNull();

    // And it did so without React losing its place. This is the actual regression.
    const hookErrors = errors.filter((e) => /fewer hooks|Rendered more hooks|order of Hooks/i.test(e));
    expect(hookErrors, `React reported a hooks-order violation: ${hookErrors[0] ?? ''}`).toEqual([]);

    spy.mockRestore();
  });
});
