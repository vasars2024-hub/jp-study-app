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
