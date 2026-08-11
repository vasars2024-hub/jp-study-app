// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modeState = vi.hoisted(() => ({
  setPlanOnly: vi.fn(),
  setImportFilter: vi.fn(),
  setShowSources: vi.fn(),
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
    planOnly: false,
    setPlanOnly: modeState.setPlanOnly,
    importFilter: 'all',
    setImportFilter: modeState.setImportFilter,
    showSources: false,
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
