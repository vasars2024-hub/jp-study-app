// @vitest-environment jsdom
/**
 * L5 — which Translate regions adopted the contextual primitive, and which
 * deliberately did not.
 *
 * Third stop on L5's order (Dictionary → Grammar → Translate → Agent), same shape
 * as its two siblings: exactly one region is a contextual tool — the intro line,
 * the tab bar and the direction toggle — and everything below it is dense work.
 *
 * `.tr-actions` is the one that could plausibly have gone either way, and it stays
 * plain on purpose: it carries the busy status and the error line, and §2.3's
 * "honest states" requirement makes a translucent error a legibility risk rather
 * than a contextual tool. Pinned here so it reads as a decision.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../components/SentenceAnalysisPanel', () => ({
  default: () => <div data-testid="analysis" />,
}));
vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({
  default: () => <div data-testid="results" />,
}));
vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: vi.fn(async () => ({ ok: true, handoff: null })),
  onLexiconHandoffStaged: vi.fn(() => () => undefined),
}));

vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
  Toolbar: ({ children }: { children: ReactNode }) => <>{children}</>,
  ToolbarSpacer: () => null,
  useAeroMaterials: () => false,
}));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

import TranslateView from '../views/TranslateView';

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
  await act(async () => created.render(<TranslateView />));
  return host;
}

describe('Translate — contextual region adoption', () => {
  it('gives the view head the contextual role', async () => {
    const host = await mount();
    const head = must(host.querySelector('.view-head'), '.view-head');
    expect(head.classList.contains('lq-contextual'), '.view-head is contextual').toBe(true);
    expect(head.getAttribute('data-lq-role')).toBe('contextual');
    // The direction toggle is what makes it a tool rather than a caption.
    expect(head.querySelector('.tr-dir'), 'the direction toggle inside the head').not.toBeNull();
  });

  it('does NOT give it lq-liquid, which would paint in conventional windows too', async () => {
    const host = await mount();
    // §2 non-negotiable 1: conventional presentation is the default. `lq-liquid`
    // paints unconditionally; `lq-contextual` is inert until `.fwin-liquid` opts in.
    expect(host.querySelectorAll('.lq-liquid').length).toBe(0);
    expect(host.querySelectorAll('.lq-contextual').length).toBe(1);
  });

  it('keeps the editing panes, the action row and the analysis outside it', async () => {
    const host = await mount();
    // Asserted first, so that removing the contextual surface altogether cannot
    // make this pass vacuously.
    expect(host.querySelectorAll('.lq-contextual').length).toBe(1);
    for (const sel of ['.tr-panes', '.tr-textarea', '.tr-output', '.tr-actions']) {
      const el = must(host.querySelector(sel), sel);
      expect(el.closest('.lq-contextual'), `${sel} is outside every contextual surface`).toBeNull();
    }
    const analysis = must(host.querySelector('[data-testid="analysis"]'), 'the analysis panel');
    expect(analysis.closest('.lq-contextual')).toBeNull();
  });
});
