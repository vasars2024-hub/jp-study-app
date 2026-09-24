// @vitest-environment jsdom
/**
 * "Hide library" in Visual Novels survives closing and reopening the window.
 * The selected novel and the tab were persisted with the panel state; the
 * library toggle was not, so it came back shown every time.
 *
 * Mounting follows `visualNovelLiquidRegions.test.tsx`: `window.api` has to
 * exist before the panel is imported.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizeVisualNovelDatabase } from '../../shared/visualNovel';

const seed = normalizeVisualNovelDatabase({ version: 1, entries: [] });
const EMPTY_RESULT = new Proxy({}, { get: () => [] });

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: async () => seed,
    visualNovelHookState: async () => null,
    visualNovelSessionState: async () => ({ startedAt: null }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => EMPTY_RESULT;
    },
  });
}

let Panel: typeof import('../components/immersion/VisualNovelPanel').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  installApiStub();
  Panel = (await import('../components/immersion/VisualNovelPanel')).default;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => { mounted.render(<Panel onClose={() => undefined} />); });
  await act(async () => { await Promise.resolve(); });
}

const toggle = (): HTMLButtonElement => {
  const button = host.querySelector<HTMLButtonElement>('.visual-novel-panel-tools button[aria-pressed]');
  if (!button) throw new Error('missing library toggle');
  return button;
};

describe('visual novel library toggle', () => {
  it('stays hidden after close and reopen, and shown again once shown', async () => {
    await mount();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    await act(async () => toggle().click());
    expect(toggle().getAttribute('aria-pressed')).toBe('false');

    // Close the window, open it again.
    root?.unmount();
    root = null;
    document.body.replaceChildren();
    await mount();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');

    await act(async () => toggle().click());
    root?.unmount();
    root = null;
    document.body.replaceChildren();
    await mount();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
  });
});
