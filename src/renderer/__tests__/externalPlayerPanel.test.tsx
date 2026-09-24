// @vitest-environment jsdom
/**
 * **This file never ran until slice 40.** `vitest.config.ts` includes
 * `src/renderer/__tests__/**\/*.test.ts` — `.ts`, not `.tsx` — so it and
 * `mediaTrackingSourcesHistory.test.tsx` were collected by nothing. Phase 5 recorded that as
 * a tooling gap and left the glob alone (root config, out of scope per `CLAUDE.md`).
 *
 * When it was finally executed it failed with `useSettings outside SettingsProvider`: the
 * panel's `SettingsCard` gained a context dependency after this test was written, and nothing
 * was ever going to say so. **A test that never runs is not a test** — it is a claim, and this
 * one had been false long enough that the component it describes had moved.
 *
 * Run it with `docs/migration/tools/vitest.tsx.config.mjs` until the root glob is widened by
 * its owner.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ExternalPlayerPanel from '../components/settings/pages/ExternalPlayerPanel';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';

vi.mock('../externalPlayerStore', () => ({
  loadExternalPlayerPreferences: () => ({ profiles: [], defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null }),
  saveExternalPlayerPreferences: (value: unknown) => value,
  commitExternalPlayerPreferences: async (value: unknown) => ({ preferences: value, rejected: [] }),
  hydrateExternalPlayerPreferences: async () => ({ profiles: [], defaultProfileId: null, contentTypeProfileIds: {}, lastUsedProfileId: null }),
  onExternalPlayerPreferencesChanged: () => () => undefined,
}));

/**
 * Only what `SettingsCard` reads. A fuller stub would be a second copy of the controller,
 * free to drift from the real one — which is the failure mode this file is an example of.
 */
const settings = { advancedMode: false } as unknown as SettingsController;

beforeAll(() => {
  // React only treats `act` as configured when this is set; without it every render logs
  // "The current testing environment is not configured to support act(...)".
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * Type into a CONTROLLED input the way React can see — see the same helper in
 * `mediaTrackingSourcesHistory.test.tsx`, where this trap cost a real assertion. `input.value
 * = x` writes past React's value tracker, so `onChange` never runs: this test's two
 * assignments were silent no-ops for as long as the file existed, and the assertions below
 * happened not to depend on them.
 */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ExternalPlayerPanel', () => {
  afterEach(() => document.body.replaceChildren());
  it('creates a player profile through the renderer form', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <SettingsProvider value={settings}>
          <ExternalPlayerPanel />
        </SettingsProvider>,
      );
    });
    const add = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Add player') as HTMLButtonElement;
    expect(add, 'the panel renders an "Add player" control').toBeTruthy();
    await act(async () => { add.click(); });
    const name = host.querySelector('#external-name') as HTMLInputElement;
    const path = host.querySelector('#external-path') as HTMLInputElement;
    const save = () => host.querySelector('button.btn.primary') as HTMLButtonElement;
    // Save is gated on both fields being non-empty, so its disabled state is the one
    // observable that proves the typing reached the component rather than only the DOM.
    expect(save().disabled).toBe(true);
    await act(async () => { typeInto(name, 'VLC'); });
    expect(save().disabled, 'a name alone is not enough').toBe(true);
    await act(async () => { typeInto(path, 'C:/vlc.exe'); });
    expect(host.querySelector('legend')?.textContent).toBe('Add player');
    expect(save().textContent).toBe('Save player');
    expect(save().disabled, 'both fields filled — the form is submittable').toBe(false);
    root.unmount();
  });
});
