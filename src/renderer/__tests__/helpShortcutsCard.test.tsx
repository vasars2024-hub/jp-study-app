// @vitest-environment jsdom
/**
 * Settings > Help promised keyboard shortcuts ("Guided tour and keyboard
 * shortcuts") and showed none. The card lists every bound command from the live
 * bindings, so a rebind is reflected at once.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// `keyboardShortcuts` -> `playerBus` touches `window.api` at module-eval time, so
// the preload bridge is stood up before any import runs.
vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});
import HelpShortcutsCard from '../components/settings/pages/HelpShortcutsCard';
import { formatKeysDisplay, getBindings, resetAllBindings, setBinding } from '../keyboardShortcuts';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';

// `SettingsCard` reads two fields and nothing else.
const settings = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  resetAllBindings();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <SettingsProvider value={settings}>
        <HelpShortcutsCard />
      </SettingsProvider>,
    );
  });
}

describe('Settings > Help — keyboard shortcuts', () => {
  it('K12: lists the video player’s own keys in a Player group', async () => {
    await mount();
    const group = host.querySelector('[data-group="player"]');
    expect(group).toBeTruthy();
    const seek = group?.querySelector('[data-player-action="seekForward"]');
    expect(seek?.querySelector('kbd')?.textContent).toBe('D');
    expect(seek?.querySelector('dt')?.textContent).toBe('Skip forward 30 s');
    expect(group?.querySelector('[data-player-action="playPause"] kbd')?.textContent).toBe('Space · Enter');
  });

  it('lists every bound command with its current keys, and nothing unbound', async () => {
    await mount();
    const bound = getBindings().filter((row) => row.keys);
    // The player's own keys are a separate group (K12), counted by their own test below.
    const rows = host.querySelectorAll('.help-shortcuts-row:not([data-player-action])');
    expect(rows.length).toBe(bound.length);
    const palette = bound.find((row) => row.id === 'nav.search');
    expect(host.textContent).toContain(formatKeysDisplay(palette?.keys ?? ''));
  });

  it('follows a rebind live', async () => {
    await mount();
    await act(async () => {
      setBinding('nav.widgets', 'Ctrl+Alt+W');
    });
    expect(host.textContent).toContain(formatKeysDisplay('Ctrl+Alt+W'));
  });
});
