// @vitest-environment jsdom
/**
 * P1 gate 4: a user who has never seen MAL sync can connect using only what the
 * panel renders.
 *
 * The one fact that decides it is *ordering*. All of this text existed already
 * in `malSync.callbackDesc`, but that string is inside `{pendingState && …}` —
 * it appears only after Connect has been pressed, which is after the browser has
 * already failed to load `http://localhost/oauth/callback`. A user who has
 * watched that happen has concluded the feature is broken and is not reading
 * anything. So the assertions below are about document order, not presence: a
 * refactor that keeps every string but moves the explanation back under the
 * button has re-broken the gate, and only an order assertion catches it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import MalSyncPanel from '../components/settings/pages/MalSyncPanel';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import { MAL_SYNC_EN } from '../../shared/i18n/malSync/en';

/** Only what `SettingsCard` reads — see `externalPlayerPanel.test.tsx` on why. */
const settings = { advancedMode: false } as unknown as SettingsController;

interface Status {
  configured: boolean;
  connected: boolean;
  tokensEncrypted: boolean;
}

/**
 * `window.api` is frozen in the real preload, so the stub is installed once,
 * before anything imports it, and the connection state is swapped through a
 * mutable box rather than by reassigning the object.
 */
const state: { status: Status } = {
  status: { configured: true, connected: false, tokensEncrypted: true },
};

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      malStatus: vi.fn(async () => ({ ok: true, data: state.status })),
      malLibraryList: vi.fn(async () => ({ entries: [], summary: { total: 0, byStatus: {}, derivatives: 0, lastSyncAt: null } })),
      openExternal: vi.fn(),
    },
  });
});

let root: Root | null = null;

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <SettingsProvider value={settings}>
        <MalSyncPanel />
      </SettingsProvider>,
    );
  });
  return host;
}

/**
 * The deepest element carrying `needle` — i.e. the one that actually renders it.
 *
 * Searching for the *first* match instead is the trap: `textContent` is
 * inherited, so the card wrapper contains every string on the panel and always
 * sits at index 0. An order assertion written against it passes no matter where
 * the text really is, which is exactly how this test first "passed" its own
 * mutation control.
 */
function rendererOf(host: HTMLElement, needle: string): Element {
  const matches = [...host.querySelectorAll('*')].filter((node) => (node.textContent ?? '').includes(needle));
  expect(matches.length, `no element contains ${JSON.stringify(needle.slice(0, 40))}`).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

/** True when `a` comes before `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('MalSyncPanel connection walkthrough', () => {
  it('explains the dead callback page before the Connect button, not after it', async () => {
    state.status = { configured: true, connected: false, tokensEncrypted: true };
    const host = await mount();

    const connect = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === MAL_SYNC_EN['malSync.connect']);
    expect(connect, 'the panel renders a Connect button').toBeTruthy();

    // The step that promises the failure. If it lands after the button it is
    // being read too late to do its job.
    const promise = rendererOf(host, 'will not load');
    expect(promise.closest('.mal-connect-walkthrough')).not.toBeNull();
    expect(precedes(promise, connect as Element)).toBe(true);
  });

  it('names the address-bar value the user has to copy', async () => {
    state.status = { configured: true, connected: false, tokensEncrypted: true };
    const host = await mount();
    // Not a paraphrase: the user is looking for this exact token in a URL.
    expect(host.textContent).toContain('code=');
    expect(host.textContent).toContain('http://localhost/oauth/callback');
  });

  it('drops the walkthrough once the account is connected', async () => {
    state.status = { configured: true, connected: true, tokensEncrypted: true };
    const host = await mount();
    expect(host.querySelector('.mal-connect-walkthrough')).toBeNull();
    // Negative control for the test itself: the panel really did render the
    // connected branch, so the absence above is the guard and not a dead mount.
    expect(host.textContent).toContain(MAL_SYNC_EN['malSync.signOut']);
  });

  it('offers the library save only once something has been fetched', async () => {
    state.status = { configured: true, connected: true, tokensEncrypted: true };
    const host = await mount();
    const save = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === MAL_SYNC_EN['malSync.librarySave']);
    expect(save?.disabled).toBe(true);
    expect(host.textContent).toContain(MAL_SYNC_EN['malSync.libraryNothingFetched']);
    expect(host.textContent).toContain(MAL_SYNC_EN['malSync.libraryEmpty']);
  });
});
