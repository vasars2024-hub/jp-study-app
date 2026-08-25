// @vitest-environment jsdom
/**
 * L5 — which Grammar regions adopted the contextual primitive, and which
 * deliberately did not.
 *
 * Second stop on L5's own order (Dictionary → Grammar → Translate → Agent), and
 * the same shape as `dictionaryLiquidRegions.test.tsx`: exactly one region is a
 * contextual tool — the intro line plus the four-way mode switch — and everything
 * the switch selects is dense work. A grammar point's prose, a practice form, a
 * curation table and a guides browser are the four things §2.3 names as belonging
 * on stable opaque anchors, so they stay plain, and this file pins that as a
 * decision rather than leaving it as an omission someone later "completes".
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../components/grammar/GrammarExplorer', () => ({
  default: () => <div data-testid="explorer" />,
}));
vi.mock('../components/grammar/GrammarPracticePanel', () => ({
  default: () => <div data-testid="practice" />,
}));
vi.mock('../components/grammar/GrammarCurationPanel', () => ({
  default: () => <div data-testid="curation" />,
}));
vi.mock('../components/grammar/GrammarContent', () => ({
  GrammarDetail: () => null,
  GuidesBrowser: () => <div data-testid="guides" />,
  parsePracticeDeepLink: () => null,
}));

vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
  useAeroMaterials: () => false,
  useWiredMaterials: () => false,
}));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../pendingHandoff', () => ({
  clearHandoff: () => undefined,
  takeHandoffJson: () => null,
}));

import GrammarView from '../views/GrammarView';

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
  await act(async () => created.render(<GrammarView />));
  return host;
}

describe('Grammar — contextual region adoption', () => {
  it('gives the view head the contextual role', async () => {
    const host = await mount();
    const head = must(host.querySelector('.view-head'), '.view-head');
    expect(head.classList.contains('lq-contextual'), '.view-head is contextual').toBe(true);
    expect(head.getAttribute('data-lq-role')).toBe('contextual');
    // The mode switch is what makes it contextual rather than decorative.
    expect(head.querySelectorAll('button.gram-mode-btn').length).toBe(4);
  });

  it('does NOT give it lq-liquid, which would paint in conventional windows too', async () => {
    const host = await mount();
    // §2 non-negotiable 1: conventional presentation is the default. `lq-liquid`
    // paints unconditionally; `lq-contextual` is inert until `.fwin-liquid` opts in.
    expect(host.querySelectorAll('.lq-liquid').length).toBe(0);
    expect(host.querySelectorAll('.lq-contextual').length).toBe(1);
  });

  it('keeps every mode panel outside the contextual surface', async () => {
    // All four, driven through the switch rather than asserted on the default one:
    // the panels are siblings of the head in the source, and a future refactor that
    // nests one of them inside it would put dense work on translucent material —
    // the number rubric category 3 requires to be 0.
    const host = await mount();
    // Asserted first, so that removing the contextual surface altogether cannot
    // make this pass vacuously — which is exactly what "everything is outside it"
    // degrades to when there is no `it`.
    expect(host.querySelectorAll('.lq-contextual').length).toBe(1);
    const panels: Array<[string, string]> = [
      ['grammar.mode.points', 'explorer'],
      ['grammar.mode.practice', 'practice'],
      ['grammar.mode.review', 'curation'],
      ['grammar.mode.guides', 'guides'],
    ];
    for (const [label, testid] of panels) {
      const button = [...host.querySelectorAll<HTMLButtonElement>('button.gram-mode-btn')]
        .find((el) => el.textContent === label);
      await act(async () => { must(button, `the ${label} button`).click(); });
      const panel = must(host.querySelector(`[data-testid="${testid}"]`), `the ${label} panel`);
      expect(panel.closest('.lq-contextual'), `${testid} is outside every contextual surface`)
        .toBeNull();
    }
  });
});
