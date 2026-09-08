// @vitest-environment jsdom
/**
 * D344 — the settings inventory's Clear buttons, named.
 *
 * Measured live on 2026-09-08 (window 2, pid 4652): Files ▸ System ▸ Memory
 * rendered **27 buttons whose accessible name was the single word "Clear"**,
 * with no `aria-label` and no `title`. Each one destroys a different settings
 * domain. A screen reader lists them flat — 27 identical destructive commands
 * — and the table row that disambiguates them is only reachable in table
 * navigation mode.
 *
 * The visible label deliberately stays "Clear": the column head names the
 * column, and repeating the domain in 27 cells is unreadable for everyone
 * else. This asserts the ACCESSIBLE name diverges from it, which is the whole
 * point, so it also asserts the visible text is unchanged.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DomainInventoryItem } from '../storage/settingsCatalog';

function domain(id: string, label: string): DomainInventoryItem {
  return {
    id,
    label,
    description: `${label} description`,
    category: 'personalization',
    bytes: 512,
    count: 3,
    present: true,
    detail: `${label} detail`,
    clearable: true,
    tier: 'local',
  };
}

const DOMAINS: DomainInventoryItem[] = [
  domain('living', 'Living layer (particles, companions, lighting)'),
  domain('wallpaper', 'Wallpaper and lockscreen'),
  // Not clearable: it must render no button at all, so a name cannot be
  // "fixed" by labelling a control the user is not offered.
  { ...domain('host', 'Host configuration'), clearable: false },
];

vi.mock('../storage/storage', () => ({
  listSettingsDomains: () => Promise.resolve(DOMAINS),
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
    root?.render(<FilesMemoryPanel />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

/** Every button whose VISIBLE text is the bare word the defect was about. */
function clearButtons(): HTMLButtonElement[] {
  return Array.from(host?.querySelectorAll('button') ?? []).filter(
    (b) => b.textContent?.trim() === 'Clear',
  ) as HTMLButtonElement[];
}

describe('D344 — every domain Clear button says which domain', () => {
  it('gives each one a distinct accessible name carrying its domain', async () => {
    await mountPanel();
    const buttons = clearButtons();
    expect(buttons).toHaveLength(2);

    const names = buttons.map((b) => b.getAttribute('aria-label') ?? '');
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(names[0]).toContain('Living layer (particles, companions, lighting)');
    expect(names[1]).toContain('Wallpaper and lockscreen');

    // The visible label is unchanged — the fix is the accessible name, not a
    // 27-times-repeated domain name in the table cell.
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Clear', 'Clear']);
  });

  it('CONTROL: a domain that cannot be cleared is offered no button to name', async () => {
    await mountPanel();
    const labels = clearButtons().map((b) => b.getAttribute('aria-label') ?? '');
    expect(labels.some((n) => n.includes('Host configuration'))).toBe(false);
  });
});
