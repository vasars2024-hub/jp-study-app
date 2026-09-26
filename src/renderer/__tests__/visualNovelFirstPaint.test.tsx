// @vitest-environment jsdom
/**
 * V12 layout jumps on open (Visual Novels): the panel painted the empty library, its
 * "add a novel" prompt and the Discover button, then the real list, recommendations and
 * summary once `visualNovelList` answered — moving what was already on screen. Until the
 * first answer the library and the workspace now render nothing but a busy placeholder,
 * so the first painted layout is the settled one.
 *
 * Mounting follows `visualNovelLibraryToggle.test.tsx`: `window.api` exists before import. jsdom
 * has no ResizeObserver, so the library sheet may not dock here; `vnCanvas.test.tsx` covers the
 * loaded library through the reading-canvas harness.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizeVisualNovelDatabase, type VisualNovelDatabase } from '../../shared/visualNovel';

const seed = normalizeVisualNovelDatabase({
  version: 1,
  entries: [{ id: 'vn-1', title: 'Sample Novel', japaneseTitle: 'サンプル' }],
});
const EMPTY_RESULT = new Proxy({}, { get: () => [] });

let answer: (db: VisualNovelDatabase) => void = () => undefined;
let fail: () => void = () => undefined;

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: () =>
      new Promise<VisualNovelDatabase>((resolve, reject) => {
        answer = resolve;
        fail = () => reject(new Error('offline'));
      }),
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
}, 60_000);

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
  await act(async () => { mounted.render(<Panel standalone />); });
}

describe('visual novels first paint', () => {
  it('paints no library or empty prompt before the list answers, then the settled content', async () => {
    await mount();
    expect(host.querySelector('.visual-novel-empty')).toBeNull();
    expect(host.querySelector('.visual-novel-entries')).toBeNull();
    expect(host.querySelector('.visual-novel-discover')).toBeNull();
    const library = host.querySelector('.visual-novel-library');
    if (library) expect(library.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.visual-novel-workspace')?.getAttribute('aria-busy')).toBe('true');

    await act(async () => { answer(seed); });
    expect(host.querySelector('.visual-novel-workspace')?.hasAttribute('aria-busy')).toBe(false);
    expect(host.querySelector('.visual-novel-summary')).not.toBeNull();
  });

  it('a failed list still releases the empty state instead of staying busy', async () => {
    await mount();
    await act(async () => { fail(); });
    expect(host.querySelector('.visual-novel-empty')).not.toBeNull();
    expect(host.querySelector('.visual-novel-workspace')?.hasAttribute('aria-busy')).toBe(false);
  });
});
