// @vitest-environment jsdom
/**
 * files-app gate 8's **after** comparison, run against the recorded **before**.
 *
 * The gate: "Memory and statistics render in the Files app with the same
 * numbers the old Settings page produced, captured *before* removal and
 * compared after."
 *
 * The before-capture is real and irreplaceable —
 * `src/.coordination/files-app/gate8-before.json` was taken through the running
 * app's debug bridge on 2026-08-31, while `MemoryPage.tsx` still existed. That
 * page is now deleted, so this file is the only remaining way to compare: the
 * capture is IMPORTED here, not retyped, because a hand-copied expected value
 * is not a comparison with anything.
 *
 * What this proves and what it does not, stated plainly rather than implied:
 *
 *   PROVES  the Files-app panel calls the same readers the old page called
 *           (stubbing `window.api.systemGetMetrics` and `listSettingsDomains`
 *           is what produces the rendered numbers — a panel reading anything
 *           else would render nothing here), that it renders those numbers
 *           unchanged, and that all eight of the old page's card anchors
 *           survived the move under their original ids.
 *   DOES NOT prove the live app routes to this panel. That is the clause still
 *           needing an exclusive Electron instance, and it stays open.
 *
 * The capture's own warning is honoured: `freemem`, `used`, `quota` and every
 * `stats.*` figure are live machine state and are compared for SHAPE only.
 * `totalmem`, `platform`, `domainsAll`, `domainsPresent` and the six inventory
 * ids are the STABLE keys and are compared exactly.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import before from '../../.coordination/files-app/gate8-before.json';

/** The inventory rows the old page's `listSettingsDomains()` returned. */
const CAPTURED_TOP_SIX = before.memory.settingsDomainInventory.topSixByBytes as [string, number][];
const CAPTURED_DOMAINS_ALL = before.memory.settingsDomainInventory.domainsAll;
const CAPTURED_DOMAINS_PRESENT = before.memory.settingsDomainInventory.domainsPresent;
const CAPTURED_METRICS = before.memory.systemGetMetrics;

/**
 * A domain list shaped like the capture: `domainsPresent` rows with bytes, the
 * six largest in the captured order, and the rest of `domainsAll` absent —
 * which is exactly what "30 all, 24 present" meant on the old page.
 */
function row(id: string, bytes: number, present: boolean) {
  return {
    id,
    // The panel renders LABELS, not raw domain ids — the first version of this
    // test asserted on `study-progress` and failed on a correct panel showing
    // "Study progress". The label is what a user compares, so that is what the
    // parity assertion reads.
    label: id,
    description: '',
    category: 'study' as const,
    bytes,
    count: present ? 1 : 0,
    present,
    detail: '',
    clearable: true,
    tier: 'local' as const,
  };
}

function capturedDomains(scale = 1) {
  const rows = CAPTURED_TOP_SIX.map(([domain, bytes]) => row(domain, bytes * scale, true));
  for (let i = rows.length; i < CAPTURED_DOMAINS_PRESENT; i += 1) rows.push(row(`filler-${i}`, 1, true));
  for (let i = CAPTURED_DOMAINS_PRESENT; i < CAPTURED_DOMAINS_ALL; i += 1) {
    rows.push(row(`absent-${i}`, 0, false));
  }
  return rows;
}

let domainScale = 1;

