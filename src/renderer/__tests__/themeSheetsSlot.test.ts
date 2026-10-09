// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ordered theme-sheet slot (perf2): sheets land in `THEME_SHEET_ORDER`
 * whatever order they are asked for in, inside a slot that precedes any sheet
 * appended later (lazily imported component CSS), and only the active
 * material's set loads.
 */

type Sheets = typeof import('../theme/themeSheets');
type Engine = typeof import('../theme/engine');

let sheets: Sheets;
let engine: Engine;

function slotIds(): string[] {
  return Array.from(document.head.querySelectorAll('style[data-theme-sheet]')).map(
    (node) => node.getAttribute('data-theme-sheet') ?? '',
  );
}

beforeEach(async () => {
  vi.resetModules();
  document.head.innerHTML = '<link rel="stylesheet" href="/assets/main.css">';
  localStorage.clear();
  engine = await import('../theme/engine');
  engine.registerTheme({
    id: 'slot-aero', label: 'A', kind: 'aero', hidden: true, light: true, version: 1, materialSet: 'aero',
    swatch: { bg: '#fff', text: '#000', border: '#888' },
  });
  engine.registerTheme({
    id: 'slot-wired', label: 'W', kind: 'custom', hidden: true, light: false, version: 1, materialSet: 'wired',
    swatch: { bg: '#000', text: '#fff', border: '#888' },
  });
  sheets = await import('../theme/themeSheets');
});

afterEach(() => {
  document.head.innerHTML = '';
});

describe('theme sheet slot', () => {
  it('inserts sheets in cascade order regardless of request order', async () => {
    await sheets.ensureThemeSheets(['flatten']);
    await sheets.ensureThemeSheets(['wired-navi', 'aero-shell']);
    await sheets.ensureThemeSheets(['blanc', 'aero-apps', 'wired-shell']);
    const want = sheets.THEME_SHEET_ORDER.filter((id) => slotIds().includes(id));
    expect(slotIds()).toEqual(want);
    expect(slotIds()).toEqual(['aero-shell', 'wired-shell', 'aero-apps', 'wired-navi', 'blanc', 'flatten']);
  });

  it('applies a sheet once, however often it is asked for', async () => {
    await Promise.all([sheets.ensureThemeSheets(['aero-vista']), sheets.ensureThemeSheets(['aero-vista'])]);
    await sheets.ensureThemeSheets(['aero-vista']);
    expect(slotIds()).toEqual(['aero-vista']);
  });

  it('keeps the slot ahead of a component sheet appended later', async () => {
    await sheets.ensureThemeSheets(['flatten']);
    const lazyComponentSheet = document.createElement('link');
    lazyComponentSheet.rel = 'stylesheet';
    lazyComponentSheet.href = '/assets/StudyBlocks.css';
    document.head.appendChild(lazyComponentSheet);
    await sheets.ensureThemeSheets(['aero-shell']);
    const order = Array.from(document.head.children).map((n) => n.getAttribute('data-theme-sheet') ?? n.getAttribute('href'));
    expect(order).toEqual(['/assets/main.css', 'aero-shell', 'flatten', '/assets/StudyBlocks.css']);
  });

  it('boots the saved material plus the always-on tail, and follows a switch', async () => {
    localStorage.setItem('jp-os-theme', 'slot-aero');
    engine.applyTheme('slot-aero');
    await sheets.bootThemeSheets();
    expect(slotIds()).toEqual([...sheets.MATERIAL_SHEETS.aero, ...sheets.ALWAYS_SHEETS].sort(
      (a, b) => sheets.THEME_SHEET_ORDER.indexOf(a) - sheets.THEME_SHEET_ORDER.indexOf(b),
    ));
    expect(slotIds().some((id) => id.startsWith('wired-'))).toBe(false);

    engine.applyTheme('slot-wired');
    await vi.waitFor(() => expect(sheets.isThemeSheetApplied('wired-mechanics')).toBe(true));
    for (const id of sheets.MATERIAL_SHEETS.wired) expect(sheets.isThemeSheetApplied(id)).toBe(true);
    // Order still holds with both sets in.
    expect(slotIds()).toEqual(sheets.THEME_SHEET_ORDER.filter((id) => slotIds().includes(id)));
  });

  it('loads only the tail for the default theme and for Blanc', async () => {
    engine.applyTheme('slot-aero');
    await sheets.bootThemeSheets({ materials: false });
    expect(slotIds()).toEqual([...sheets.ALWAYS_SHEETS]);
    engine.applyTheme('slot-wired');
    await new Promise((r) => setTimeout(r, 10));
    expect(slotIds()).toEqual([...sheets.ALWAYS_SHEETS]);
  });

  it('prefetch fetches without applying', async () => {
    sheets.prefetchThemeSheets(sheets.MATERIAL_SHEETS.wired);
    await new Promise((r) => setTimeout(r, 10));
    expect(slotIds()).toEqual([]);
  });
});
