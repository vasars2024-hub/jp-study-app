// @vitest-environment jsdom
/**
 * The keyboard help inside the player lists the study keys as bound right now (from the
 * live shortcut store) and the adopted player's own keys (from `playerKeymap`).
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyKeyboardHelp from '../StudyKeyboardHelp';
import { resetBinding, setBinding } from '../../renderer/keyboardShortcuts';

// The shortcut store imports the music bus, which talks to the main process at import.
vi.mock('../../renderer/playerBus', () => ({
  next: vi.fn(),
  prev: vi.fn(),
  toggle: vi.fn(),
  setVolume: vi.fn(),
  getState: vi.fn(() => ({ volume: 1 })),
}));

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => localStorage.clear());

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  resetBinding('video.replayLine');
});

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<StudyKeyboardHelp />));
  return host;
}

describe('StudyKeyboardHelp', () => {
  it('lists the study keys with their live binding, and unbound ones as "not set"', async () => {
    const host = await mount();
    const replay = host.querySelector('[data-command="video.replayLine"]');
    expect(replay?.querySelector('kbd')?.textContent).toBe('R');
    const large = host.querySelector('[data-command="video.subEarlierLarge"]');
    expect(large?.textContent).toContain('not set');
    expect(host.querySelector('[data-command="video.resumeLast"]')).toBeNull();
    // Bound rows come first.
    const rows = [...host.querySelectorAll('[data-command]')];
    const firstUnbound = rows.findIndex((row) => !row.querySelector('kbd'));
    expect(rows.slice(firstUnbound).every((row) => !row.querySelector('kbd'))).toBe(true);
  });

  it('lists "line starts now" and condensed audio with their defaults', async () => {
    const host = await mount();
    expect(host.querySelector('[data-command="video.alignPrevLine"] dt')?.textContent).toBe('Previous line starts now');
    expect(host.querySelector('[data-command="video.alignPrevLine"] kbd')?.textContent).toMatch(/Shift.*W/);
    expect(host.querySelector('[data-command="video.alignNextLine"] dt')?.textContent).toBe('Next line starts now');
    expect(host.querySelector('[data-command="video.alignNextLine"] kbd')?.textContent).toMatch(/Shift.*S/);
    const condensed = host.querySelector('[data-command="video.condensedAudio"]');
    expect(condensed?.querySelector('dt')?.textContent).toBe('Condensed audio (MP3)');
    expect(condensed?.textContent).toContain('not set');
  });

  it('follows a rebind at once', async () => {
    const host = await mount();
    await act(async () => {
      setBinding('video.replayLine', 'Y');
    });
    expect(host.querySelector('[data-command="video.replayLine"] kbd')?.textContent).toBe('Y');
  });

  it('lists the player\'s own keys', async () => {
    const host = await mount();
    expect(host.querySelector('[data-player-action="seekForward"] kbd')?.textContent).toBe('D');
    expect(host.querySelector('[data-player-action="playPause"]')).not.toBeNull();
  });
});
