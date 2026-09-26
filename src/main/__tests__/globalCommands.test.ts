// @vitest-environment node
/**
 * The OS-wide hotkey registry. Electron is stubbed; nothing is claimed from Windows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const h = vi.hoisted(() => ({
  held: new Map<string, () => void>(),
  refuse: new Set<string>(),
  registerCalls: [] as string[],
  unregisterCalls: [] as string[],
  sent: [] as Array<{ channel: string; payload: unknown }>,
  handlers: new Map<string, (...a: unknown[]) => unknown>(),
  userData: '',
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }) } },
    ],
  },
  globalShortcut: {
    register: (acc: string, cb: () => void) => {
      h.registerCalls.push(acc);
      if (h.refuse.has(acc) || h.held.has(acc)) return false;
      h.held.set(acc, cb);
      return true;
    },
    unregister: (acc: string) => {
      h.unregisterCalls.push(acc);
      h.held.delete(acc);
    },
  },
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.handlers.set(ch, fn) },
}));

let tmp = '';
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'global-commands-test-'));
  h.userData = tmp;
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function load() {
  vi.resetModules();
  return import('../globalCommands');
}

beforeEach(() => {
  h.held.clear();
  h.refuse.clear();
  h.registerCalls.length = 0;
  h.unregisterCalls.length = 0;
  h.sent.length = 0;
  fs.rmSync(path.join(tmp, 'global-commands.json'), { force: true });
  fs.rmSync(path.join(tmp, 'global-commands.json.bak'), { force: true });
});

describe('registration', () => {
  it('claims a built-in default the moment a handler is registered, and the chord runs it', async () => {
    const reg = await load();
    const fn = vi.fn();
    reg.registerGlobalCommand('companion.lookupSelection', fn);
    expect(h.held.has('Ctrl+Alt+J')).toBe(true);
    h.held.get('Ctrl+Alt+J')!();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(reg.getGlobalCommandStatus('companion.lookupSelection')).toMatchObject({
      chord: 'Ctrl+Alt+J',
      registered: true,
      accelerator: 'Ctrl+Alt+J',
    });
  });

  it('an unbound command holds nothing but can still be run from the tray or the wheel', async () => {
    const reg = await load();
    const fn = vi.fn();
    reg.registerGlobalCommand('companion.cardPreview', fn);
    expect(h.registerCalls).toEqual([]);
    expect(reg.runGlobalCommand('companion.cardPreview')).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('accepts commands other features add, with their own default', async () => {
    const reg = await load();
    reg.registerGlobalCommand('captions.captureLast', () => undefined, { defaultKeys: 'Ctrl+Alt+Shift+C' });
    expect(h.held.has('Ctrl+Alt+Shift+C')).toBe(true);
    expect(reg.listGlobalCommands().map((s) => s.id)).toContain('captions.captureLast');
  });

  it('a handler that throws does not take the registry down', async () => {
    const reg = await load();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reg.registerGlobalCommand('app.focus', () => {
      throw new Error('boom');
    });
    expect(() => reg.runGlobalCommand('app.focus')).not.toThrow();
    spy.mockRestore();
  });
});

describe('conflicts', () => {
  it('two commands pushed onto one chord: the first holds it, the second names the holder', async () => {
    const reg = await load();
    reg.registerGlobalCommand('companion.wheel', () => undefined);
    reg.registerGlobalCommand('companion.lookupSelection', () => undefined);
    reg.applyGlobalCommandChords({ 'companion.wheel': 'Ctrl+Alt+J', 'companion.lookupSelection': 'Ctrl+Alt+J' });
    const wheel = reg.getGlobalCommandStatus('companion.wheel')!;
    const lookup = reg.getGlobalCommandStatus('companion.lookupSelection')!;
    expect(wheel.registered).toBe(true);
    expect(lookup).toMatchObject({ registered: false, error: 'duplicate', conflictWith: 'companion.wheel' });
  });

  it('reports a chord Windows refuses as in-use, per command', async () => {
    const reg = await load();
    h.refuse.add('Ctrl+Shift+Space');
    reg.registerGlobalCommand('lens.region', () => undefined);
    expect(reg.getGlobalCommandStatus('lens.region')).toMatchObject({ registered: false, error: 'in-use' });
  });

  it('refuses a modifier-less chord without asking Windows', async () => {
    const reg = await load();
    reg.registerGlobalCommand('lens.auto', () => undefined);
    reg.applyGlobalCommandChords({ 'lens.auto': 'K' });
    expect(h.registerCalls).not.toContain('K');
    expect(reg.getGlobalCommandStatus('lens.auto')!.error).toBe('needs-modifier');
  });
});

describe('re-register on change', () => {
  it('a rebind releases the old accelerator before claiming the new one', async () => {
    const reg = await load();
    reg.registerGlobalCommand('companion.lookupSelection', () => undefined);
    reg.applyGlobalCommandChords({ 'companion.lookupSelection': 'Ctrl+Alt+Y' });
    expect(h.unregisterCalls).toContain('Ctrl+Alt+J');
    expect(h.held.has('Ctrl+Alt+J')).toBe(false);
    expect(h.held.has('Ctrl+Alt+Y')).toBe(true);
  });

  it('two commands can swap chords in one push', async () => {
    const reg = await load();
    reg.registerGlobalCommand('companion.wheel', () => undefined);
    reg.registerGlobalCommand('companion.lookupSelection', () => undefined);
    reg.applyGlobalCommandChords({ 'companion.wheel': 'Ctrl+Alt+J', 'companion.lookupSelection': 'Alt+Shift+Q' });
    expect(reg.getGlobalCommandStatus('companion.wheel')).toMatchObject({ registered: true, accelerator: 'Ctrl+Alt+J' });
    expect(reg.getGlobalCommandStatus('companion.lookupSelection')).toMatchObject({ registered: true, accelerator: 'Alt+Shift+Q' });
  });

  it('switching a feature off releases its chord and switching it on claims it again', async () => {
    const reg = await load();
    reg.registerGlobalCommand('lens.region', () => undefined);
    reg.setGlobalCommandAvailable('lens.region', false);
    expect(h.held.has('Ctrl+Shift+Space')).toBe(false);
    expect(reg.runGlobalCommand('lens.region')).toBe(false);
    reg.setGlobalCommandAvailable('lens.region', true);
    expect(h.held.has('Ctrl+Shift+Space')).toBe(true);
  });

  it('an unbind releases the chord and remembers the choice across a restart', async () => {
    let reg = await load();
    reg.registerGlobalCommand('lens.region', () => undefined);
    reg.applyGlobalCommandChords({ 'lens.region': '' });
    expect(h.held.size).toBe(0);
    h.held.clear();
    reg = await load();
    reg.registerGlobalCommand('lens.region', () => undefined);
    expect(h.held.size).toBe(0);
  });

  it('a pushed chord is registered at the next boot before any window pushes again', async () => {
    let reg = await load();
    reg.applyGlobalCommandChords({ 'companion.wheel': 'Ctrl+Alt+Shift+W' });
    h.held.clear();
    reg = await load();
    reg.registerGlobalCommand('companion.wheel', () => undefined);
    expect(h.held.has('Ctrl+Alt+Shift+W')).toBe(true);
  });

  it('the disposer releases the chord', async () => {
    const reg = await load();
    const off = reg.registerGlobalCommand('companion.wheel', () => undefined);
    off();
    expect(h.held.size).toBe(0);
    expect(reg.runGlobalCommand('companion.wheel')).toBe(false);
  });

  it('unregisters everything on quit', async () => {
    const reg = await load();
    reg.registerGlobalCommand('companion.wheel', () => undefined);
    reg.registerGlobalCommand('lens.region', () => undefined);
    reg.stopGlobalCommands();
    expect(h.held.size).toBe(0);
  });

  it('tells every window what changed', async () => {
    const reg = await load();
    reg.registerGlobalCommand('companion.wheel', () => undefined);
    expect(h.sent.some((m) => m.channel === 'globalCommands:changed')).toBe(true);
  });
});

describe('legacy chords (migration)', () => {
  it('a chord from a pre-registry settings file is used until Settings pushes', async () => {
    const reg = await load();
    reg.registerGlobalCommand('lens.region', () => undefined, { legacyKeys: () => 'Ctrl+Alt+Q' });
    expect(h.held.has('Ctrl+Alt+Q')).toBe(true);
    expect(reg.legacyGlobalChords()).toEqual({ 'lens.region': 'Ctrl+Alt+Q' });
  });

  it('once Settings has pushed, the pushed chord wins over the legacy file', async () => {
    const reg = await load();
    reg.registerGlobalCommand('lens.region', () => undefined, { legacyKeys: () => 'Ctrl+Alt+Q' });
    reg.applyGlobalCommandChords({ 'lens.region': 'Ctrl+Alt+Shift+Q' });
    expect(h.held.has('Ctrl+Alt+Q')).toBe(false);
    expect(h.held.has('Ctrl+Alt+Shift+Q')).toBe(true);
  });

  it('exposes sync / list / run / legacyChords over IPC', async () => {
    const reg = await load();
    reg.registerGlobalCommandsIpc();
    for (const ch of ['globalCommands:sync', 'globalCommands:list', 'globalCommands:run', 'globalCommands:legacyChords']) {
      expect(h.handlers.has(ch), ch).toBe(true);
    }
    const fn = vi.fn();
    reg.registerGlobalCommand('app.focus', fn);
    expect(await h.handlers.get('globalCommands:run')!({}, 'app.focus')).toBe(true);
    expect(fn).toHaveBeenCalled();
  });
});
