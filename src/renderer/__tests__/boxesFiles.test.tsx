// @vitest-environment jsdom
/**
 * Round 3 "no ugly boxes" — Files ▸ Clean up.
 *
 * Every button in the cleanup sheet carried `fa-btn`, a class with no stylesheet, so the
 * sheet was a column of Chromium's grey slabs; its class list sat in a bare fieldset (a UA
 * groove box) and its policy picker was a bare native select. The sheet now uses `.btn`, a
 * frameless `ui-group` and the ui Select.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CleanupSheet } from '../components/filesapp/CleanupSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = (): undefined => undefined;
  Object.defineProperty(window, 'api', { configurable: true, writable: true, value: {} });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('Files cleanup sheet', () => {
  it('uses the design-system button, group and select', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<CleanupSheet onClose={() => undefined} onChanged={() => undefined} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.classList.contains('fa-btn'), b.textContent ?? '').toBe(false);
      expect(b.classList.contains('btn'), b.textContent ?? '').toBe(true);
    }
    const group = host.querySelector('.fa-cleanup-settings fieldset');
    expect(group?.classList.contains('ui-group')).toBe(true);
    expect(group?.querySelector('legend')?.classList.contains('ui-group__title')).toBe(true);
    expect(host.querySelector('.fa-cleanup-settings select')?.classList.contains('ui-select')).toBe(true);
  });
});
