// @vitest-environment jsdom
/**
 * The Reading Lens' word panel grades the keys the reader reads, by the same rule as the
 * dictionary popup (`shared/knowledgeKey` via `lexicon/knowledgeTargets`).
 *
 * It used to grade `lemmaOf(query)` — the FIRST content token — so grading 携帯電話 from
 * the Lens filed the level under 携帯 and said nothing about 電話, while the reader colours
 * the two parts separately.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRealKuromoji } from './helpers/realKuromoji';
import { getLevel, isManualLevel, resetKnownWordsCacheForTests, setLevel } from '../knownWords';
import { STUDY_LANG_KEY } from '../studyEnvironment';

let Panel: typeof import('../components/lens/LensReaderPanel').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await buildRealKuromoji();
  const api: Record<string, unknown> = {
    lookupTerm: async (term: string) => ({
      entries: [{ word: term, reading: '', isCommon: false, jlpt: [], senses: [{ definitions: ['x'] }] }],
    }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => ({});
    },
  });
  Panel = (await import('../components/lens/LensReaderPanel')).default;
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  resetKnownWordsCacheForTests();
  localStorage.setItem(STUDY_LANG_KEY, 'ja');
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await flush();
}

const panel = (query: string): ReactNode => (
  <Panel query={query} context={`${query}を使う。`} tokens={[]} x={100} y={100} onClose={() => undefined} />
);

const gradeButton = (index: number): HTMLButtonElement =>
  host.querySelectorAll<HTMLButtonElement>('.lens-reader-grade .wk-grade-btn')[index];

describe('Lens word panel grading', () => {
  it('grading 携帯電話 grades 携帯 and 電話 — not only the first token', async () => {
    await render(panel('携帯電話'));
    await act(async () => gradeButton(3).click());
    expect(getLevel('携帯')).toBe(3);
    expect(getLevel('電話')).toBe(3);
    expect(isManualLevel('電話')).toBe(true);
    // The compound itself has no level of its own.
    expect(getLevel('携帯電話')).toBe(0);
  });

  it('shows each part with its level, and the least-known part as the combined state', async () => {
    setLevel('携帯', 3);
    await render(panel('携帯電話'));
    const parts = [...host.querySelectorAll('.lens-reader-parts .wk-part')]
      .map((el) => [el.getAttribute('data-knowledge-part'), el.className]);
    expect(parts).toEqual([['携帯', 'wk-part wk-g-3'], ['電話', 'wk-part wk-g-0']]);
    expect(gradeButton(0).getAttribute('aria-pressed')).toBe('true');
    // A write elsewhere is picked up.
    await act(async () => setLevel('電話', 1));
    await flush();
    expect(gradeButton(1).getAttribute('aria-pressed')).toBe('true');
  });

  it('an inflected word grades its dictionary form, with no parts row', async () => {
    await render(panel('食べた'));
    await act(async () => gradeButton(2).click());
    expect(getLevel('食べる')).toBe(2);
    expect(getLevel('食べた')).toBe(0);
    expect(host.querySelector('.lens-reader-parts')).toBeNull();
  });

  it('Reset hands every graded part back to automatic', async () => {
    await render(panel('携帯電話'));
    await act(async () => gradeButton(3).click());
    const reset = host.querySelector<HTMLButtonElement>('.lens-reader-grade .wk-grade-reset');
    expect(reset).not.toBeNull();
    await act(async () => reset?.click());
    expect(isManualLevel('携帯')).toBe(false);
    expect(isManualLevel('電話')).toBe(false);
  });
});
