// @vitest-environment jsdom
/**
 * Settings → Transcription → Live captions and system audio: the switch shows
 * main's capture state and flips it, the lengths and caption source write
 * through to main, and the section lists the system-wide shortcuts with a
 * way into Shortcuts.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptionsState } from '../../shared/captionsOverlay';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key,
    lang: 'en',
  }),
}));
vi.mock('../components/settings/SettingsContext', () => ({
  useSettings: () => ({
    whisperDevice: 'auto',
    whisperModelTier: 'tiny',
    chooseWhisperModelTier: vi.fn(),
    advancedMode: false,
    focusSettingId: null,
  }),
}));
vi.mock('../keyboardShortcuts', () => ({
  COMMAND_CATALOG: [
    { id: 'captions.mineRecent', label: 'Mine the last seconds of system audio' },
    { id: 'captions.toggleOverlay', label: 'Show / hide the live captions bar' },
  ],
  effectiveKeys: (id: string) => (id === 'captions.mineRecent' ? 'Ctrl+Alt+Shift+M' : ''),
  onShortcutsChanged: () => () => undefined,
}));
vi.mock('../commandI18n', () => ({ commandLabel: (id: string) => `cmd.${id}` }));
vi.mock('../whisperModelCache', () => ({
  loadDownloaded: () => ({}),
  isDownloadedIn: () => false,
  onDownloadedChanged: () => () => undefined,
}));

import CaptionsCaptureSection from '../components/settings/pages/CaptionsCaptureSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state: CaptionsState = {
  settings: {
    captureSeconds: 60,
    mineSeconds: 8,
    source: 'windows',
    overlayOpacity: 0.72,
    fontSize: 24,
    bounds: null,
    transcribeMined: true,
  },
  capture: 'off',
  bufferedMs: 0,
  recordingSince: null,
  overlayOpen: false,
  windowsAttached: false,
  windowsWaiting: false,
  gumModelMissing: false,
  supported: true,
  studyLang: 'ru',
};

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function mount(): Promise<{ el: HTMLElement; api: Record<string, ReturnType<typeof vi.fn>> }> {
  const api = {
    captionsGetState: vi.fn(() => Promise.resolve(state)),
    onCaptionsState: vi.fn(() => () => undefined),
    captionsSetCapture: vi.fn((on: boolean) => Promise.resolve({ ...state, capture: on ? 'on' : 'off' })),
    captionsSetSettings: vi.fn((patch: object) => Promise.resolve({ ...state, settings: { ...state.settings, ...patch } })),
    captionsToggleOverlay: vi.fn((open: boolean) => Promise.resolve({ ...state, overlayOpen: open })),
  };
  (window as unknown as { api: unknown }).api = api;
  const el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<CaptionsCaptureSection />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { el, api };
}

describe('CaptionsCaptureSection', () => {
  it('shows capture off by default, with the privacy note, and turns it on', async () => {
    const { el, api } = await mount();
    const toggle = el.querySelector('input[role="switch"]') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(el.textContent).toContain('settings.captions.privacy');
    await act(async () => { toggle.click(); });
    expect(api.captionsSetCapture).toHaveBeenCalledWith(true);
    expect((el.querySelector('input[role="switch"]') as HTMLInputElement).checked).toBe(true);
  });

  it('writes the caption source and lengths through to main', async () => {
    const { el, api } = await mount();
    const gum = [...el.querySelectorAll('.sp-seg-btn')].find((b) => b.textContent === 'captions.source.gum') as HTMLButtonElement;
    await act(async () => { gum.click(); });
    expect(api.captionsSetSettings).toHaveBeenCalledWith({ source: 'gum' });
    const keep = el.querySelector('#captions-keep') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(keep, '90');
      keep.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(api.captionsSetSettings).toHaveBeenCalledWith({ captureSeconds: 90 });
  });

  it('lists the system-wide shortcuts and opens Shortcuts', async () => {
    const { el } = await mount();
    expect(el.querySelector('kbd')?.textContent).toBe('Ctrl+Alt+Shift+M');
    expect(el.textContent).toContain('settings.captions.unbound');
    const seen: unknown[] = [];
    window.addEventListener('settings:navigate', (e) => seen.push((e as CustomEvent).detail));
    const open = [...el.querySelectorAll('button')].find((b) => b.textContent === 'settings.captions.openShortcuts')!;
    await act(async () => { open.click(); });
    expect(seen).toEqual([{ page: 'shortcuts' }]);
  });
});
