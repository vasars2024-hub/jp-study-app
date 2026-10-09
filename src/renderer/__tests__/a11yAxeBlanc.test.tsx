// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over Blanc: the shell at rest,
 * the App Drawer (its launcher), and Master search open with a query.
 */
import { act, createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge, typeInto, type Mounted } from './helpers/axeHarness';

let app: Mounted;

async function waitFor(check: () => boolean, ms = 8000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await settle(50);
  }
  return check();
}

beforeAll(async () => {
  installJsdomShims();
  stubBridge({ listLibrary: [], displayList: [], watchList: { items: [] }, assetsList: { assets: [], statuses: [] } });
  const { default: BlancShell } = await import('../components/blanc/BlancShell');
  app = await mount(createElement(BlancShell, { initialBook: null, onInitialBookConsumed: () => undefined }), 120);
}, 120_000);

afterAll(async () => {
  await cleanup();
});

describe('Blanc — axe-core', () => {
  it('the shell at rest', async () => {
    expect(app.host.textContent?.length, 'Blanc painted').toBeGreaterThan(20);
    expect(await a11yViolations(app.host)).toEqual([]);
  });

  it('the App Drawer (launcher)', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: 'app-drawer', cancelable: true }));
    });
    const ready = await waitFor(() => !!app.host.querySelector('[class*="drawer"]') && !/Loading/i.test(app.host.querySelector('[class*="drawer"]')?.textContent ?? ''));
    expect(ready, 'App Drawer rendered').toBe(true);
    expect(await a11yViolations(app.host)).toEqual([]);
  }, 30_000);

  it('Master search, open with a query', async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('palette:open'));
    });
    await settle(40);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog, 'Master search open').not.toBeNull();
    expect(await a11yViolations(document.body)).toEqual([]);
    const input = dialog?.querySelector('input');
    if (input) await typeInto(input, 'dic');
    await settle(20);
    expect(await a11yViolations(document.body)).toEqual([]);
  });
});
