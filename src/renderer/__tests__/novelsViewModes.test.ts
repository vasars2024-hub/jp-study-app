// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modeState = vi.hoisted(() => ({
  setPlanOnly: vi.fn(),
  setImportFilter: vi.fn(),
  setShowSources: vi.fn(),
  // The two toggles' own state, so a test can put the view in the combination
  // the defect lived in: `mode === 'imports'` while plan-only filtering is ON.
  planOnly: false,
  showSources: false,
}));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock('../components/Icons', () => ({
  default: () => createElement('span'),
}));

vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  StatusBarField: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  StatusBarSpacer: () => createElement('span'),
  Toolbar: ({ children, ...props }: { children: ReactNode }) => createElement('div', props, children),
  ToolbarSpacer: () => createElement('span'),
  useAeroMaterials: () => false,
}));

vi.mock('../components/novels/NovelsContent', () => ({
  useNovels: () => ({
    query: '',
    setQuery: vi.fn(),
    planOnly: modeState.planOnly,
    setPlanOnly: modeState.setPlanOnly,
    importFilter: 'all',
    setImportFilter: modeState.setImportFilter,
    showSources: modeState.showSources,
    setShowSources: modeState.setShowSources,
    loadingJiten: false,
    refreshingNovels: false,
    status: '',
    store: { plan: [] },
    jitenDecks: [],
    candidates: [],
    selectedCandidate: null,
    refreshJiten: vi.fn(),
    refreshNovels: vi.fn(),
  }),
  NovelsFilters: () => createElement('div', { 'data-content': 'filters' }),
  NovelsTable: () => createElement('div', { 'data-content': 'table' }),
  NovelsInspector: () => createElement('div', { 'data-content': 'inspector' }),
}));

import NovelsView, { type NovelsViewMode } from '../views/NovelsView';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  modeState.planOnly = false;
  modeState.showSources = false;
  modeState.setPlanOnly.mockReset();
  modeState.setImportFilter.mockReset();
  modeState.setShowSources.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function renderMode(mode: NovelsViewMode) {
  await act(async () => {
    root.render(createElement(NovelsView, { mode }));
  });
}

describe('NovelsView destination modes', () => {
  it('derives Plan and pending Imports from the retained catalogue state', async () => {
    await renderMode('plan');
    expect(modeState.setPlanOnly).toHaveBeenLastCalledWith(true);
    expect(modeState.setImportFilter).toHaveBeenLastCalledWith('all');
    expect(host.querySelector('[data-content="table"]')).not.toBeNull();

    await renderMode('imports');
    expect(modeState.setPlanOnly).toHaveBeenLastCalledWith(true);
    expect(modeState.setImportFilter).toHaveBeenLastCalledWith('not-imported');
    expect(host.querySelector('[data-novels-mode="imports"]')).not.toBeNull();
  });

  it('makes Sources a dedicated editor composition', async () => {
    await renderMode('sources');

    expect(modeState.setPlanOnly).toHaveBeenLastCalledWith(false);
    expect(modeState.setImportFilter).toHaveBeenLastCalledWith('all');
    expect(modeState.setShowSources).toHaveBeenLastCalledWith(true);
    expect(host.querySelector('[data-content="filters"]')).not.toBeNull();
    expect(host.querySelector('[data-content="table"]')).toBeNull();
    expect(host.querySelector('[data-content="inspector"]')).toBeNull();
  });
});

/**
 * Both toolbar toggles reported the wrong state.
 *
 * `Plan` was highlighted from `mode === 'plan'` rather than from `planOnly`,
 * the thing it toggles. Measured live 2026-09-06 on the Import tab: the button
 * sat un-highlighted while plan-only filtering was on, and one click took the
 * list from **1 row to 205** without changing a single thing about the button.
 * `Sources` was bound to nothing at all, so it never highlighted anywhere.
 *
 * Blanc's copy of the same pair (`BlancLibraryPanels`) always bound to the
 * state, which is why this only ever showed in Study OS.
 */
describe('the toolbar toggles report their own state', () => {
  const chip = (label: string) =>
    [...host.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith(label));

  it('highlights Plan whenever plan-only filtering is on, including on the Import tab', async () => {
    modeState.planOnly = true;
    await renderMode('imports');

    const plan = chip('novelsView.plan');
    expect(plan).toBeDefined();
    expect(plan?.className).toContain('active');
    expect(plan?.getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves Plan un-highlighted when plan-only filtering is off, on the Plan tab', async () => {
    // The control: binding to `mode === 'plan'` would ALSO pass the test above
    // on the Plan tab, so the reading has to be wrong here for the fix to mean
    // anything. `planOnly` false while `mode` is 'plan' is exactly that case.
    modeState.planOnly = false;
    await renderMode('plan');

    const plan = chip('novelsView.plan');
    expect(plan?.className).not.toContain('active');
    expect(plan?.getAttribute('aria-pressed')).toBe('false');
  });

  it('highlights Sources when the source editor is open', async () => {
    modeState.showSources = true;
    await renderMode('imports');

    const sources = chip('novelsView.sources');
    expect(sources?.className).toContain('active');
    expect(sources?.getAttribute('aria-pressed')).toBe('true');
  });
});
