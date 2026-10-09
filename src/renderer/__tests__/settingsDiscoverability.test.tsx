// @vitest-environment jsdom
/**
 * set2 — Settings discoverability.
 *
 *  1. Every settings control is findable: each `<SettingsCard id>` in the
 *     settings tree has a search entry (the reverse of
 *     settingsSearchReachability.test.ts, which checks entry -> card).
 *  2. "Recently changed": a change inside a card is recorded, deduplicated,
 *     capped, and listed on Home with a link back to the card.
 *  3. "Reset section" is one behaviour everywhere: it confirms, and a refusal
 *     changes nothing.
 *  4. Deep links survive the lazy Settings chunk (settingsDeepLink.ts).
 *  5. The rail's groups: System no longer holds the outside services.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const confirmDialog = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/ui')>()),
  confirmDialog,
}));

import { SETTINGS_NAV, SETTINGS_REGISTRY, groupLabelKey } from '../components/settings/settingsRegistry';
import { getRecentChanges, pushRecentChange } from '../components/settings/settingsRecent';
import { SettingsProvider } from '../components/settings/SettingsContext';
import SettingsCard from '../components/settings/SettingsCard';
import ResetSectionButton from '../components/settings/ResetSectionButton';
import type { SettingsController } from '../components/settings/types';
import {
  installSettingsLinkRelay,
  markSettingsLinkConsumed,
  resetSettingsLinkRelayForTests,
  takeRelayedSettingsLink,
} from '../settingsDeepLink';
import { en } from '../../shared/i18n/catalogs';

const SETTINGS_DIR = join(__dirname, '..', 'components', 'settings');

function sources(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.tsx$/.test(entry.name)) out[entry.name] = readFileSync(full, 'utf8');
  }
  return out;
}

/**
 * Cards deliberately without their own search entry, each with the reason.
 * Adding to this list is a decision, not a fix.
 */
const NOT_INDEXED: Record<string, string> = {
  // A duplicate rendering of `companions-leave-secret`, which IS indexed: the
  // Special page is Advanced-only, Companions is not (see the registry).
  'secret-os-leave': 'duplicate of companions-leave-secret',
};
/** Template ids — one card per data row; the page and its overview entry index them. */
const GENERATED_FAMILIES: Record<string, string> = {
  'api-keys-': 'api-keys-overview',
  'storage-': 'storage-inventory',
};

