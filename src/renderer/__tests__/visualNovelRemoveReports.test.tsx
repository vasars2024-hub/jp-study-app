// @vitest-environment jsdom
/**
 * Remove was the one action in the VN panel that said nothing.
 *
 * Found by the category-2 harness, not by reading: its undo leg drives add-then-remove and reports
 * the surface's live regions before and after. Both read "Visual novel added to the local library."
 * — the panel announced the add, the remove cleared the entry, and the `role="status"` line was
 * left describing a visual novel that no longer existed. Every other action in this panel calls
 * `setStatus`/`reportStatus`; `visualNovelRemove` was invoked as `void`.
 *
 * The second half matters more than the first. `visual-novel:remove` answers with a database
 * whether or not the entry went, so "it returned" is not "it was removed". A removal that silently
 * kept the row would have announced itself as a success. The panel now checks the database it was
 * handed and says which of the two happened.
 *
 * Mounting follows `visualNovelI18n.test.tsx`: `window.api` has to exist before the panel is
 * IMPORTED, because its import graph reads `window.api.onPlayerSync` at module-eval time.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { normalizeVisualNovelDatabase } from '../../shared/visualNovel';

/**
 * `dbc5d509` put Remove behind a confirm — correctly, it was destroying every mined sentence
 * with no guard — and that turned this whole file red: the click now awaits a dialog that never
 * answers under jsdom, so `visualNovelRemove` was never reached and `removeCalls` read `[]`.
 * The dialog is STUBBED rather than driven, following `readingLensCaptureHistory.test.tsx`, so
 * both answers can be asserted; a file that only ever confirms would pass just as well with the
 * guard deleted. Note the panel imports from `../ui/dialogService` directly, not from
 * `../components/ui`, so that is the specifier mocked here.
 */
let confirmAnswer = true;
const confirmCalls: unknown[] = [];
vi.mock('../components/ui/dialogService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/ui/dialogService')>()),
  confirmDialog: async (opts: unknown) => {
    confirmCalls.push(opts);
    return confirmAnswer;
  },
}));

const seed = normalizeVisualNovelDatabase({
  version: 1,
  entries: [{
    id: 'vn-1',
    title: 'Sample Visual Novel',
    japaneseTitle: 'サンプルノベル',
    engine: 'kirikiri',
    executablePath: 'C:/Games/Sample/sample.exe',
    status: 'reading',
    completionPct: 42,
    totalPlaytimeSec: 3600,
    routes: [],
  }],
});
const emptied = normalizeVisualNovelDatabase({ version: 1, entries: [] });

const EMPTY_RESULT = new Proxy({}, { get: () => [] });
/** Set per test: what `visual-novel:remove` answers with. */
let removeAnswer = emptied;
let removeCalls: string[] = [];

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: async () => seed,
    visualNovelHookState: async () => null,
    // The real contract is `{ startedAt: number | null }`, never a bare null (preload.ts:2354).
    // No session, so `Stop timer` is absent and Remove is the last action button.
    visualNovelSessionState: async () => ({ startedAt: null }),
    visualNovelRemove: async (id: string) => { removeCalls.push(id); return removeAnswer; },
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      // Every `on*` subscribes and hands back its own unsubscribe, so both layers return a
      // function. `undefined` rather than an empty body: this repo lints empty functions.
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
  installApiStub();
  Panel = (await import('../components/immersion/VisualNovelPanel')).default;
});

afterEach(() => {
  root?.unmount();
  root = null;
  removeCalls = [];
  confirmCalls.length = 0;
  confirmAnswer = true;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => { mounted.render(<Panel onClose={() => undefined} />); });
  // Flush the effects that load the seeded database.
  await act(async () => { await Promise.resolve(); });
}

const status = (): string => (host.querySelector('[role="status"]')?.textContent ?? '').trim();
const removeButton = (): HTMLButtonElement => {
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.visual-novel-summary-actions button'));
  const found = buttons.find((b) => (b.textContent ?? '').trim() === 'Remove');
  if (!found) throw new Error(`no Remove among [${buttons.map((b) => b.textContent).join(', ')}]`);
  return found;
};

describe('removing a visual novel reports what happened', () => {
  it('says nothing before anything is done', async () => {
    await mount();
    expect(status()).toBe('');
  });

  it('names the entry it removed, and empties the workspace', async () => {
    removeAnswer = emptied;
    await mount();
    await act(async () => { removeButton().click(); });
    expect(removeCalls).toEqual(['vn-1']);
    expect(status()).toBe('Removed Sample Visual Novel from the local library.');
    // The announcement is not the evidence: the surface itself has to have moved.
    expect(host.querySelector('.visual-novel-empty')).not.toBeNull();
    expect(host.querySelector('.visual-novel-summary-actions')).toBeNull();
  });

  it('refuses to announce a success the database did not perform', async () => {
    // The handler answers with a database either way. This is that database unchanged.
    removeAnswer = seed;
    await mount();
    await act(async () => { removeButton().click(); });
    expect(removeCalls).toEqual(['vn-1']);
    expect(status()).toBe('Sample Visual Novel is still in the local library.');
    expect(host.querySelector('.media-error')).not.toBeNull();
    // And the entry is still on screen, because it is still there.
    expect(host.querySelector('.visual-novel-summary-actions')).not.toBeNull();
  });

  it('asks first, and answering No removes nothing and says nothing', async () => {
    // The guard `dbc5d509` added, pinned. Without this case every assertion above would pass
    // just as well with the confirm deleted, which is exactly how the guard could be lost again.
    confirmAnswer = false;
    removeAnswer = emptied;
    await mount();
    await act(async () => { removeButton().click(); });
    expect(confirmCalls).toHaveLength(1);
    expect(removeCalls).toEqual([]);
    expect(status()).toBe('');
    expect(host.querySelector('.visual-novel-summary-actions')).not.toBeNull();
  });
});
