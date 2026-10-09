// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over first-run setup (every
 * step), the guided tour and the first-steps checklist; and the setup dialog's
 * keyboard contract: Tab and Shift+Tab stay inside from ANY focus position
 * (each step focuses its heading, which used to let Shift+Tab escape), and
 * closing hands focus back to whatever opened it.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_CATALOG } from '../../shared/assetRegistry';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

beforeAll(() => {
  installJsdomShims();
});

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem(TELEMETRY_CONSENT_KEY, 'no');
  stubBridge({
    assetsList: { assets: ASSET_CATALOG, statuses: [] },
    assetsFreeSpace: 50_000_000_000,
    dictListYomitan: [{ id: 'jmdict' }],
    ankiStatus: { connected: true, decks: ['Default', 'Mining'], models: [] },
  });
  const { resetFirstRunSessionForTests } = await import('../firstRunSetup');
  resetFirstRunSessionForTests();
});

afterEach(async () => {
  await cleanup();
});

const tab = async (shiftKey = false): Promise<void> => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
    );
  });
};

describe('first-run setup — axe-core', () => {
  it('every step', async () => {
    const { FIRST_RUN_STEPS, patchFirstRun } = await import('../firstRunSetup');
    const { default: FirstRunSetup } = await import('../components/onboarding/FirstRunSetup');
    const failures: string[] = [];
    for (const step of FIRST_RUN_STEPS) {
      patchFirstRun({ step });
      const m = await mount(createElement(FirstRunSetup, { onClose: vi.fn() }), 30);
      expect(m.host.querySelector('[role="dialog"]'), `${step}: dialog`).not.toBeNull();
      for (const line of await a11yViolations(m.host)) failures.push(`${step}: ${line}`);
      await m.unmount();
    }
    expect(failures).toEqual([]);
  });

  it('keeps Tab inside from the focused heading, both ways, and returns focus to its opener', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Restart setup';
    document.body.append(opener);
    opener.focus();
    const { patchFirstRun } = await import('../firstRunSetup');
    patchFirstRun({ step: 'anki' });
    const { default: FirstRunSetup } = await import('../components/onboarding/FirstRunSetup');
    const m = await mount(createElement(FirstRunSetup, { onClose: vi.fn() }), 30);
    const card = m.host.querySelector('.frs-card') as HTMLElement;
    const heading = m.host.querySelector('#frs-step-title') as HTMLElement;
    expect(document.activeElement, 'step heading focused').toBe(heading);

    // Shift+Tab from the heading: it is not a tab stop, so the old first/last
    // check let the browser carry focus out of the modal.
    await tab(true);
    expect(card.contains(document.activeElement), 'Shift+Tab from the heading stays in').toBe(true);
    const buttons = [...card.querySelectorAll<HTMLElement>('button:not([disabled])')];
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    // ...and Tab from the last control wraps to the first.
    await tab(false);
    expect(card.contains(document.activeElement), 'Tab from the last control stays in').toBe(true);

    await m.unmount();
    expect(document.activeElement, 'focus back on the opener').toBe(opener);
  });

  it('the tour and the first-steps checklist', async () => {
    const { closeFirstRunSetup } = await import('../firstRunSetup');
    closeFirstRunSetup('done', 0);
    const { default: TourOverlay } = await import('../components/onboarding/TourOverlay');
    const tour = await mount(<TourOverlay holdForSetup={false} />, 40);
    expect(await a11yViolations(document.body)).toEqual([]);
    await tour.unmount();
    const { default: FirstStepsChecklist } = await import('../components/onboarding/FirstStepsChecklist');
    const list = await mount(createElement(FirstStepsChecklist), 30);
    expect(await a11yViolations(list.host)).toEqual([]);
    await settle(5);
  });
});
