// @vitest-environment jsdom
/**
 * V12: numbers and sizes in the UI language, and K9: the toast live region is always
 * mounted.
 *
 * A Russian UI printed "1.7 GB", "1.80" and "1.00×": `toFixed` always writes a dot and
 * the size units were English literals. And the toast host mounted with its first toast,
 * so a screen reader never announced that first message (it announces changes to a
 * region it already knows).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { formatBytes } from '../../shared/assetRegistry';
import { formatDecimal } from '../components/shell/localeFormat';
import { getUiLang, setUiLang } from '../i18n';
import ToastHost from '../components/ToastHost';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  setUiLang('en');
});

describe('numbers in the UI language (V12)', () => {
  it('writes sizes with the locale\'s decimal mark and unit words', () => {
    const size = 1.7 * 1024 ** 3;
    expect(formatBytes(size, { tag: 'en-US', units: ['B', 'KB', 'MB', 'GB', 'TB'] })).toBe('1.7 GB');
    expect(formatBytes(size, { tag: 'ru-RU', units: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] })).toBe('1,7 ГБ');
    // Never grouped: the value is always below 1024.
    expect(formatBytes(1000 * 1024, { tag: 'en-US', units: ['B', 'KB', 'MB', 'GB', 'TB'] })).toBe('1000 KB');
  });

  it('follows the UI language once the renderer registered it', async () => {
    setUiLang('ru');
    // The switch lands once the catalog chunk resolves.
    for (let i = 0; i < 100 && getUiLang() !== 'ru'; i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(formatBytes(1.7 * 1024 ** 3)).toBe('1,7 ГБ');
    expect(formatDecimal(1.8, 2, 'ru')).toBe('1,80');
    expect(formatDecimal(1.8, 2, 'en')).toBe('1.80');
  });
});

describe('the toast live region (K9)', () => {
  it('is in the document before the first toast arrives', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<ToastHost />);
    });
    const region = host.querySelector('.os-toast-host');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.querySelector('.os-toast')).toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'Saved', kind: 'ok' } }));
    });
    expect(host.querySelector('.os-toast-host')).toBe(region);
    expect(region?.textContent).toContain('Saved');
  });
});