describe('settings search covers every control', () => {
  const files = sources(SETTINGS_DIR);
  const ids = new Set(SETTINGS_REGISTRY.map((e) => e.id));
  const cards: Array<{ file: string; id: string; template: boolean }> = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(/<SettingsCard\b([\s\S]*?)>/g)) {
      const literal = /\bid="([^"]+)"/.exec(m[1])?.[1];
      const template = /\bid=\{`([a-z-]+)\$\{/.exec(m[1])?.[1];
      if (literal) cards.push({ file, id: literal, template: false });
      else if (template) cards.push({ file, id: template, template: true });
      else cards.push({ file, id: '', template: false });
    }
  }

  it('reads a real corpus of cards', () => {
    expect(cards.length).toBeGreaterThan(120);
  });

  it('gives every card an id, so search and deep links can land on it', () => {
    expect(cards.filter((c) => !c.id).map((c) => c.file)).toEqual([]);
  });

  it('indexes every card id, or says why not', () => {
    const missing = cards
      .filter((c) => !c.template && !ids.has(c.id) && !(c.id in NOT_INDEXED))
      .map((c) => `${c.file}: ${c.id}`);
    expect(missing).toEqual([]);
  });

  it('covers each generated card family through an indexed overview', () => {
    for (const c of cards.filter((card) => card.template)) {
      const overview = GENERATED_FAMILIES[c.id];
      expect(overview, `${c.file}: template id ${c.id}\${…} has no overview entry`).toBeTruthy();
      expect(ids.has(overview)).toBe(true);
    }
  });

  it('keeps the exemptions honest: an exempt id must still exist as a card', () => {
    for (const id of Object.keys(NOT_INDEXED)) expect(cards.some((c) => c.id === id), id).toBe(true);
  });
});

describe('recently changed', () => {
  let root: Root | null = null;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    document.body.innerHTML = '<div id="host"></div>';
  });
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
  });

  it('dedupes by id, newest first, capped', () => {
    for (let i = 0; i < 10; i += 1) pushRecentChange(`card-${i}`, 1000 + i);
    pushRecentChange('card-3', 5000);
    const rows = getRecentChanges();
    expect(rows.length).toBe(6);
    expect(rows[0]).toEqual({ id: 'card-3', at: 5000 });
    expect(rows.filter((r) => r.id === 'card-3').length).toBe(1);
  });

  it('survives a corrupt store', () => {
    localStorage.setItem('jp-os-settings-changed-v1', '{nope');
    expect(getRecentChanges()).toEqual([]);
    localStorage.setItem('jp-os-settings-changed-v1', JSON.stringify([{ id: 1 }, { id: 'ok', at: 2 }]));
    expect(getRecentChanges()).toEqual([{ id: 'ok', at: 2 }]);
  });

  async function mountCard(children: ReturnType<typeof createElement>) {
    const host = document.getElementById('host') as HTMLElement;
    root = createRoot(host);
    const controller = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;
    await act(async () => {
      root?.render(createElement(SettingsProvider, { value: controller },
        createElement(SettingsCard, { id: 'demo-card', title: 'Demo' }, children)));
    });
    return host;
  }

  it('records a form change inside a card', async () => {
    const host = await mountCard(createElement('input', { type: 'checkbox', 'aria-label': 'x', onChange: () => undefined }));
    await act(async () => host.querySelector('input')?.click());
    expect(getRecentChanges().map((r) => r.id)).toEqual(['demo-card']);
  });

  it('records a segmented press, but not an ordinary button', async () => {
    const host = await mountCard(createElement('div', null,
      createElement('button', { type: 'button', 'aria-pressed': false, className: 'seg' }, 'A'),
      createElement('button', { type: 'button', className: 'plain' }, 'Open'),
    ));
    await act(async () => host.querySelector<HTMLButtonElement>('button.plain')?.click());
    expect(getRecentChanges()).toEqual([]);
    await act(async () => host.querySelector<HTMLButtonElement>('button.seg')?.click());
    expect(getRecentChanges().map((r) => r.id)).toEqual(['demo-card']);
  });
});

describe('reset section', () => {
  let root: Root | null = null;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    document.body.innerHTML = '<div id="host"></div>';
    confirmDialog.mockClear();
  });
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
  });

  async function click(onReset: () => void): Promise<void> {
    const host = document.getElementById('host') as HTMLElement;
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(ResetSectionButton, { settingId: 'motion-reset', section: 'Motion', label: 'Reset', onReset }));
    });
    await act(async () => host.querySelector('button')?.click());
  }

  it('asks first, as a danger action naming the section', async () => {
    const onReset = vi.fn();
    confirmDialog.mockResolvedValueOnce(true);
    await click(onReset);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const [opts] = confirmDialog.mock.calls[0] as unknown as [{ danger?: boolean; title?: string }];
    expect(opts.danger).toBe(true);
    expect(opts.title).toContain('Motion');
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(getRecentChanges().map((r) => r.id)).toEqual(['motion-reset']);
  });

  it('changes nothing when the user declines', async () => {
    const onReset = vi.fn();
    confirmDialog.mockResolvedValueOnce(false);
    await click(onReset);
    expect(onReset).not.toHaveBeenCalled();
    expect(getRecentChanges()).toEqual([]);
  });

  it('is the only reset-to-defaults control on the pages that had an unconfirmed one', () => {
    for (const file of ['MotionPage.tsx', 'FileDropsPage.tsx', 'DisplayPage.tsx']) {
      const src = readFileSync(join(SETTINGS_DIR, 'pages', file), 'utf8');
      expect(src, file).toMatch(/<ResetSectionButton\b/);
    }
  });
});

describe('deep links survive the lazy Settings chunk', () => {
  beforeEach(() => resetSettingsLinkRelayForTests());

  it('replays a link that fired before Settings mounted, once', () => {
    installSettingsLinkRelay();
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'motion', settingId: 'motion-reset' } }));
    expect(takeRelayedSettingsLink()).toEqual({ page: 'motion', settingId: 'motion-reset' });
    expect(takeRelayedSettingsLink()).toBeNull();
  });

  it('does not replay a link a mounted Settings already handled', () => {
    installSettingsLinkRelay();
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'display' } }));
    markSettingsLinkConsumed();
    expect(takeRelayedSettingsLink()).toBeNull();
  });

  it('forgets a stale link', () => {
    installSettingsLinkRelay();
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'display' } }));
    expect(takeRelayedSettingsLink(Date.now() + 60_000)).toBeNull();
  });

  it('is what SettingsApp consumes on mount', () => {
    const app = readFileSync(join(SETTINGS_DIR, 'SettingsApp.tsx'), 'utf8');
    expect(app).toMatch(/takeRelayedSettingsLink\(\)/);
    expect(app).toMatch(/markSettingsLinkConsumed\(\)/);
    const main = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8');
    expect(main).toMatch(/installSettingsLinkRelay\(\)/);
  });
});

describe('settings rail groups', () => {
  it('puts AI and API keys in their own group, and every group has a label', () => {
    const groupOf = (id: string) => SETTINGS_NAV.find((p) => p.id === id)?.group;
    expect(groupOf('ai')).toBe('Connections');
    expect(groupOf('api-keys')).toBe('Connections');
    const system = SETTINGS_NAV.filter((p) => p.group === 'System');
    expect(system.length).toBeLessThanOrEqual(6);
    for (const group of new Set(SETTINGS_NAV.map((p) => p.group).filter(Boolean))) {
      const key = groupLabelKey(group);
      expect(key, group).not.toBe(group);
      expect(en[key], key).toBeTruthy();
    }
  });
});
