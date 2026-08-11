// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * v2 -> v3 migration.
 *
 * v2 stored `viewports: { 0, 1 }` — a record whose very type made two desktops
 * the only possibility. v3 makes it a list and adds per-display `assignments`.
 * A migration that drops a field here does not merely lose it on restart: the
 * store echoes the loaded layout straight back into renderer state, so the loss
 * lands mid-session.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-desktop-v3-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

const storePath = (): string => path.join(tmpRoot, 'desktop-layout.json');

function writeStore(value: unknown): void {
  fs.writeFileSync(storePath(), JSON.stringify(value, null, 2), 'utf8');
}

function readStore(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(storePath(), 'utf8')) as Record<string, unknown>;
}

/** desktop.ts loads at module scope, so each case needs a fresh module. */
async function freshStore() {
  vi.resetModules();
  const mod = await import('../desktop');
  return mod.desktopStore();
}

const V2_FIXTURE = {
  schemaVersion: 2,
  activeDesktopIndex: 1,
  globalZTop: 42,
  viewports: {
    0: {
      desktopIndex: 0,
      windows: [
        {
          id: 'w1',
          section: 'dictionary',
          x: 10,
          y: 20,
          w: 300,
          h: 400,
          z: 7,
          visible: true,
          maximized: false,
          pinned: true,
          restoreRect: { x: 1, y: 2, w: 3, h: 4 },
        },
      ],
      icons: [{ id: 'sc-1', kind: 'shortcut', name: 'Notes', target: 'C:/notes.txt', x: 24, y: 48 }],
      notes: { n1: { id: 'n1', text: 'hello', color: '#fff3a3' } },
      widgets: [{ id: 'wg1', type: 'clock', x: 5, y: 6, w: 240, h: 180, z: 3, locked: true }],
      wallpaper: { kind: 'image', path: 'C:/wall.png' },
      layoutEpoch: 9,
    },
    1: {
      desktopIndex: 1,
      windows: [],
      icons: [],
      notes: {},
      widgets: [],
      wallpaper: { kind: 'preset', id: 'crimsonveil' },
      layoutEpoch: 2,
    },
  },
};

afterEach(() => {
  try {
    fs.rmSync(storePath(), { force: true });
  } catch {
    /* ignore */
  }
});

