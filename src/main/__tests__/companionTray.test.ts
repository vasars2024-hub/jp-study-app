// @vitest-environment node
/**
 * The tray's Companion menu: every companion action that has a handler, in the
 * catalog's order, with the chord it is bound to right now, running the same
 * command the hotkey would. Electron is stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  menus: [] as unknown[],
  tooltip: '',
}));

vi.mock('electron', () => {
  class Tray {
    on = (): void => undefined;
    setContextMenu = (menu: unknown): void => {
      h.menus.push(menu);
    };
    setToolTip = (text: string): void => {
      h.tooltip = text;
    };
    destroy = (): void => undefined;
    popUpContextMenu = (): void => undefined;
  }
  return {
    app: { getPath: () => '', isPackaged: false, getAppPath: () => '', quit: () => undefined },
    BrowserWindow: { getAllWindows: () => [] },
    clipboard: { readText: () => '', writeText: () => undefined },
    globalShortcut: { register: () => true, unregister: () => undefined },
    ipcMain: { handle: () => undefined, on: () => undefined },
    Menu: { buildFromTemplate: (template: unknown) => ({ template }) },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }), createEmpty: () => ({}) },
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } }) },
    Tray,
  };
});
vi.mock('../atomicJson', () => ({ readJsonSync: () => ({}), writeJsonAtomicSync: () => undefined }));
vi.mock('../companionContext', () => ({
  captureSelection: async () => ({ text: '', fromSelection: false, source: null }),
  noteCompanionLookup: () => undefined,
  warmCompanionContext: () => undefined,
}));

async function load() {
  vi.resetModules();
  h.menus.length = 0;
  const reg = await import('../globalCommands');
  const sysdict = await import('../systemDictionary');
  return { reg, sysdict };
}

beforeEach(() => undefined);

describe('tray Companion menu', () => {
  it('lists the companion actions that exist, in order, each with its live chord', async () => {
    const { reg, sysdict } = await load();
    sysdict.registerSystemDictionaryIpc();
    sysdict.startSystemDictionary();
    const wheel = vi.fn();
    reg.registerGlobalCommand('companion.wheel', wheel);
    reg.registerGlobalCommand('lens.region', () => undefined);
    reg.registerGlobalCommand('captions.mineRecent', () => undefined, { defaultKeys: 'Ctrl+Alt+Shift+M' });
    reg.applyGlobalCommandChords({ 'lens.region': 'Ctrl+Alt+ArrowUp' });

    const items = sysdict.companionMenuItems();
    expect(items.map((i) => i.id)).toEqual([
      'companion:companion.wheel',
      'companion:companion.lookupSelection',
      'companion:companion.lookupClipboard',
      'companion:lens.region',
      'companion:captions.mineRecent',
    ]);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId['companion:companion.wheel']).toMatchObject({ accelerator: 'Alt+Shift+Q', registerAccelerator: false });
    // App chord spelling → Electron's, so the menu shows what the key really is.
    expect(byId['companion:lens.region']!.accelerator).toBe('Ctrl+Alt+Up');
    // Unbound rows are listed without a chord.
    expect(byId['companion:companion.lookupClipboard']!.accelerator).toBeUndefined();
    expect(byId['companion:companion.wheel']!.label).toBe('Companion wheel at the cursor');

    (byId['companion:companion.wheel']!.click as () => void)();
    expect(wheel).toHaveBeenCalledTimes(1);
  });

  it('the tray menu leads with the Companion submenu and follows rebinds', async () => {
    const { reg, sysdict } = await load();
    sysdict.registerSystemDictionaryIpc();
    sysdict.startSystemDictionary();
    reg.registerGlobalCommand('companion.wheel', () => undefined);
    reg.applyGlobalCommandChords({ 'companion.wheel': 'Ctrl+Alt+W' });
    const last = h.menus.at(-1) as { template: Array<{ label?: string; submenu?: Array<{ id: string; accelerator?: string }> }> };
    expect(last.template[0]!.label).toBe('Companion');
    const wheel = last.template[0]!.submenu!.find((i) => i.id === 'companion:companion.wheel');
    expect(wheel?.accelerator).toBe('Ctrl+Alt+W');
    expect(h.tooltip).toContain('Ctrl+Alt+J');
  });
});
