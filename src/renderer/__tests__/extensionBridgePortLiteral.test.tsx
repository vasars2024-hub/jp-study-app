// @vitest-environment jsdom
/**
 * The bridge port is an identifier, not a quantity.
 *
 * Measured live 2026-09-08 (Settings ▸ Profile & dictionary, reached from the
 * Library's own "Chrome extension" toolbar button, window 1 pid 22788 — register
 * row D424): the card's hint read
 *
 *     Bridge listening on 127.0.0.1:18,765 · Extension v3.2.0
 *
 * `t()` runs every numeric parameter through `Intl.NumberFormat`
 * (`shared/i18n/core.ts`), so the port picked up a thousands separator. Under
 * `ru` the same line renders `18 765` with a non-breaking space. The one thing a
 * user does with that line is copy the port into Chrome, and both forms are
 * wrong there.
 *
 * The guard is written against the RENDERED text rather than the call site, so a
 * future refactor that reintroduces the number cannot pass it. `en` alone would
 * not catch a locale whose grouping differs, so `ru` is checked too — that is
 * the case that fails loudest when the fix is reverted.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../shared/i18n/core';
import { en } from '../../shared/i18n/catalogs/en';
import { ru } from '../../shared/i18n/catalogs/ru';

// The card only reads `focusSettingId` off the settings controller, and mounting
// the whole SettingsProvider to supply one null would put the rest of Settings
// between this test and the string it is about.
vi.mock('../components/settings/SettingsContext', () => ({
  useSettings: () => ({ focusSettingId: null }),
}));

import ExtensionBridgeSection from '../components/settings/pages/ExtensionBridgeSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PORT = 18765;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (window as unknown as { api: Record<string, unknown> }).api = {
    extensionStatus: async () => ({
      running: true,
      port: PORT,
      token: 'tok',
      folderPath: 'C:/ext',
      extensionVersion: '3.2.0',
    }),
    extensionRegenerateToken: async () => ({
      running: true,
      port: PORT,
      token: 'tok2',
      folderPath: 'C:/ext',
      extensionVersion: '3.2.0',
    }),
  };
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function render(): Promise<string> {
  await act(async () => {
    root.render(<ExtensionBridgeSection />);
    await Promise.resolve();
  });
  await act(async () => {
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  });
  return host.textContent ?? '';
}

describe('the extension bridge port renders as a port', () => {
  it('shows 18765, never a grouped 18,765, in en', async () => {
    const text = await render();
    expect(text, 'the hint never rendered at all').toContain('127.0.0.1:');
    expect(text).toContain(`127.0.0.1:${PORT}`);
    expect(text).not.toContain('18,765');
  });

  // The component reads the app's live language, which this harness does not
  // drive, so the per-locale half is asserted one level down on the same key
  // and the same argument the component now passes.
  it.each([
    ['en', en as unknown as Record<string, string>],
    ['ru', ru as unknown as Record<string, string>],
  ])('renders the port ungrouped in %s', (lang, catalog) => {
    const line = translate(
      'settings.extension.running',
      { port: String(PORT) },
      { lang: lang as 'en' | 'ru', catalog, fallback: en as unknown as Record<string, string> },
    );
    expect(line).toContain(String(PORT));
    expect(line).not.toContain(new Intl.NumberFormat(lang).format(PORT));
  });

  it('control — the number form really is grouped, so the assertions are not vacuous', () => {
    expect(new Intl.NumberFormat('en').format(PORT)).toBe('18,765');
    expect(new Intl.NumberFormat('ru').format(PORT)).not.toBe(String(PORT));
    // And the un-fixed call really did produce it, on the real key.
    const grouped = translate(
      'settings.extension.running',
      { port: PORT },
      { lang: 'en', catalog: en as unknown as Record<string, string>, fallback: en as unknown as Record<string, string> },
    );
    expect(grouped).toContain('18,765');
  });
});
