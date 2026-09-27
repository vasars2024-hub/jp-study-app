// @vitest-environment jsdom
/**
 * Translate's control between the source and target languages drew a globe —
 * the icon for "the web" or "language settings", not for "exchange these two".
 * It is a swap button (it exchanges the directions), so it now draws the swap
 * glyph, in both the standard and the Aero toolbar, and the Translate button
 * uses the translate glyph instead of the same globe.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BASE_PATHS } from '../components/Icons';

const materials = vi.hoisted(() => ({ aero: false }));

vi.mock('../components/SentenceAnalysisPanel', () => ({ default: () => <div /> }));
vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({ default: () => <div /> }));
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
  useAeroMaterials: () => materials.aero,
}));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

import TranslateView from '../views/TranslateView';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  materials.aero = false;
  document.body.replaceChildren();
});

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created;
  await act(async () => created.render(<TranslateView />));
  return host;
}

const glyphOf = (el: Element | null): string | null => el?.querySelector('svg path')?.getAttribute('d') ?? null;

describe('Translate — the direction control is a swap', () => {
  it('draws the swap glyph between the rows and exchanges them on click', async () => {
    const host = await mount();
    const swap = host.querySelector('.tr-swap');
    expect(swap?.getAttribute('aria-label')).toBe('translate.menu.swap');
    expect(glyphOf(swap)).toBe(BASE_PATHS.swap);
    expect(glyphOf(swap)).not.toBe(BASE_PATHS.globe);

    const checked = () =>
      [...host.querySelectorAll('.tr-dir [role="radio"][aria-checked="true"]')].map((b) => b.textContent);
    const before = checked();
    await act(async () => (swap as HTMLButtonElement).click());
    expect(checked()).toEqual([...before].reverse());
  });

  it('the Aero toolbar uses the same swap glyph', async () => {
    materials.aero = true;
    const host = await mount();
    expect(glyphOf(host.querySelector('.aero-translate-swap'))).toBe(BASE_PATHS.swap);
  });

  it('no globe is left on the Translate surface', async () => {
    const host = await mount();
    const paths = [...host.querySelectorAll('svg path')].map((p) => p.getAttribute('d'));
    expect(paths).not.toContain(BASE_PATHS.globe);
  });
});
