// @vitest-environment jsdom
/**
 * Liquid Workplace L9 bullet 1 — "finish taskbar/context/command entry points
 * without forcing Liquid".
 *
 * Two of the three shipped. The title bar has the button (`DesktopShell.tsx`
 * and `App.tsx`), the taskbar context menu has the item — and both hide the
 * affordance on a section that cannot present Liquid. The COMMAND entry point
 * did not exist at all, which is the one a keyboard user reaches without
 * pointing at a particular window.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppCommand } from '../keyboardShortcuts';
import { canPresentLiquid } from '../liquidWindowPresentation';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';

const shell = readFileSync(
  resolve(__dirname, '..', 'components', 'DesktopShell.tsx'),
  'utf8',
);

/** `keyboardShortcuts` → `playerBus`, which touches `window.api` at module-eval time. */
let cmd: AppCommand | undefined;
beforeAll(async () => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
  const ks = await import('../keyboardShortcuts');
  cmd = ks.COMMAND_CATALOG.find((c) => c.id === 'window.togglePresentation');
});

describe('the command entry point exists and is opt-in', () => {

  it('is a real Window command', () => {
    expect(cmd, 'the palette lists it because the catalog carries it').toBeTruthy();
    expect(cmd?.category).toBe('Window');
  });

  it('binds no default chord — Liquid stays explicit', () => {
    // The plan's non-negotiable: conventional windows are the DEFAULT and
    // Liquid is entered deliberately. A stray key must not present a window.
    expect(cmd?.defaultKeys).toBe('');
  });

  it('routes through the one os:window event the other window commands use', () => {
    const src = readFileSync(resolve(__dirname, '..', 'keyboardShortcuts.ts'), 'utf8');
    const block = src.slice(
      src.indexOf("case 'window.maximize':"),
      src.indexOf("new CustomEvent('os:window'"),
    );
    expect(block, 'no bespoke event for this one').toContain("case 'window.togglePresentation':");
  });

  it('is named in all four languages, and not by copying English forward', () => {
    const key = 'commands.window.togglePresentation';
    for (const [name, cat] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
      expect((cat as Record<string, string>)[key], `${name}`).toBeTruthy();
    }
    expect((ja as Record<string, string>)[key]).not.toBe((en as Record<string, string>)[key]);
  });
});

describe('a command list cannot hide per-window, so it must refuse out loud', () => {
  it('the handler checks canPresentLiquid before toggling', () => {
    const block = shell.slice(
      shell.indexOf("case 'togglePresentation': {"),
      shell.indexOf("case 'togglePresentation': {") + 900,
    );
    expect(block).toContain('canPresentLiquid(topWin.section)');
    expect(block, 'and says so rather than silently doing nothing').toContain(
      "showOsToast(t('desktop.presentation.unavailable')",
    );
  });

  it('the refusal names a section that really is refused', () => {
    // The refusal must not be decorative. `visualizer` is the ONE section left
    // that the predicate rejects: a 380x200 canvas and a bar, owning no region
    // §2.3 assigns to the Liquid role, so a flip there would change a class name
    // and no material. `city` was in this list until 2026-09-02 (L12 b2) and is
    // not any more — the Mooncap garden discloses a real HUD, and the assertion
    // below is the same claim from the other side, so this pair cannot rot into
    // agreeing with itself.
    expect(canPresentLiquid('visualizer')).toBe(false);
    expect(canPresentLiquid('city')).toBe(true);
    expect(canPresentLiquid('dictionary')).toBe(true);
    expect(canPresentLiquid('music')).toBe(true);
  });

  it('the refusal text is translated everywhere', () => {
    const key = 'desktop.presentation.unavailable';
    for (const [name, cat] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
      expect((cat as Record<string, string>)[key], `${name}`).toBeTruthy();
    }
    expect((ru as Record<string, string>)[key]).not.toBe((en as Record<string, string>)[key]);
  });
});
