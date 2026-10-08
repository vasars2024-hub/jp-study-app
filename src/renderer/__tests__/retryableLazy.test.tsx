// @vitest-environment jsdom
/**
 * A lazy panel whose chunk failed to load used to stay failed: `React.lazy`
 * caches the rejected import, so Blanc's "Try again" re-rendered the same
 * error until a full reload. `retryableLazy` imports again on the retry.
 */
import { act, Suspense, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryableLazy } from '../retryableLazy';
import { BlancToolErrorBoundary } from '../components/blanc/BlancToolErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  (window as unknown as { api: unknown }).api = { logRendererError: vi.fn(() => Promise.resolve()) };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

function Panel(): ReactNode {
  return <p>panel loaded</p>;
}

describe('retryableLazy', () => {
  it('imports again after a failed chunk when the boundary retries', async () => {
    let attempts = 0;
    const LazyPanel = retryableLazy(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('chunk failed')) : Promise.resolve({ default: Panel });
    });

    await act(async () => {
      root.render(
        <BlancToolErrorBoundary toolId="t" label="Tool">
          <Suspense fallback={<p>loading</p>}>
            <LazyPanel />
          </Suspense>
        </BlancToolErrorBoundary>,
      );
    });
    expect(host.textContent).toContain('Tool could not be displayed.');

    await act(async () => {
      (host.querySelector('.blanc-tool-crash-retry') as HTMLElement).click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(attempts).toBe(2);
    expect(host.textContent).toContain('panel loaded');
  });
});
