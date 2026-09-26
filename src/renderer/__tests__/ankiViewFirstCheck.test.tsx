// @vitest-environment jsdom
/**
 * V12, layout jump on open: Anki's first connection check painted a one-line banner with
 * the Deck Workbench and the profile section right under it, then swapped the banner for
 * the ~380px connection card, shoving both sections down ~280px a third of a second after
 * the window opened. Until the first answer arrives the body is one placeholder card and
 * nothing is mounted below it; a hanging check releases the offline sections after a
 * grace period.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  status: null as null | { connected: boolean; decks: string[]; models: string[] },
  loading: true,
  active: { id: 'p1', label: 'Japanese' },
  model: 'Kinomoto',
  connLabel: 'Checking',
  check: () => undefined,
}));
vi.mock('../components/anki/AnkiContent', () => ({
  useAnkiConfig: () => state,
  AnkiDeckNoteType: () => <div data-testid="deck" />,
  AnkiDisconnected: () => <div data-testid="disconnected" />,
  AnkiFieldMapping: () => <div data-testid="mapping" />,
  AnkiManualCardForm: () => <div data-testid="manual" />,
  AnkiNoteCss: () => <div data-testid="css" />,
  AnkiPreviewPane: () => <div data-testid="preview" />,
}));
vi.mock('../components/anki/DeckWorkbench', () => ({ default: () => <div data-testid="workbench" /> }));
vi.mock('../views/SettingsView', () => ({ ProfileSettingsSection: () => <div data-testid="profile" /> }));

import AnkiView, { ANKI_FIRST_CHECK_GRACE_MS } from '../views/AnkiView';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.status = null;
  state.loading = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Anki opening without a layout jump', () => {
  it('shows one placeholder and nothing below it until the first check answers', async () => {
    await act(async () => root.render(<AnkiView />));
    expect(host.querySelector('.anki-first-check')).not.toBeNull();
    expect(host.querySelector('[data-testid=workbench]')).toBeNull();
    expect(host.querySelector('[data-testid=profile]')).toBeNull();
    state.status = { connected: false, decks: [], models: [] };
    state.loading = false;
    await act(async () => root.render(<AnkiView />));
    expect(host.querySelector('.anki-first-check')).toBeNull();
    expect(host.querySelector('[data-testid=disconnected]')).not.toBeNull();
    expect(host.querySelector('[data-testid=profile]')).not.toBeNull();
  });

  it('a check that hangs does not hold the offline sections back for long', async () => {
    await act(async () => root.render(<AnkiView />));
    expect(host.querySelector('[data-testid=profile]')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(ANKI_FIRST_CHECK_GRACE_MS + 10);
    });
    expect(host.querySelector('[data-testid=profile]')).not.toBeNull();
  });
});
