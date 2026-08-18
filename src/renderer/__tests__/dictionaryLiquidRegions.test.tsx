// @vitest-environment jsdom
/**
 * L5 — which Dictionary regions adopted the contextual primitive, and which
 * deliberately did not.
 *
 * The measurement that drove this (`probes/l1-surface-roles.js`, live on the Liquid
 * Dictionary window with 食べる results): rubric category 3 read
 * `liquidTreatedEligible` **1 of 9**. Eight navigation/contextual regions had no
 * Liquid treatment at all, so §2.3's "Liquid is FOR navigation, transport,
 * contextual tools and temporary inspectors" was carried by one region.
 *
 * Two of those eight are genuinely contextual and adopt here. The rest are
 * disclosure containers (`details.lexicon-*`, `.dict-examples`) that hold dense
 * reading content once opened — the probe classifies them eligible only because it
 * measures them collapsed. §2.3 keeps dense work opaque, so they stay plain, and
 * this file pins that as a decision rather than leaving it as an omission someone
 * later "completes".
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: vi.fn(async () => ({ ok: true, handoff: null })),
  onLexiconHandoffStaged: vi.fn(() => () => undefined),
}));

vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({
  default: ({ query }: { query: string }) => <div data-testid="results">{query}</div>,
}));

vi.mock('../components/lexicon/NotesBrowser', () => ({
  default: () => <div data-testid="notes" />,
}));

vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
}));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../studyEnvironment', () => ({
  STUDY_LANG_KEY: 'jp-study-language',
  getStudyLang: () => 'ja',
  setStudyLang: () => undefined,
  onStudyLangChanged: () => () => undefined,
}));

import DictionaryView from '../views/DictionaryView';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

/** Narrows without a non-null assertion, and names what was missing when it is. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to be present`);
  return value;
}

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created;
  await act(async () => created.render(<DictionaryView />));
  return host;
}

describe('Dictionary — contextual region adoption', () => {
  it('gives the view head and the saved searches the contextual role', async () => {
    const host = await mount();
    for (const sel of ['.view-head', '.dict-saved-searches']) {
      const el = must(host.querySelector(sel), sel);
      expect(el.classList.contains('lq-contextual'), `${sel} is contextual`).toBe(true);
      expect(el.getAttribute('data-lq-role')).toBe('contextual');
    }
  });

  it('does NOT give them lq-liquid, which would paint in conventional windows too', async () => {
    const host = await mount();
    // §2 non-negotiable 1: conventional presentation is the default. `lq-liquid`
    // paints unconditionally; `lq-contextual` is inert until `.fwin-liquid` opts in.
    expect(host.querySelectorAll('.lq-liquid').length).toBe(0);
    expect(host.querySelectorAll('.lq-contextual').length).toBe(2);
  });

  it('leaves the search form plain — a form is dense work, not a contextual tool', async () => {
    const host = await mount();
    const form = must(host.querySelector('form.dict-search'), 'form.dict-search');
    expect(form.classList.contains('lq-contextual')).toBe(false);
    expect(form.closest('.lq-contextual')).toBeNull();
  });

  it('keeps the results region outside every contextual surface', async () => {
    const host = await mount();
    // Drive the dominant task the way the view does: type, submit, and the
    // workbench mounts. A results list inside a contextual surface would be dense
    // work on translucent material — the number category 3 requires to be 0.
    const form = must(host.querySelector('form.dict-search'), 'form.dict-search');
    const input = must(host.querySelector<HTMLInputElement>('form.dict-search input'), 'the search input');
    const descriptor = must(
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'),
      "HTMLInputElement.prototype's 'value' descriptor",
    );
    // React installs its own setter on the element; assigning `.value` bypasses it
    // and the component never learns the field changed.
    const setter = must(descriptor.set, "the 'value' setter React installs over");
    await act(async () => {
      setter.call(input, '食べる');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    const results = must(host.querySelector('[data-testid="results"]'), 'the mounted workbench');
    expect(results.textContent).toBe('食べる');
    expect(results.closest('.lq-contextual')).toBeNull();
    const notes = must(host.querySelector('[data-testid="notes"]'), 'the notes browser');
    expect(notes.closest('.lq-contextual')).toBeNull();
  });
});