describe('desktop store schema v3', () => {
  describe('v2 -> v3 migration', () => {
    beforeEach(() => writeStore(V2_FIXTURE));

    it('writes schemaVersion 3 to disk', async () => {
      await freshStore();
      expect(readStore().schemaVersion).toBe(3);
    });

    it('turns the `viewports` record into a `desktops` list', async () => {
      await freshStore();
      const raw = readStore();
      expect(Array.isArray(raw.desktops)).toBe(true);
      expect((raw.desktops as unknown[]).length).toBe(2);
      expect(raw.viewports).toBeUndefined();
    });

    it('round-trips every field of a v2 window', async () => {
      const store = await freshStore();
      const win = store.snapshot().viewports[0].windows[0];
      expect(win).toMatchObject({
        id: 'w1',
        section: 'dictionary',
        x: 10,
        y: 20,
        w: 300,
        h: 400,
        z: 7,
        visible: true,
        maximized: false,
        pinned: true,
        restoreRect: { x: 1, y: 2, w: 3, h: 4 },
      });
    });

    it('round-trips icons, notes, widgets and wallpaper', async () => {
      const store = await freshStore();
      const layout = store.snapshot().viewports[0];
      expect(layout.icons).toHaveLength(1);
      expect(layout.icons[0]).toMatchObject({ id: 'sc-1', kind: 'shortcut', x: 24, y: 48 });
      expect(layout.notes.n1).toMatchObject({ text: 'hello', color: '#fff3a3' });
      expect(layout.widgets[0]).toMatchObject({ id: 'wg1', type: 'clock', locked: true });
      expect(layout.wallpaper).toMatchObject({ kind: 'image', path: 'C:/wall.png' });
    });

    it('preserves activeDesktopIndex and globalZTop', async () => {
      const store = await freshStore();
      const snap = store.snapshot();
      expect(snap.activeDesktopIndex).toBe(1);
      expect(snap.globalZTop).toBe(42);
    });

    it('seeds assignments empty — `screen` is unavailable at module load', async () => {
      const store = await freshStore();
      expect(store.snapshot().assignments).toEqual([]);
    });

    it('gives every desktop a default name', async () => {
      const store = await freshStore();
      const names = store.snapshot().viewports.map((v) => v.name);
      expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
    });
  });

  describe('a v3 file loads unchanged', () => {
    it('keeps desktops and assignments across a reload', async () => {
      writeStore(V2_FIXTURE);
      const first = await freshStore();
      first.syncAssignments([{ key: 'dell|1920x1080|1', primary: true }]);

      const second = await freshStore();
      const snap = second.snapshot();
      expect(readStore().schemaVersion).toBe(3);
      expect(snap.assignments).toHaveLength(1);
      expect(snap.assignments?.[0]).toMatchObject({
        displayKey: 'dell|1920x1080|1',
        desktopIndex: 0,
        enabled: true,
      });
    });
  });

  describe('assignments', () => {
    beforeEach(() => writeStore(V2_FIXTURE));

    it('enables the primary display but not a newly attached one', async () => {
      // A monitor opening a full-screen desktop window the moment it is plugged
      // in would be a hostile default.
      const store = await freshStore();
      store.syncAssignments([
        { key: 'primary-panel|1920x1080|1', primary: true },
        { key: 'second-panel|2560x1440|1', primary: false },
      ]);
      const assignments = store.snapshot().assignments ?? [];
      expect(assignments.find((a) => a.displayKey === 'primary-panel|1920x1080|1')?.enabled).toBe(true);
      expect(assignments.find((a) => a.displayKey === 'second-panel|2560x1440|1')?.enabled).toBe(false);
    });

    it('gives each display a distinct desktop', async () => {
      const store = await freshStore();
      store.syncAssignments([
        { key: 'a|1920x1080|1', primary: true },
        { key: 'b|2560x1440|1', primary: false },
        { key: 'c|1280x1024|1', primary: false },
      ]);
      const indices = (store.snapshot().assignments ?? []).map((a) => a.desktopIndex);
      expect(new Set(indices).size).toBe(indices.length);
    });

    it('never hands a secondary the desktop the main window is showing', async () => {
      // The fixture's activeDesktopIndex is 1, i.e. the user switched the main
      // window to Desktop 2 and only then attached the monitor. Handing the new
      // display desktop 1 puts two shells on one desktop: each hydrates the
      // shared layout into its own viewport and commits the result, so the
      // narrower monitor permanently rewrites the wider one's geometry.
      const store = await freshStore();
      expect(store.snapshot().activeDesktopIndex).toBe(1);
      store.setMainDisplayKey('a|1920x1080|1');
      store.syncAssignments([
        { key: 'a|1920x1080|1', primary: true },
        { key: 'b|960x1080|1', primary: false },
      ]);
      const assignments = store.snapshot().assignments ?? [];
      const secondary = assignments.find((a) => a.displayKey === 'b|960x1080|1');
      expect(secondary?.desktopIndex).not.toBe(1);
      // and still disjoint overall
      const indices = assignments.map((a) => a.desktopIndex);
      expect(new Set(indices).size).toBe(indices.length);
    });

    it('enables a simulated display on sight — that is the point of turning it on', async () => {
      const store = await freshStore();
      store.syncAssignments([
        { key: 'a|1920x1080|1', primary: true },
        { key: 'simulated-1|960x1080|1', primary: false, virtual: true },
      ]);
      const assignments = store.snapshot().assignments ?? [];
      expect(assignments.find((a) => a.displayKey === 'simulated-1|960x1080|1')?.enabled).toBe(true);
      // A real secondary is still opt-in.
      store.syncAssignments([{ key: 'real-2|2560x1440|1', primary: false }]);
      const after = store.snapshot().assignments ?? [];
      expect(after.find((a) => a.displayKey === 'real-2|2560x1440|1')?.enabled).toBe(false);
    });

    it('does not persist a simulated display assignment across a reload', async () => {
      // Simulated displays do not exist at startup, so a stale `enabled:false`
      // from a previous run would silently suppress the second desktop.
      const store = await freshStore();
      store.syncAssignments([
        { key: 'a|1920x1080|1', primary: true },
        { key: 'simulated-1|960x1080|1', primary: false, virtual: true },
      ]);
      expect((store.snapshot().assignments ?? []).some((a) => a.displayKey.startsWith('simulated-'))).toBe(true);

      const reloaded = await freshStore();
      const keys = (reloaded.snapshot().assignments ?? []).map((a) => a.displayKey);
      expect(keys.some((k) => k.startsWith('simulated-'))).toBe(false);
      expect(keys).toContain('a|1920x1080|1');
    });

    it('keeps the assignment of a display that is no longer attached', async () => {
      const store = await freshStore();
      store.syncAssignments([
        { key: 'a|1920x1080|1', primary: true },
        { key: 'b|2560x1440|1', primary: false },
      ]);
      // Unplug b.
      store.syncAssignments([{ key: 'a|1920x1080|1', primary: true }]);
      const keys = (store.snapshot().assignments ?? []).map((a) => a.displayKey);
      expect(keys).toContain('b|2560x1440|1');
    });

    it('is idempotent — syncing twice does not duplicate', async () => {
      const store = await freshStore();
      const present = [{ key: 'a|1920x1080|1', primary: true }];
      store.syncAssignments(present);
      store.syncAssignments(present);
      expect(store.snapshot().assignments).toHaveLength(1);
    });

    it('resetAssignments clears the mapping but keeps the desktops', async () => {
      const store = await freshStore();
      store.syncAssignments([{ key: 'a|1920x1080|1', primary: true }]);
      const before = store.snapshot().viewports.length;
      store.resetAssignments();
      expect(store.snapshot().assignments).toEqual([]);
      expect(store.snapshot().viewports).toHaveLength(before);
      expect(store.snapshot().viewports[0].windows).toHaveLength(1);
    });
  });

  describe('commitLayout across more than two desktops', () => {
    beforeEach(() => writeStore(V2_FIXTURE));

    it('accepts an index beyond the seeded pair and creates the desktop', async () => {
      const store = await freshStore();
      const res = store.commitLayout({
        desktopIndex: 3,
        layout: {
          desktopIndex: 3,
          windows: [],
          icons: [],
          notes: {},
          widgets: [],
          wallpaper: { kind: 'preset', id: 'crimsonveil' },
          layoutEpoch: 1,
        },
      });
      expect(res.ok).toBe(true);
      expect(store.snapshot().viewports.length).toBeGreaterThanOrEqual(4);
    });

    it('rejects a negative or out-of-range index', async () => {
      const store = await freshStore();
      const layout = {
        desktopIndex: 0,
        windows: [],
        icons: [],
        notes: {},
        widgets: [],
        wallpaper: { kind: 'preset' as const, id: 'crimsonveil' },
        layoutEpoch: 1,
      };
      expect(store.commitLayout({ desktopIndex: -1, layout }).ok).toBe(false);
      expect(store.commitLayout({ desktopIndex: 99, layout }).ok).toBe(false);
    });

    it('does not let a commit rename a desktop', async () => {
      const store = await freshStore();
      store.renameDesktop(0, 'Work');
      store.commitLayout({
        desktopIndex: 0,
        layout: {
          desktopIndex: 0,
          name: 'Hijacked',
          windows: [],
          icons: [],
          notes: {},
          widgets: [],
          wallpaper: { kind: 'preset', id: 'crimsonveil' },
          layoutEpoch: 1,
        },
      });
      expect(store.snapshot().viewports[0].name).toBe('Work');
    });
  });

  describe('switchDesktop ownership guard (B2)', () => {
    beforeEach(() => writeStore(V2_FIXTURE));

    it('refuses to move the main window onto a desktop a secondary owns', async () => {
      // Two shells on one desktop is the ping-pong this whole design avoids:
      // each would treat the other's commit as an external edit and re-commit.
      const store = await freshStore();
      store.setMainDisplayKey('main-panel');
      store.setAssignment({ displayKey: 'second-panel', desktopIndex: 1, enabled: true });
      const res = store.switchDesktop(1);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('desktop-on-another-display');
    });

    it('allows the switch once that display is disabled', async () => {
      const store = await freshStore();
      store.setMainDisplayKey('main-panel');
      store.setAssignment({ displayKey: 'second-panel', desktopIndex: 1, enabled: true });
      store.setAssignment({ displayKey: 'second-panel', desktopIndex: 1, enabled: false });
      expect(store.switchDesktop(1).ok).toBe(true);
    });

    it('rejects a non-integer index', async () => {
      const store = await freshStore();
      expect(store.switchDesktop(1.5).ok).toBe(false);
    });
  });

  describe('corrupt input', () => {
    it('reseeds rather than throwing on unparseable JSON', async () => {
      fs.writeFileSync(storePath(), '{not json', 'utf8');
      const store = await freshStore();
      expect(store.snapshot().viewports.length).toBeGreaterThanOrEqual(2);
      expect(readStore().schemaVersion).toBe(3);
    });

    it('survives a file with neither viewports nor desktops', async () => {
      writeStore({ schemaVersion: 2, globalZTop: 3 });
      const store = await freshStore();
      expect(store.snapshot().viewports).toHaveLength(2);
    });

    it('drops assignments that are missing a displayKey', async () => {
      writeStore({
        ...V2_FIXTURE,
        schemaVersion: 3,
        desktops: Object.values(V2_FIXTURE.viewports),
        viewports: undefined,
        assignments: [{ desktopIndex: 0, enabled: true }, { displayKey: 'ok', desktopIndex: 0 }],
      });
      const store = await freshStore();
      expect(store.snapshot().assignments).toHaveLength(1);
      expect(store.snapshot().assignments?.[0].displayKey).toBe('ok');
    });
  });
});
