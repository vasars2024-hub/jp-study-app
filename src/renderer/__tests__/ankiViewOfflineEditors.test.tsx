// @vitest-environment jsdom
/**
 * The field-mapping and card-styling editors stay reachable while Anki is
 * closed (round-2 audit F, Anki item 15). Both are profile settings that save
 * without Anki, but the view rendered them only inside the connected branch.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';

const state = vi.hoisted(() => ({
  status: { connected: false, decks: [], models: [] },
  loading: false,
  active: { id: 'p1', label: 'Japanese' },
  model: 'Kinomoto',
  connLabel: 'Not connected',
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
vi.mock('../components/anki/DeckWorkbench', () => ({ default: () => null }));
vi.mock('../views/SettingsView', () => ({ ProfileSettingsSection: () => null }));

import AnkiView from '../views/AnkiView';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('AnkiView while disconnected', () => {
  it('shows the mapping and CSS editors with a note that changes apply once Anki connects', async () => {
    await act(async () => root.render(<AnkiView />));
    expect(host.querySelector('[data-testid=disconnected]')).not.toBeNull();
    expect(host.querySelector('[data-testid=mapping]')).not.toBeNull();
    expect(host.querySelector('[data-testid=css]')).not.toBeNull();
    expect(host.textContent).toContain(en['anki.offlineEditors']);
    // The manual add-a-card form needs Anki, so it stays in the connected branch.
    expect(host.querySelector('[data-testid=manual]')).toBeNull();
  });
});
