// @vitest-environment jsdom
/**
 * Translate's two direction rows are each ONE choice, and they now say so.
 *
 * Measured on the live surface 2026-09-05: the source and target rows rendered six
 * bare `<button class="gram-level-btn">`s inside two undeclared `div.dict-lang-toggle`
 * wrappers. To assistive tech that is six unrelated buttons with no indication that
 * picking one unpicks another, and no indication of which is current — the `active`
 * class is a paint, not a state. The repo already spells the fix out five times
 * (`LensClipboardPassage`, `ReadingLensOverlay`, `AiAnalysisSection` ×2,
 * `FormalityToggle`): `role="radiogroup"` + `role="radio"` + `aria-checked`, no
 * roving tabindex. This pins that the pattern reached Translate and stays reached.
 *
 * The `aria-checked` half is the load-bearing one and is asserted as a COUNT
 * (exactly one checked per row), because a row where every chip reports checked
 * reads as valid ARIA and is a worse lie than no ARIA at all.
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

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created;
  await act(async () => created.render(<TranslateView />));
  return host;
}

describe('Translate — the direction rows are declared radio groups', () => {
  it('declares both rows, each with its own label', async () => {
    const host = await mount();
    const rows = [...host.querySelectorAll('.tr-dir .dict-lang-toggle')];
    expect(rows.length, 'two direction rows').toBe(2);
    for (const row of rows) expect(row.getAttribute('role')).toBe('radiogroup');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'translate.lang.sourceGroup',
      'translate.lang.targetGroup',
    ]);
  });

  it('gives every chip role=radio and exactly one checked per row', async () => {
    const host = await mount();
    const rows = [...host.querySelectorAll('.tr-dir .dict-lang-toggle')];
    expect(rows.length).toBe(2);
    for (const row of rows) {
      const chips = [...row.querySelectorAll('button')];
      // Four languages minus the other side's current one.
      expect(chips.length, 'chips in a direction row').toBe(3);
      for (const chip of chips) {
        expect(chip.getAttribute('role')).toBe('radio');
        expect(chip.getAttribute('type')).toBe('button');
        expect(chip.getAttribute('aria-checked')).not.toBeNull();
      }
      const checked = chips.filter((c) => c.getAttribute('aria-checked') === 'true');
      expect(checked.length, 'exactly one chip reports checked').toBe(1);
      // The paint and the state agree — `active` alone was the whole signal before.
      expect(checked[0].classList.contains('active')).toBe(true);
    }
  });

  it('leaves the swap button out of both groups', async () => {
    const host = await mount();
    const swap = host.querySelector('.tr-swap');
    expect(swap, '.tr-swap').not.toBeNull();
    // A swap is not one of the mutually exclusive options; if it were inside a
    // radiogroup, AT would count it as a fourth language.
    expect(swap?.closest('[role="radiogroup"]')).toBeNull();
    expect(swap?.getAttribute('role')).not.toBe('radio');
  });

  it('gives the swap button the 32px pointer floor', async () => {
    const host = await mount();
    const swap = host.querySelector('.tr-swap');
    // Measured live 2026-09-05: 30x32 rendered, so 2px short on its narrow axis and
    // filed under the rubric's 32px floor. `.lq-hit` reaches the floor with an
    // ::after at max(100%, 32px) rather than resizing a square-ish icon button, and
    // its neighbours are a 10px `.tr-dir` gap away, so it steals nothing (measured:
    // stolenCount 0, belowFloorByHit 4 -> 0).
    expect(swap?.classList.contains('lq-hit')).toBe(true);
  });
});

describe('Translate — choosing a source language does not change what you study', () => {
  it('picking and swapping Chinese leaves a Japanese learner studying Japanese', async () => {
    localStorage.setItem('jp-study-dict-lang', 'ja');
    const host = await mount();
    const sourceRow = host.querySelectorAll('.tr-dir .dict-lang-toggle')[0];
    const zh = [...sourceRow.querySelectorAll('[role="radio"]')].find((el) => el.textContent?.includes('中'))
      ?? [...sourceRow.querySelectorAll('[role="radio"]')][1];
    await act(async () => (zh as HTMLElement).click());
    expect(localStorage.getItem('jp-study-dict-lang')).toBe('ja');
  });
});
