// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScraperApp from '../components/scraper/ScraperApp';
import { openScraperSettings } from '../scraperSettingsNavigation';
import { loadScraperShellState, onScraperShellChanged, patchScraperShellState,
  saveScraperShellState, SCRAPER_SHELL_STORAGE_KEY } from '../scraperShellStore';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';

let root: Root;
let host: HTMLDivElement;
const popOut = vi.fn(async () => undefined);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  saveScraperShellState(DEFAULT_SCRAPER_SHELL_STATE);
  Object.defineProperty(window, 'api', { configurable: true, value: { popOut } });
  popOut.mockReset().mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const shell = () => host.querySelector('.scr-shell');

describe('Scraper settings handoff', () => {
  it('opens the network drawer on an already-mounted Scraper, then reveals Profiles', async () => {
    await act(async () => root.render(<ScraperApp />));
    expect(shell()?.classList.contains('is-drawer-open')).toBe(false);
    await act(async () => openScraperSettings('drawer'));
    expect(loadScraperShellState()).toMatchObject({ drawerOpen: true, drawerCategory: 'network' });
    expect(shell()?.classList.contains('is-drawer-open')).toBe(true);
    await act(async () => openScraperSettings('profiles'));
    expect(shell()?.classList.contains('is-drawer-open')).toBe(false);
    expect(host.querySelector('#scr-settings-drawer')).toBeNull();
    expect(host.querySelector('[data-scr-card="profile-presets"]')).not.toBeNull();
  });

  it('stages a cold destination before requesting a pop-out from detached Settings', async () => {
    popOut.mockImplementation(async () => {
      expect(loadScraperShellState()).toMatchObject({ drawerOpen: true, drawerCategory: 'network' });
    });
    openScraperSettings('drawer');
    expect(popOut).toHaveBeenCalledWith('scraper');
    await act(async () => root.render(<ScraperApp />));
    expect(shell()?.classList.contains('is-drawer-open')).toBe(true);
  });

  it('honors a desktop host receipt instead of opening another window', () => {
    const received = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener('os:open', received);
    try {
      openScraperSettings('profiles');
      expect(received).toHaveBeenCalledOnce();
      expect(popOut).not.toHaveBeenCalled();
      expect(loadScraperShellState()).toMatchObject({ page: 'profiles', drawerOpen: false });
    } finally {
      window.removeEventListener('os:open', received);
    }
  });

  it('receives cross-window updates and deletion, ignoring unrelated storage', () => {
    const changed = vi.fn();
    const off = onScraperShellChanged(changed);
    try {
      localStorage.setItem(SCRAPER_SHELL_STORAGE_KEY,
        JSON.stringify({ ...DEFAULT_SCRAPER_SHELL_STATE, drawerOpen: true }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
      expect(changed).not.toHaveBeenCalled();
      window.dispatchEvent(new StorageEvent('storage', { key: SCRAPER_SHELL_STORAGE_KEY }));
      expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ drawerOpen: true }));
      localStorage.removeItem(SCRAPER_SHELL_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: SCRAPER_SHELL_STORAGE_KEY }));
      expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ drawerOpen: false }));
    } finally { off(); }
    changed.mockClear();
    patchScraperShellState({ drawerOpen: true });
    expect(changed).not.toHaveBeenCalled();
  });
});
