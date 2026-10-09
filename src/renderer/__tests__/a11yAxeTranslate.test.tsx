// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the Translate workbench:
 * empty, with text typed, and in the Aero skin, with the bridge stubbed so the
 * translation itself stays pending (the in-flight state is what a screen reader
 * user waits through).
 */
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge, typeInto } from './helpers/axeHarness';

vi.mock('../translator', () => ({ translateTo: () => new Promise(() => undefined) }));

beforeAll(() => {
  installJsdomShims();
  stubBridge({ listLibrary: [] });
});

afterEach(async () => {
  await cleanup();
  document.documentElement.removeAttribute('data-materials');
  localStorage.clear();
});

describe('Translate — axe-core', () => {
  for (const material of ['', 'aero']) {
    it(`the workbench${material ? ` (${material})` : ''}, empty and with text`, async () => {
      if (material) document.documentElement.setAttribute('data-materials', material);
      const { default: TranslateView } = await import('../views/TranslateView');
      const { host } = await mount(createElement(TranslateView), 40);
      const input = host.querySelector('textarea');
      expect(input, 'source text field').not.toBeNull();
      expect(await a11yViolations(host)).toEqual([]);
      await typeInto(input as HTMLTextAreaElement, '今日は良い天気ですね。');
      await settle(20);
      expect(await a11yViolations(host)).toEqual([]);
    });
  }
});
