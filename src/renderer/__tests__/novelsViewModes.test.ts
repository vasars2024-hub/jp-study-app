// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modeState = vi.hoisted(() => ({
  setPlanOnly: vi.fn(),
  setImportFilter: vi.fn(),
  setShowSources: vi.fn(),
  // The toolbar's highlight has to follow these two, not the `mode` prop, so they
  // are readable per test rather than pinned to false.
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
  modeState.setPlanOnly.mockReset();
  modeState.setImportFilter.mockReset();
  modeState.setShowSources.mockReset();
  modeState.planOnly = false;
  modeState.showSources = false;
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

describe('NovelsView toolbar state', () => {
  function commands() {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('.aero-novels-command'));
  }
  const plan = () => commands().find((b) => b.textContent?.includes('novelsView.plan'));
  const sources = () => commands().find((b) => b.textContent?.includes('novelsView.sources'));

  it('lights Plan from the filter it controls, not from the window it was opened as', async () => {
    modeState.planOnly = false;
    await renderMode('plan');
    // Opened AS the Plan window, but the user has switched the filter off: the
    // table shows every book, so the button must not claim otherwise.
    expect(plan()?.className).not.toContain('active');
    expect(plan()?.getAttribute('aria-pressed')).toBe('false');

    modeState.planOnly = true;
    await renderMode('plan');
    expect(plan()?.className).toContain('active');
    expect(plan()?.getAttribute('aria-pressed')).toBe('true');
  });

  it('lights Plan in the Imports window too, where the filter is on and the mode is not plan', async () => {
    modeState.planOnly = true;
    await renderMode('imports');
    expect(plan()?.className).toContain('active');
    expect(plan()?.getAttribute('aria-pressed')).toBe('true');
  });

  it('gives Sources an expanded state that tracks the editor it discloses', async () => {
    await renderMode('plan');
    expect(sources()?.getAttribute('aria-expanded')).toBe('false');
    expect(sources()?.className).not.toContain('active');

    modeState.showSources = true;
    await renderMode('plan');
    expect(sources()?.getAttribute('aria-expanded')).toBe('true');
    expect(sources()?.className).toContain('active');
  });
});
