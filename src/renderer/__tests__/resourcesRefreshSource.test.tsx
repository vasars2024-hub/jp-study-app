// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { CATALOG_FALLBACK } from '../data/catalogFallback';
import { useResources } from '../components/resources/ResourcesContent';

vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

let root: Root | null = null;
let host: HTMLDivElement;
let refresh: (() => Promise<void>) | undefined;
const catalogRefresh = vi.fn();

function Harness() {
  const state = useResources();
  refresh = state.doRefresh;
  return <div data-status={state.refreshState} />;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  catalogRefresh.mockReset();
});

it('reports cached catalogue after offline refresh, then updated after a remote refresh', async () => {
  catalogRefresh.mockResolvedValueOnce({ catalog: CATALOG_FALLBACK, source: 'cache' })
    .mockResolvedValueOnce({ catalog: CATALOG_FALLBACK, source: 'remote' });
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      catalogGet: vi.fn().mockResolvedValue(CATALOG_FALLBACK),
      catalogRefresh,
      toolsList: vi.fn().mockResolvedValue({ tools: [] }),
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
  expect(host.firstElementChild?.getAttribute('data-status')).toBe('cached');
  await act(async () => { await refresh?.(); });
  expect(host.firstElementChild?.getAttribute('data-status')).toBe('updated');
});

async function mountWith(api: Record<string, unknown>): Promise<void> {
  Object.defineProperty(window, 'api', { configurable: true, value: { toolsList: vi.fn().mockResolvedValue({ tools: [] }), ...api } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
}

it('labels the bundled catalogue as built-in, never as offline (audit F23)', async () => {
  // The catalogue repo is unpublished, so a fresh install gets { catalog: null, source: 'builtin' }
  // on every launch. Calling that "Offline — showing saved copy" was the F23 defect.
  catalogRefresh.mockResolvedValueOnce({ catalog: null, source: 'builtin' });
  await mountWith({ catalogGet: vi.fn().mockResolvedValue(null), catalogRefresh });
  expect(host.firstElementChild?.getAttribute('data-status')).toBe('builtin');
});

it('never adopts a malformed catalogue, so the surface cannot crash on it', async () => {
  // Restored-machine regression (2026-09-23): main returned { catalog, source } while the
  // renderer still treated the reply as the catalogue, and `[...catalog.newSection]` threw
  // inside the desktop's error boundary, taking every open window down with Resources.
  catalogRefresh.mockResolvedValueOnce({ catalog: [], source: 'remote' });
  await mountWith({ catalogGet: vi.fn().mockResolvedValue({ source: 'builtin', catalog: null }), catalogRefresh });
  expect(host.firstElementChild, 'the harness unmounted: the hook threw').not.toBeNull();
  expect(host.firstElementChild?.getAttribute('data-status')).toBe('updated');
});
