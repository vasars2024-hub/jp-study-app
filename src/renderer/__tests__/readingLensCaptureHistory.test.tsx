// @vitest-environment jsdom
/**
 * The capture-history panel in Settings → Study → Reading Lens.
 *
 * The panel is the only surface where the history exists at all, and it sits
 * below the fold of a settings page nobody opens twice — so the two things most
 * likely to rot silently are exactly the two asserted here: that the search box
 * queries **main** rather than filtering an already-fetched page (a local filter
 * would look identical until a match older than the visible window is searched
 * for), and that Forget/Clear reach their IPC channels at all.
 *
 * The i18n assertion is not decoration. `settings.lens.history.*` shipped in the
 * component before it existed in any catalog, and neither `tools/i18n-check.cjs`
 * nor `helpers/i18nLeak.ts` can see that: both are keyed on the English catalog,
 * so a key absent from *every* language is invisible to them. Comparing against
 * the raw key string is what catches it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingLensHistoryEntry } from '../../shared/readingLensHistory';

const entry = (patch: Partial<ReadingLensHistoryEntry> = {}): ReadingLensHistoryEntry => ({
  captureId: 'cap-1',
  source: 'screen',
  sourceLabel: 'Steam',
  sourceRef: '',
  capturedAt: 1_700_000_000_000,
  language: 'ja',
  engine: 'auto',
  hash: 'h1',
  text: '猫が好きです',
  lineCount: 1,
  seenCount: 1,
  pinned: false,
  ...patch,
});

const calls = {
  list: [] as unknown[],
  remove: [] as unknown[],
  pin: [] as unknown[],
  clear: 0,
};
let stored: ReadingLensHistoryEntry[] = [];

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetSettings: async () => ({
      enabled: true,
      hotkey: 'Ctrl+Shift+Space',
      supported: true,
      registered: true,
      open: false,
    }),
    lensHistoryList: async (query: unknown) => {
      calls.list.push(query);
      const needle = (query as { query?: string } | undefined)?.query ?? '';
      return needle ? stored.filter((item) => item.text.includes(needle)) : stored;
    },
    lensHistoryRemove: async (captureId: unknown) => {
      calls.remove.push(captureId);
      stored = stored.filter((item) => item.captureId !== captureId);
      return stored.length;
    },
    lensHistoryPin: async (captureId: unknown, pinned: unknown) => {
      calls.pin.push({ captureId, pinned });
      stored = stored.map((item) => item.captureId === captureId ? { ...item, pinned: pinned === true } : item);
      return stored.find((item) => item.captureId === captureId) ?? null;
    },
    lensHistoryClear: async () => {
      calls.clear += 1;
      stored = [];
    },
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => null;
    },
  });
}

let Section: typeof import('../components/settings/pages/ReadingLensSection').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Section = (await import('../components/settings/pages/ReadingLensSection')).default;
});

beforeEach(() => {
  // Fake timers throughout, not only in the search tests: the panel's own
  // debounce schedules the *first* query on a 0 ms timeout, so under real timers
  // whether the list has arrived by the assertion depends on how many microtask
  // turns happened to run. That is a flake, and it presented as an empty list in
  // a different test on every run.
  vi.useFakeTimers();
  calls.list = [];
  calls.remove = [];
  calls.pin = [];
  calls.clear = 0;
  stored = [
    entry({ captureId: 'a', hash: 'ha', text: '猫が好きです' }),
    entry({ captureId: 'b', hash: 'hb', text: '犬も好きです', seenCount: 3 }),
  ];
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

/** Run the panel's timers forward and let the IPC promises behind them settle. */
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function render(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(<Section />);
  });
  // Settle the settings fetch and the zero-delay first history query.
  await settle();
}

const rows = (): HTMLLIElement[] => [...host.querySelectorAll('li')] as HTMLLIElement[];
const search = (): HTMLInputElement => {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error('no search box rendered');
  return input;
};
const buttonWith = (label: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`no button labelled ${label}`);
  return found as HTMLButtonElement;
};

async function type(value: string): Promise<void> {
  const input = search();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Reading Lens capture history panel', () => {
  it('renders one row per capture, newest-first as main returned them', async () => {
    await render();

    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('猫が好きです');
    expect(rows()[1].textContent).toContain('犬も好きです');
  });

  it('renders no raw catalog key — the failure the en-keyed leak checks cannot see', async () => {
    await render();

    expect(host.textContent).not.toMatch(/settings\.lens\.history\./);
    expect(host.textContent).not.toContain('[object Object]');
    expect(host.textContent).not.toContain('undefined');
  });

  it('shows a repeat count only for a capture seen more than once', async () => {
    await render();

    expect(rows()[0].textContent).not.toMatch(/\d+ time/);
    expect(rows()[1].textContent).toMatch(/3 times/);
  });

  it('sends the query to main instead of filtering the page it already has', async () => {
    await render();
    calls.list = [];

    await type('犬');
    await settle(200);

    expect(calls.list).toEqual([{ query: '犬', limit: 50 }]);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('犬も好きです');
  });

  it('debounces, so a typed query does not cross IPC per keystroke', async () => {
    await render();
    calls.list = [];

    await type('猫');
    await type('猫が');
    await type('猫が好');
    await settle(200);

    expect(calls.list).toHaveLength(1);
    expect(calls.list[0]).toEqual({ query: '猫が好', limit: 50 });
  });

  it('forgets one capture and re-reads the list rather than trusting its own state', async () => {
    await render();
    const before = calls.list.length;

    await act(async () => buttonWith('Forget').click());
    await settle();

    expect(calls.remove).toEqual(['a']);
    expect(calls.list.length).toBeGreaterThan(before);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('犬も好きです');
  });

  it('pins a capture through main and reflects the durable state after refresh', async () => {
    await render();

    await act(async () => buttonWith('Pin').click());
    await settle();

    expect(calls.pin).toEqual([{ captureId: 'a', pinned: true }]);
    expect(rows()[0].textContent).toContain('Unpin');
  });

  it('clears everything and lands on the empty state', async () => {
    await render();

    await act(async () => buttonWith('Clear all').click());
    await settle();

    expect(calls.clear).toBe(1);
    expect(rows()).toHaveLength(0);
    expect(host.textContent).toContain('Nothing captured yet');
  });

  it('distinguishes an empty history from a search that matched nothing', async () => {
    await render();

    await type('ありえない');
    await settle(200);

    expect(rows()).toHaveLength(0);
    expect(host.textContent).toContain('No capture matches that search');
    expect(host.textContent).not.toContain('Nothing captured yet');
  });

  it('cannot clear an already-empty history by accident', async () => {
    stored = [];
    await render();

    expect(buttonWith('Clear all').disabled).toBe(true);
  });
});
