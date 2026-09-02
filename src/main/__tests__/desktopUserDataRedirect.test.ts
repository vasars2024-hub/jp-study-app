// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The layout store must resolve `userData` when it is FIRST USED, not when the
 * module is imported.
 *
 * `main.ts` supports `JP_USER_DATA_DIR`, a dev-only redirect that calls
 * `app.setPath('userData', …)` at line 142 so a second instance can be driven
 * without touching the real 8.6 GB profile. ES imports are evaluated before any
 * statement in the importing module, so a store constructed at module scope
 * resolves the path before the redirect exists.
 *
 * That is not a theoretical ordering note. Measured live on 2026-09-01: an
 * empty scratch userData (0 entries before launch) came up holding the real
 * profile's eight desktops, its `aurora` City wallpaper and its
 * `wgt-mrmkpxj7-tpja` mini-player widget, while `profiles.json` beside it was
 * correctly seeded — the store had READ the real profile and then written the
 * result into the scratch one. Worse, `load()` re-writes the file it read
 * whenever a schema migration is needed, so at import time that write targets
 * the profile with no restore point.
 *
 * The two cases below are the read half and the write half.
 */

const realProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-desktop-real-'));
const scratchProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-desktop-scratch-'));

/** Flipped by the test to stand in for `app.setPath('userData', …)`. */
let userDataPath = realProfile;
/** Counts every resolution, so "resolved at import" is observable, not inferred. */
let getPathCalls = 0;

vi.mock('electron', () => ({
  app: {
    getPath: () => {
      getPathCalls += 1;
      return userDataPath;
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));

/** A layout only the "real" profile could have: a name no seed produces. */
const REAL_PROFILE_LAYOUT = {
  schemaVersion: 3,
  activeDesktopIndex: 0,
  globalZTop: 4242,
  desktops: [
    {
      desktopIndex: 0,
      name: 'A NAME NO SEED PRODUCES',
      windows: [
        {
          id: 'leaked',
          section: 'dictionary',
          x: 1,
          y: 2,
          w: 3,
          h: 4,
          z: 5,
          visible: true,
          maximized: false,
          pinned: false,
        },
      ],
      icons: [],
      notes: {},
      widgets: [],
      wallpaper: { kind: 'preset', id: 'crimsonveil' },
      layoutEpoch: 9,
    },
  ],
  assignments: [],
};

beforeEach(() => {
  userDataPath = realProfile;
  getPathCalls = 0;
  fs.writeFileSync(
    path.join(realProfile, 'desktop-layout.json'),
    JSON.stringify(REAL_PROFILE_LAYOUT, null, 2),
    'utf8',
  );
  fs.rmSync(path.join(scratchProfile, 'desktop-layout.json'), { force: true });
});

afterAll(() => {
  fs.rmSync(realProfile, { recursive: true, force: true });
  fs.rmSync(scratchProfile, { recursive: true, force: true });
});

describe('desktop layout store honours a userData redirect applied after import', () => {
  it('resolves no path at module scope, then reads the redirected profile', async () => {
    vi.resetModules();
    const mod = await import('../desktop');

    // The whole point: importing the module must not have touched userData.
    expect(getPathCalls).toBe(0);

    // Stand in for main.ts's `app.setPath('userData', …)`, which runs AFTER
    // every import has been evaluated.
    userDataPath = scratchProfile;

    const snapshot = mod.desktopStore().snapshot();
    expect(getPathCalls).toBeGreaterThan(0);

    // The scratch profile had no layout file, so this must be the seed — not
    // the real profile's. Assert against the real profile's own marker so a
    // future eager store fails here with the exact symptom that was measured.
    const names = snapshot.viewports.map((d) => d.name);
    expect(names).not.toContain('A NAME NO SEED PRODUCES');
    expect(snapshot.viewports[0]?.windows ?? []).toHaveLength(0);
    expect(snapshot.globalZTop).not.toBe(4242);
  });

  it('writes only the redirected profile, leaving the real one byte-identical', async () => {
    const before = fs.readFileSync(path.join(realProfile, 'desktop-layout.json'), 'utf8');

    vi.resetModules();
    const mod = await import('../desktop');
    userDataPath = scratchProfile;
    mod.desktopStore().snapshot();

    const after = fs.readFileSync(path.join(realProfile, 'desktop-layout.json'), 'utf8');
    expect(after).toBe(before);
    expect(fs.existsSync(path.join(scratchProfile, 'desktop-layout.json'))).toBe(true);
  });

  it('still reads the real profile when no redirect is applied', async () => {
    // The discriminating control. Without it, a store that read nothing at all
    // would pass both cases above.
    vi.resetModules();
    const mod = await import('../desktop');

    const snapshot = mod.desktopStore().snapshot();
    expect(snapshot.viewports.map((d) => d.name)).toContain('A NAME NO SEED PRODUCES');
    expect(snapshot.globalZTop).toBe(4242);
  });
});