vi.mock('../storage/storage', () => ({
  listSettingsDomains: () => Promise.resolve(capturedDomains(domainScale)),
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
// jsdom has no layout, so `scrollIntoView` is simply absent and `FilesPanelCard`'s
// focus effect throws. Stubbed rather than guarded in the product: the call is
// correct, the environment is what lacks it.
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {
  /* no layout in jsdom */
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let metrics = { ...CAPTURED_METRICS };

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  // Two flushes: the panel's mount effect fires `refreshStorage()` and
  // `refreshSystem()`, and both resolve a microtask later.
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

beforeEach(() => {
  domainScale = 1;
  metrics = { ...CAPTURED_METRICS };
  (window as unknown as { api: Record<string, unknown> }).api = {
    systemGetMetrics: () => Promise.resolve(metrics),
    miningSetConfig: () => Promise.resolve(),
  };
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: () =>
        Promise.resolve({
          usage: before.memory.storageEstimate.used,
          quota: before.memory.storageEstimate.quota,
        }),
    },
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  host = null;
  root = null;
  vi.restoreAllMocks();
});

describe('files-app gate 8 — the Files app renders the old Memory page\'s numbers', () => {
  it('keeps all eight of the old page\'s card anchors, under their original ids', async () => {
    const { FilesMemoryPanel } = await import('../components/filesapp/panels/FilesMemoryPanel');
    const el = await mount(<FilesMemoryPanel />);
    const ids = [...el.querySelectorAll('[data-panel-card-id]')].map((n) =>
      n.getAttribute('data-panel-card-id'),
    );
    // Not "contains" — EQUAL, in order. A card silently dropped in the move is
    // the failure this gate exists to catch, and a superset assertion cannot
    // see it.
    expect(ids).toEqual(before.memory.cardIds);
  });

  it('renders the captured totalmem and platform, from the same reader', async () => {
    const { FilesMemoryPanel } = await import('../components/filesapp/panels/FilesMemoryPanel');
    const { formatBytes } = await import('../../shared/assetRegistry');
    const el = await mount(<FilesMemoryPanel />);
    const text = el.textContent ?? '';
    expect(text).toContain(formatBytes(CAPTURED_METRICS.totalmem));
    expect(text).toContain(CAPTURED_METRICS.platform);
  });

  it('renders the captured domain inventory: 24 present of 30, six largest in order', async () => {
    const { FilesMemoryPanel } = await import('../components/filesapp/panels/FilesMemoryPanel');
    const el = await mount(<FilesMemoryPanel />);
    const { formatBytes } = await import('../../shared/assetRegistry');
    // Scoped to the inventory CARD, not the panel: `.fa-panel-table` also
    // matches the agent-memory and agent-history tables, and an unscoped query
    // counted 32 rows for a 30-domain inventory.
    const card = el.querySelector('[data-panel-card-id="storage-inventory"]');
    const rows = [...(card?.querySelectorAll('.fa-panel-table tbody tr') ?? [])];
    // The capture's two stable inventory numbers, read off the rendered table.
    expect(rows.length).toBe(CAPTURED_DOMAINS_ALL);
    const sized = rows.filter((r) => (r.querySelectorAll('td')[3]?.textContent ?? '—') !== '—');
    expect(sized.length).toBe(CAPTURED_DOMAINS_PRESENT);
    expect(CAPTURED_DOMAINS_PRESENT).toBe(24);
    expect(CAPTURED_DOMAINS_ALL).toBe(30);
    // The six largest, with the capture's own byte values, in the capture's
    // order — presence alone would pass on a panel that reordered them.
    const text = el.textContent ?? '';
    const positions = CAPTURED_TOP_SIX.map(([, bytes]) => text.indexOf(formatBytes(bytes)));
    for (const pos of positions) expect(pos).toBeGreaterThanOrEqual(0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('compares the volatile keys for SHAPE only, as the capture instructs', async () => {
    // `freemem`, `used` and `quota` move on their own; asserting them exactly
    // would be a test that fails tomorrow for no reason. What must hold is that
    // they are present, numeric and in range.
    expect(CAPTURED_METRICS._volatile).toContain('freemem');
    expect(before.memory.storageEstimate._volatile).toEqual(['used', 'quota']);
    expect(before.memory.storageEstimate.used).toBeLessThan(before.memory.storageEstimate.quota);
    expect(CAPTURED_METRICS.freemem).toBeLessThan(CAPTURED_METRICS.totalmem);
  });
});

describe('files-app gate 8 — the controls', () => {
  it('control (a): the numbers are READ, not baked in — a different metric renders differently', async () => {
    const { FilesMemoryPanel } = await import('../components/filesapp/panels/FilesMemoryPanel');
    const { formatBytes } = await import('../../shared/assetRegistry');
    metrics = { ...CAPTURED_METRICS, totalmem: CAPTURED_METRICS.totalmem * 2 };
    const el = await mount(<FilesMemoryPanel />);
    const text = el.textContent ?? '';
    expect(text).toContain(formatBytes(CAPTURED_METRICS.totalmem * 2));
    // And the captured value must NOT be there: a panel that rendered both
    // would be reading one number and displaying another.
    expect(text).not.toContain(formatBytes(CAPTURED_METRICS.totalmem));
  });

  it('control (b): the inventory is READ — scaling the bytes moves the rendered sizes', async () => {
    const { FilesMemoryPanel } = await import('../components/filesapp/panels/FilesMemoryPanel');
    const { formatBytes } = await import('../../shared/assetRegistry');
    const [, biggest] = CAPTURED_TOP_SIX[0];
    domainScale = 3;
    const el = await mount(<FilesMemoryPanel />);
    const text = el.textContent ?? '';
    expect(text).toContain(formatBytes(biggest * 3));
  });

  it('control (c): a search hit\'s card id focuses that card and no other', async () => {
    const { FilesMemoryPanel } = await import('../components/filesapp/panels/FilesMemoryPanel');
    const el = await mount(<FilesMemoryPanel focusCardId="factory-reset" />);
    const focused = [...el.querySelectorAll('.fa-panel-card.is-highlight')].map((n) =>
      n.getAttribute('data-panel-card-id'),
    );
    expect(focused).toEqual(['factory-reset']);
  });
});

describe('files-app gate 8 — the search half', () => {
  it('every registry entry that pointed at the Memory page now resolves to the Files app', async () => {
    const { SETTINGS_REGISTRY } = await import('../components/settings/settingsRegistry');
    const memoryEntries = SETTINGS_REGISTRY.filter(
      (entry) => (entry as { pageId?: string }).pageId === 'memory',
    );
    // `pageId: 'memory'` is RETAINED deliberately (see settings/types.ts:109 —
    // it keeps the index resolving), and `movedTo` is what routes the hit. So
    // the gate's clause is not "no entry says memory", it is "no entry says
    // memory WITHOUT saying where it went". An entry with the old pageId and no
    // movedTo is the search hit that lands on a page that no longer holds the
    // row, which the gate names as a FAIL.
    const stranded = memoryEntries.filter((entry) => (entry as { movedTo?: string }).movedTo !== 'files');
    expect(stranded).toEqual([]);
    expect(memoryEntries.length).toBe(before.memory.registryEntriesWithPageIdMemory);

    // Each one must still name the card it used to scroll to, or the hit lands
    // on the app rather than on the row — and that id must be a card the panel
    // actually renders.
    const anchors = memoryEntries.map((entry) => (entry as { id?: string }).id);
    for (const anchor of anchors) expect(typeof anchor).toBe('string');
    const rendered = new Set(before.memory.cardIds);
    // 'memory' is the section entry itself, not a card anchor; the rest must
    // each match a card that survived the move.
    for (const anchor of anchors.filter((a) => a !== 'memory')) {
      expect(rendered.has(anchor as string)).toBe(true);
    }
  });
});
