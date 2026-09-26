// @vitest-environment jsdom
/**
 * Liquid Workplace L9 · onboarding + help.
 *
 * Settings → Help → "Replay tour" said "The tour will start again now." on
 * every click. MEASURED LIVE 2026-08-30 in the running app, before the fix:
 * `.tour-root` stayed at **0** while the store went `replays` 8 → 9, and the
 * success line rendered anyway.
 *
 * On the SHIPPED branch it is worse than a stale flag. `TourOverlay.tsx`, its
 * stylesheet, its step script and the `App.tsx` mount are untracked work
 * stranded since 2026-08-05 — `git cat-file -e HEAD:…/TourOverlay.tsx` fails —
 * while `HelpPage.tsx` and `onboardingStore.ts` were committed without them in
 * `b63846ea`. So at HEAD nothing can ever answer that button.
 *
 * These cases are therefore written against the store contract and the page,
 * both of which ARE in HEAD, and they pass with or without the overlay: the
 * message follows the receipt, not the request.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import HelpPage from '../components/settings/pages/HelpPage';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import { announceTourStarted, loadOnboarding, markTourComplete, onTourArmChanged } from '../onboardingStore';

// The shortcuts card on the same page has its own suite; it pulls in the command
// registry, which needs the preload bridge this suite does not stand up.
vi.mock('../components/settings/pages/HelpShortcutsCard', () => ({ default: () => null }));

// `SettingsCard` reads two fields and nothing else on this page.
const settings = { advancedMode: false, focusSettingId: null } as unknown as SettingsController;

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => localStorage.clear());
afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <SettingsProvider value={settings}>
        <HelpPage />
      </SettingsProvider>,
    );
  });
}

const replayButton = (): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Replay tour')!;
const status = (): string => host.querySelector('[role="status"]')?.textContent?.trim() ?? '';

describe('Settings → Help → Replay tour', () => {
  it('says only that the tour is ARMED when nothing answers — the state this branch ships', async () => {
    markTourComplete();
    await mount();
    expect(status(), 'no claim before the button is used').toBe('');

    await act(async () => { replayButton().click(); });
    expect(status()).toBe('The tour is armed. It starts the next time the desktop window opens.');
    expect(status(), 'the old unconditional claim must not come back').not.toContain('start again now');
    expect(loadOnboarding().completedAt, 'the store IS re-armed either way').toBeNull();
  });

  it('says it STARTED only when an overlay raises the receipt', async () => {
    markTourComplete();
    await mount();
    // Stand in for the overlay: answer the arm event synchronously, as it does.
    const stop = onTourArmChanged(() => announceTourStarted());
    await act(async () => { replayButton().click(); });
    stop();
    expect(status()).toBe('The tour will start again now.');
  });

  it('offers every chapter on its own; picking one re-arms the tour at that chapter', async () => {
    markTourComplete();
    await mount();
    const tile = host.querySelector<HTMLButtonElement>('[data-tour-chapter="companion"]');
    expect(tile, 'Help lists the chapters').toBeTruthy();
    expect(host.querySelectorAll('[data-tour-chapter]').length).toBe(12);
    await act(async () => { tile?.click(); });
    expect(loadOnboarding().completedAt, 're-armed').toBeNull();
    expect(loadOnboarding().requestedChapter, 'at the chapter that was picked').toBe('companion');
    expect(host.querySelector('#guided-tour, [data-setting-id="guided-tour"]'), 'the card is the tour’s anchor').toBeTruthy();
  });

  it('an answer that arrives late is still reported as armed, not as started', async () => {
    markTourComplete();
    await mount();
    // A popped-out Settings window reaches the desktop overlay through the
    // `storage` event, which cannot answer inside the click. Claiming "now"
    // there would be the same lie in a different host.
    const stop = onTourArmChanged(() => setTimeout(announceTourStarted, 0));
    await act(async () => { replayButton().click(); });
    stop();
    expect(status()).toBe('The tour is armed. It starts the next time the desktop window opens.');
  });
});
