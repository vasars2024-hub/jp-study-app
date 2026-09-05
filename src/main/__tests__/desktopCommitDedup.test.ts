// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DesktopLayout } from '../../shared/desktop';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-desktop-dedup-'));
const send = vi.fn();
vi.mock('electron', () => ({
  app: { getPath: () => root },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
  ipcMain: { handle: () => undefined },
}));

const file = path.join(root, 'desktop-layout.json');
beforeEach(() => { vi.resetModules(); send.mockClear(); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(file, { force: true }); });
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

async function setup() {
  const { desktopStore } = await import('../desktop');
  const store = desktopStore();
  const layout = store.snapshot().viewports[0];
  layout.windows = [{ id: 'translate', section: 'translate', x: 20, y: 30, w: 600, h: 500, z: 11 }];
  expect(store.commitLayout({ desktopIndex: 0, layout })).toEqual({ ok: true });
  send.mockClear();
  return store;
}

describe('desktop layout echo suppression', () => {
  it('acknowledges repeated snapshots without disk writes, broadcasts or epoch changes', async () => {
    const store = await setup();
    const snapshot = store.snapshot();
    const bytes = fs.readFileSync(file);
    const write = vi.spyOn(fs, 'writeFileSync');
    const rename = vi.spyOn(fs, 'renameSync');
    for (let i = 0; i < 40; i++) {
      expect(store.commitLayout({ desktopIndex: 0, layout: snapshot.viewports[0] })).toEqual({ ok: true });
    }
    expect(write).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual(snapshot);
    expect(fs.readFileSync(file)).toEqual(bytes);
  });

  it('does not let stale or forged client epochs create a write or rename the desktop', async () => {
    const store = await setup();
    store.renameDesktop(0, 'My desk');
    const before = store.snapshot();
    const write = vi.spyOn(fs, 'writeFileSync');
    send.mockClear();
    for (const layoutEpoch of [0, -1, 999999]) {
      store.commitLayout({ desktopIndex: 0, layout: { ...before.viewports[0], name: 'Old name', layoutEpoch } });
    }
    expect(write).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual(before);
  });

  it.each(['geometry', 'liquid', 'note', 'widget', 'wallpaper', 'authored-size'])(
    'persists and broadcasts a real %s edit and its reverse', async (kind) => {
      const store = await setup();
      const original = store.snapshot().viewports[0];
      const edited: DesktopLayout = structuredClone(original);
      if (kind === 'geometry') edited.windows[0].x += 10;
      if (kind === 'liquid') edited.windows[0].presentation = {
        v: 1, mode: 'liquid', standardRect: { x: 20, y: 30, w: 600, h: 500 }, standardMaximized: false,
      };
      if (kind === 'note') edited.notes = { n: { id: 'n', text: 'Study text', color: '#fff3a3' } };
      if (kind === 'widget') edited.widgets = [{ id: 'clock', type: 'clock', x: 5, y: 6, w: 240, h: 180, z: 3 }];
      if (kind === 'wallpaper') edited.wallpaper = { kind: 'image', path: 'C:/study-wallpaper.png' };
      if (kind === 'authored-size') edited.authoredW = 1440;
      const rename = vi.spyOn(fs, 'renameSync');
      for (const [offset, layout] of [edited, original].entries()) {
        expect(store.commitLayout({ desktopIndex: 0, layout })).toEqual({ ok: true });
        const current = store.snapshot().viewports[0];
        expect(current.layoutEpoch).toBe(original.layoutEpoch + offset + 1);
        expect(JSON.parse(fs.readFileSync(file, 'utf8')).desktops[0]).toEqual(current);
      }
      expect(rename).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledTimes(2);
      expect(store.snapshot().viewports[0]).toEqual({ ...original, layoutEpoch: original.layoutEpoch + 2 });
    },
  );
});
