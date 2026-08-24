// @vitest-environment jsdom
/**
 * Regression: "Retranslating…" for the 15 s a 1.2 GB GGUF takes to load.
 *
 * The Workbench's `retranslate()` is, in its own words, "the one place in the Workbench that
 * wakes the local model". On a cold start it spent ~15 s in `loadModel` before a single token
 * existed, and the button read `lexicon.retranslate.running` for all of it — indistinguishable
 * from a translation that is genuinely in progress, and from one that has hung. Rubric category 8,
 * and the fourth surface of the defect `1c874da9` (Dictionary examples) and `45cb990d`
 * (NovelReader's single-chapter button) already fixed.
 *
 * TWO STRUCTURAL CONSTRAINTS, both found by the assertions failing rather than by reasoning, and
 * both of which silently produce a GREEN test that measures nothing if ignored:
 *
 * 1. Its own FILE. `translator.ts` wires `window.api.onTranslateModelProgress` exactly once per
 *    module instance, on the first `translateTo`/`onModelProgress`. An earlier test in a shared
 *    file captures ITS stub, and this one's emitter is then attached to nothing.
 * 2. ONE `it` that exercises progress, for the same reason one level down: a second `it` in this
 *    file gets a fresh `emit` local that `translator.ts` never adopted, so `emit(...)` moves
 *    nothing and every label assertion reads the generic string — which is what a *passing*
 *    pre-fix run also reads. Both runs therefore live in the single case below.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../components/DictionaryResults', () => ({
  default: ({ query }: { query: string }) => <div data-testid="dictionary-results">{query}</div>,
}));

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));

vi.mock('../agentContextHandoff', () => ({
  handOffToAgent: vi.fn(),
  lexiconPassageAgentContext: (text: string) => ({ kind: 'reading-passage', preview: text }),
  routeAgentContext: (section: string, label: string) => ({ kind: 'route', section, label }),
}));

import LexiconWorkbenchResults from '../components/lexicon/LexiconWorkbenchResults';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** One matched token with two pinnable senses — the minimum that offers the retranslate control. */
const INTERLINEAR = {
  text: '猫を見た。',
  detectedLangs: ['ja'],
  glossLangs: ['en'],
  tokenCount: 2,
  matchedCount: 1,
  truncated: false,
  parts: [
    { kind: 'separator', text: '猫を', start: 0, end: 2 },
    {
      kind: 'token',
      text: '見た',
      start: 2,
      end: 4,
      match: {
        text: '見る',
        reading: 'みる',
        dictId: 'jmdict-en',
        dictTitle: 'JMdict (English)',
        headwordId: 3,
        glosses: [{ lang: 'en', text: 'to see' }, { lang: 'en', text: 'to look after' }],
        senses: [
          { index: 0, glosses: [{ lang: 'en', text: 'to see' }] },
          { index: 2, glosses: [{ lang: 'en', text: 'to look after' }] },
        ],
      },
    },
    { kind: 'separator', text: '。', start: 4, end: 5 },
  ],
};

describe('the retranslate button distinguishes a model load from a translation', () => {
  it('shows the load percentage, reverts on ready, and does not carry it into the next run', async () => {
    let emit: (p: { status?: string; progress?: number }) => void = () => undefined;
    /** Each run is held open so assertions land while the call is genuinely in flight. */
    let settle: (v: { ok: boolean; text: string }) => void = () => undefined;
    const translateRun = vi.fn(() => new Promise<{ ok: boolean; text: string }>((r) => {
      settle = r;
    }));

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        lookupOfflineInterlinear: vi.fn().mockResolvedValue(INTERLINEAR),
        translateRun,
        onTranslateModelProgress: (cb: (p: { status?: string; progress?: number }) => void) => {
          emit = cb;
          return () => undefined;
        },
        onTranslatePartial: () => () => undefined,
      },
    });

    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<LexiconWorkbenchResults query="猫を見た。" lang="ja" lookupAttempt={11} />);
      await Promise.resolve();
    });

    // Pin the second sense, which is what makes the retranslate control appear at all.
    await act(async () => {
      host.querySelector('.lexicon-sense-token')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      [...host.querySelectorAll('.lexicon-sense-list button')][2]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const button = () => host.querySelector<HTMLButtonElement>('.lexicon-retranslate-run');
    expect(button()?.textContent).toBe('lexicon.retranslate.action');

    await act(async () => {
      button()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    // Nothing reported yet: the honest label is the generic one, not a fabricated 0%.
    expect(button()?.textContent).toBe('lexicon.retranslate.running');

    await act(async () => {
      emit({ status: 'progress', progress: 45 });
      await Promise.resolve();
    });
    expect(button()?.textContent).toBe('lexicon.retranslate.loadingModel:45');

    // `ready` means the weights are in and real work has started — back to the generic label
    // rather than a percentage frozen at 100.
    await act(async () => {
      emit({ status: 'ready' });
      await Promise.resolve();
    });
    expect(button()?.textContent).toBe('lexicon.retranslate.running');

    await act(async () => {
      settle({ ok: true, text: 'I looked after the cat.' });
      await Promise.resolve();
    });
    expect(host.querySelector('.lexicon-retranslate-output p')?.textContent)
      .toBe('I looked after the cat.');
    expect(button()?.textContent).toBe('lexicon.retranslate.action');

    // Run 2 FAILS mid-load, without ever reaching `ready`. This is the only path on which the
    // percentage survives the run — and finding that cost four mutation controls that all passed:
    // a run ending progress→ready→done is cleared by the `ready` branch above, so on that path
    // BOTH `setRetranslateModelPct(null)` calls are dead code and nothing here can kill them.
    await act(async () => {
      button()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      emit({ status: 'progress', progress: 30 });
      await Promise.resolve();
    });
    expect(button()?.textContent).toBe('lexicon.retranslate.loadingModel:30');
    await act(async () => {
      settle({ ok: false, text: '' });
      await Promise.resolve();
    });
    expect(host.querySelector('.lexicon-retranslate-error')).not.toBeNull();

    // Run 3. Opening on run 2's 30% would report a number nobody measured — the class of
    // dishonest state category 8 scores.
    await act(async () => {
      button()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(translateRun).toHaveBeenCalledTimes(3);
    expect(button()?.textContent).toBe('lexicon.retranslate.running');
  });
});
