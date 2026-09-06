// @vitest-environment jsdom
/**
 * Audit item 5.7's hardening, checked where a user can actually see it.
 *
 * `storageHealth.ts` and `localStorageWrite.ts` have their own unit suites, and
 * both passed while nothing in the product read either of them. That is the
 * failure this file exists to prevent: a guard with no consumer measures
 * nothing, and 5.7's whole finding was that **nobody was measuring the store**.
 *
 * So every assertion here mounts the real `FilesMemoryPanel` and reads the
 * rendered text. The store is a real jsdom `localStorage` with planted keys —
 * the panel calls `inspectStorageHealth(localStorage)` itself, so a panel that
 * stopped calling it renders nothing to match.
 *
 * Each positive has its control in the same test, because the two findings this
 * surfaces are easy to fake: an over-encoding check that flags a *singly*
 * encoded object flags everything, and a size alarm that fires under budget is
 * an alarm nobody will read twice.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryBytes } from '../../shared/storageHealth';
import { clearLastStorageWriteFailure, writeLocalStorage } from '../localStorageWrite';

vi.mock('../storage/storage', () => ({
  listSettingsDomains: () => Promise.resolve([]),
  clearSettingsDomain: () => Promise.resolve(),
  exportAllData: () => Promise.resolve({ format: 1, domains: [] }),
  importAllData: () => Promise.resolve({ imported: 0 }),
}));

vi.mock('../storage/db', () => ({ kvClear: () => Promise.resolve() }));

class NoopResizeObserver {
  observe(): void {
    /* nothing observed */
  }
  unobserve(): void {
    /* nothing observed */
  }
  disconnect(): void {
    /* nothing observed */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {
  /* no layout in jsdom */
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountPanel(): Promise<HTMLDivElement> {
  const { FilesMemoryPanel } = await import('../components/filesapp/panels/FilesMemoryPanel');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render((<FilesMemoryPanel />) as ReactNode);
  });
  // The mount effect's `refreshStorage()` resolves a microtask later.
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

/** The storage-usage card's text — the health block renders inside it. */
function usageText(el: HTMLElement): string {
  return el.querySelector('[data-panel-card-id="storage-usage"]')?.textContent ?? '';
}

function healthStatus(el: HTMLElement): string | null {
  return el.querySelector('[data-storage-health]')?.getAttribute('data-storage-health') ?? null;
}

beforeEach(() => {
  localStorage.clear();
  clearLastStorageWriteFailure();
  (window as unknown as { api: Record<string, unknown> }).api = {
    systemGetMetrics: () => Promise.reject(new Error('not needed here')),
    miningSetConfig: () => Promise.resolve(),
  };
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate: () => Promise.resolve({ usage: 1, quota: 2 }) },
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  host = null;
  root = null;
  localStorage.clear();
  clearLastStorageWriteFailure();
  vi.restoreAllMocks();
});

describe('files-app memory panel — the store measures itself', () => {
  it('reports a healthy store, with the footprint it actually measured', async () => {
    localStorage.setItem('jp-scraper-settings-v1', JSON.stringify({ profiles: [] }));
    const el = await mountPanel();

    expect(healthStatus(el)).toBe('ok');
    const text = usageText(el);
    expect(text).toContain('Local store healthy');
    // The number, not the adjective: one key, and its own UTF-16 size.
    const bytes = entryBytes(
      'jp-scraper-settings-v1',
      localStorage.getItem('jp-scraper-settings-v1') ?? '',
    );
    const { formatBytes } = await import('../../shared/assetRegistry');
    expect(text).toContain(formatBytes(bytes));
    expect(text).toContain('1');
    // Nothing is wrong, so none of the three findings may appear.
    expect(text).not.toContain('Re-encoded values');
    expect(text).not.toContain('growth alarm');
    expect(text).not.toContain('A save was refused');
  });

  it('names an over-encoded key, and does not flag the same value encoded once', async () => {
    const payload = { profiles: [{ id: 'a' }] };
    // The 6.A signature: stringified, then stringified again.
    localStorage.setItem('jp-over-encoded', JSON.stringify(JSON.stringify(payload)));
    // The control, planted in the SAME store: identical shape, one encoding.
    localStorage.setItem('jp-encoded-once', JSON.stringify(payload));
    const el = await mountPanel();

    expect(healthStatus(el)).toBe('critical');
    const text = usageText(el);
    expect(text).toContain('Local store has a defect');
    expect(text).toContain('jp-over-encoded ×2');
    expect(text).not.toContain('jp-encoded-once');
  });

  it('warns on a value past the single-key budget, and stays quiet just under it', async () => {
    // 2 MB budget, counted UTF-16 — so 1.2M characters is over and 0.4M is not.
    localStorage.setItem('jp-under-budget', 'x'.repeat(400_000));
    const quiet = await mountPanel();
    expect(healthStatus(quiet)).toBe('ok');
    expect(usageText(quiet)).not.toContain('Single values past');

    await act(async () => {
      root?.unmount();
    });
    host?.remove();

    localStorage.setItem('jp-too-big', 'x'.repeat(1_200_000));
    const el = await mountPanel();
    expect(healthStatus(el)).toBe('warn');
    const text = usageText(el);
    expect(text).toContain('Local store worth a look');
    expect(text).toContain('jp-too-big');
    expect(text).not.toContain('jp-under-budget');
  });
});

describe('files-app memory panel — a refused write leaves a trace a user can read', () => {
  /** Chromium's own refusal, by name, so `isQuotaExceededError` recognises it. */
  function quotaError(): Error {
    const err = new Error('quota');
    err.name = 'QuotaExceededError';
    return err;
  }

  it('shows the key, the size and the reason, and the Dismiss button clears it', async () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw quotaError();
      });
    const landed = writeLocalStorage('jp-study-appearance-v1', 'x'.repeat(2048));
    setItem.mockRestore();
    // The write is reported as not having landed — the silent-catch defect 5.7
    // named is exactly this returning nothing at all.
    expect(landed).toBe(false);

    const el = await mountPanel();
    const failure = el.querySelector('[data-storage-write-failure]');
    expect(failure?.getAttribute('data-storage-write-failure')).toBe('quota');
    const text = usageText(el);
    expect(text).toContain('A save was refused');
    expect(text).toContain('jp-study-appearance-v1');
    expect(text).toContain('the store had no room');

    const dismiss = [...(failure?.querySelectorAll('button') ?? [])][0];
    expect(dismiss?.textContent).toBe('Dismiss');
    await act(async () => {
      dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host?.querySelector('[data-storage-write-failure]')).toBeNull();
  });

  it('says the store is fine when the VALUE was the problem', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const { writeLocalStorageJson } = await import('../localStorageWrite');
    expect(writeLocalStorageJson('jp-circular', circular)).toBe(false);

    const el = await mountPanel();
    expect(el.querySelector('[data-storage-write-failure]')?.getAttribute(
      'data-storage-write-failure',
    )).toBe('serialize');
    // The distinction is the point: sending the next reader to inspect a store
    // that is fine is how 5.7 stayed unexplained for so long.
    expect(usageText(el)).toContain('the value could not be encoded');
    expect(usageText(el)).not.toContain('the store had no room');
  });

  it('shows no failure line at all when nothing has been refused', async () => {
    const el = await mountPanel();
    expect(el.querySelector('[data-storage-write-failure]')).toBeNull();
    expect(usageText(el)).not.toContain('A save was refused');
  });
});
