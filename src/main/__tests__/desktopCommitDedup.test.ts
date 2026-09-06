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

/*
 * The dedup above suppresses byte-identical echoes and nothing else. The defect
 * it was written against was two shells owning one desktop, and that case never
 * produces an echo: each shell rescales the shared layout into its own viewport
 * and commits a genuinely different one. Measured live 2026-09-05 — 27
 * broadcasts in 6.0 s alternating between authored 1264x773 and 1904x945, epoch
 * climbing 4.6/s with nobody touching the app, each tick a synchronous rename on
 * the main loop. So the fix has to be ownership, not comparison.
 *
 * Every case here drives TWO authored viewports against ONE store, which the
 * suite above could not express at all.
 */
describe('single-owner desktops', () => {
  const MAIN = 'panel|1264x773|1';
  const SECOND = 'display|1920x1080|1';

  it('alternating authored viewports write EVERY time — the echo guard cannot see the loop', async () => {
    const store = await setup();
    const base = store.snapshot().viewports[0];
    const rename = vi.spyOn(fs, 'renameSync');
    for (let i = 0; i < 6; i += 1) {
      const wide = i % 2 === 0;
      store.commitLayout({
        desktopIndex: 0,
        layout: {
          ...structuredClone(base),
          authoredW: wide ? 1904 : 1264,
          authoredH: wide ? 945 : 773,
          windows: [{ ...base.windows[0], w: wide ? 1235 : 820 }],
        },
      });
    }
    expect(rename).toHaveBeenCalledTimes(6);
    expect(send).toHaveBeenCalledTimes(6);
    expect(store.snapshot().viewports[0].layoutEpoch).toBe(base.layoutEpoch + 6);
  });

  it('re-homes an enabled secondary the user parks on the desktop main is showing', async () => {
    const store = await setup();
    store.setMainDisplayKey(MAIN);
    expect(store.snapshot().activeDesktopIndex).toBe(0);
    const snapshot = store.setAssignment({ displayKey: SECOND, desktopIndex: 0, enabled: true });
    const row = (snapshot.assignments ?? []).find((a) => a.displayKey === SECOND);
    expect(row?.desktopIndex).toBe(1);
    expect(row?.enabled).toBe(true);
  });

  it('heals a collision that is already stored — the state measured on the live machine', async () => {
    const store = await setup();
    // Written before the guard existed: main's own row and a secondary, both on 0.
    store.setAssignment({ displayKey: MAIN, desktopIndex: 0, enabled: true });
    store.setAssignment({ displayKey: SECOND, desktopIndex: 0, enabled: true });
    store.setMainDisplayKey(MAIN);
    send.mockClear();

    const first = store.syncAssignments([
      { key: MAIN, primary: true },
      { key: SECOND, primary: false },
    ]);
    const rows = first.assignments ?? [];
    expect(rows.find((a) => a.displayKey === MAIN)?.desktopIndex).toBe(0);
    expect(rows.find((a) => a.displayKey === SECOND)?.desktopIndex).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);

    // One-shot: a second sync of the same displays finds nothing left to move.
    send.mockClear();
    const again = store.syncAssignments([
      { key: MAIN, primary: true },
      { key: SECOND, primary: false },
    ]);
    expect(again.assignments).toEqual(rows);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['a disabled secondary', { displayKey: SECOND, desktopIndex: 0, enabled: false }],
    ['the main display itself', { displayKey: MAIN, desktopIndex: 0, enabled: true }],
    ['a display that is not attached', { displayKey: 'unplugged|800x600|1', desktopIndex: 0, enabled: true }],
  ])('leaves %s on desktop 0', async (_label, patch) => {
    const store = await setup();
    store.setMainDisplayKey(MAIN);
    // Populate the present-display cache so "not attached" means something.
    store.syncAssignments([{ key: MAIN, primary: true }]);
    const snapshot = store.setAssignment(patch);
    const row = (snapshot.assignments ?? []).find((a) => a.displayKey === patch.displayKey);
    expect(row?.desktopIndex).toBe(0);
  });

  it('does nothing while the main display is unknown, rather than guessing', async () => {
    const store = await setup();
    const snapshot = store.setAssignment({ displayKey: SECOND, desktopIndex: 0, enabled: true });
    expect((snapshot.assignments ?? []).find((a) => a.displayKey === SECOND)?.desktopIndex).toBe(0);
  });
});
