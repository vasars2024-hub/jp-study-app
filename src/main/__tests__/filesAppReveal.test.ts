// @vitest-environment node
/**
 * Gate 12 — "Reveal out. An item opens its real location in Explorer, for at
 * least one file-backed and one non-file-backed kind — the latter must refuse
 * honestly rather than open the wrong folder."
 *
 * The refusal for a SQLite row was already proven from the renderer side (the
 * button is absent and `revealTargetFor` returns null). What was never checked
 * is the handler itself, and checking it found a SECOND wrong folder that the
 * renderer cannot see: a `brokenLink` row IS file-backed, so `revealTargetFor`
 * hands back a path, and `shell.showItemInFolder` on a path that no longer
 * exists opens the nearest surviving ancestor — a different folder, reported
 * as `ok: true`.
 *
 * Every assertion here is on the SPY, not on a return value alone: "refuses
 * honestly" means Explorer was not asked, and a handler could return
 * `ok: false` while having already asked.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilesLocation } from '../../shared/filesApp/catalog';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-reveal-test-'));
const showItemInFolder = vi.fn<(p: string) => void>();

/** Every `ipcMain.handle` the module registers, by channel. */
const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    removeHandler: () => undefined,
  },
  dialog: {},
  shell: { showItemInFolder: (p: string) => showItemInFolder(p) },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));

const { registerFilesAppIpc } = await import('../filesApp/ipc');
registerFilesAppIpc();

const reveal = (location: unknown) =>
  handlers.get('filesapp:reveal')?.(null, location) as {
    ok: boolean;
    reasonKey?: string;
  };

const REAL = path.join(tmpRoot, 'episode 01.mkv');
fs.writeFileSync(REAL, 'x');

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
beforeEach(() => showItemInFolder.mockReset());

describe('gate 12 — reveal opens the real location, or says why it cannot', () => {
  it('the file-backed half: Explorer is asked for exactly the recorded path', () => {
    const location: FilesLocation = { store: 'file', path: REAL };
    expect(reveal(location)).toEqual({ ok: true });
    // Exactly the path, not its directory: `showItemInFolder` selects the item,
    // and handing it the folder would open the folder with nothing highlighted.
    expect(showItemInFolder).toHaveBeenCalledTimes(1);
    expect(showItemInFolder).toHaveBeenCalledWith(REAL);
  });

  it('the non-file-backed half: a SQLite row refuses and Explorer is never asked', () => {
    const location: FilesLocation = {
      store: 'sqlite',
      database: 'dict.db',
      table: 'dictionaries',
      rowId: 'jmdict',
    };
    expect(reveal(location)).toEqual({
      ok: false,
      reasonKey: 'filesApp.reveal.notFileBacked',
    });
    // The gate's own words are "rather than open the wrong folder". A refusal
    // that had already opened userData would satisfy the return value and fail
    // the gate, so the spy is the assertion that matters.
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('every other non-file store refuses the same way, none of them silently', () => {
    const others: FilesLocation[] = [
      { store: 'json', file: 'settings.json', pointer: '/a/b' },
      { store: 'localStorage', key: 'jp.notes' },
      { store: 'derived', describes: 'a computed reading' },
    ];
    for (const location of others) {
      expect(reveal(location).reasonKey, location.store).toBe('filesApp.reveal.notFileBacked');
    }
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('a record whose file is GONE refuses instead of opening a surviving ancestor', () => {
    // The defect this test was written for. The row is file-backed, so the old
    // handler revealed it and answered ok:true; Explorer then opens whichever
    // parent still exists, which is not the folder the user asked for.
    const gone = path.join(tmpRoot, 'deleted', 'episode 99.mkv');
    expect(fs.existsSync(path.dirname(gone))).toBe(false);
    expect(reveal({ store: 'file', path: gone })).toEqual({
      ok: false,
      reasonKey: 'filesApp.reveal.missing',
    });
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('and it is the FILESYSTEM that decides, not the index flag', () => {
    // The index is cached for 15 s, so a row can be flagged intact and already
    // be gone. Deleting the real file mid-session must flip the answer.
    const doomed = path.join(tmpRoot, 'temporary.mkv');
    fs.writeFileSync(doomed, 'x');
    expect(reveal({ store: 'file', path: doomed })).toEqual({ ok: true });
    fs.rmSync(doomed);
    expect(reveal({ store: 'file', path: doomed }).reasonKey).toBe('filesApp.reveal.missing');
    // One call, from before the deletion.
    expect(showItemInFolder).toHaveBeenCalledTimes(1);
  });

  it('a malformed location names its own refusal rather than throwing', () => {
    for (const bad of [null, undefined, 'C:\\anything', 42]) {
      expect(reveal(bad)).toEqual({ ok: false, reasonKey: 'filesApp.reveal.noLocation' });
    }
    // A bare string path is the interesting one: it is exactly what a caller
    // would pass to route around the location type, and it is refused.
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('an unknown store shape cannot smuggle a path through', () => {
    // Not `store: 'file'`, but carrying a `path` that exists. `revealTargetFor`
    // switches on the store, so the path is never consulted -- pinned because
    // "it has a path" is the intuitive wrong implementation.
    expect(reveal({ store: 'zzz', path: REAL }).reasonKey).toBe('filesApp.reveal.notFileBacked');
    expect(showItemInFolder).not.toHaveBeenCalled();
  });
});
