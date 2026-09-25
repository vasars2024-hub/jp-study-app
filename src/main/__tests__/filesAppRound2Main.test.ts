/**
 * Audit round 2 — the Files app's main-process fixes, on the real handlers.
 *
 * - #3: the watched-folder list is main's to keep, so the watch resumes at app
 *   start; arrivals are handed to the MAIN window for import; media the
 *   media-ingest watcher already covers is marked so it is not imported twice.
 * - #4: a broken library record is removable (and undoable) by cleanup.
 * - #9: the preview handler resolves the item by id and reads the file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-r2-ud-'));
const watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-r2-watch-'));

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir, getName: () => 'test' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: () => undefined,
    removeHandler: () => undefined,
  },
  dialog: {},
  shell: {},
  clipboard: {},
  BrowserWindow: { getAllWindows: () => [] },
}));

const { registerFilesAppIpc, startFilesWatchFromDisk, coveredByMediaIngest } = await import('../filesApp/ipc');
const { createCleanupSoftDelete, undoSoftDeletedMediaRow } = await import('../filesApp/cleanupIpc');

const sent: { channel: string; payload: unknown }[] = [];
const mainWindow = {
  isDestroyed: () => false,
  webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
};

registerFilesAppIpc({
  mainWindow: () => mainWindow as never,
  mediaIngestFolders: () => [path.join(watchDir, 'anime')],
  localFileUrl: (p) => `localfile://wall/${encodeURIComponent(p)}`,
});

afterAll(() => {
  // Stop the watch the tests started, so no fs.watch handle outlives the file.
  (handlers.get('filesapp:watch-set') as (e: unknown, r: unknown) => unknown)({}, []);
  // Best effort: Windows can hold a just-closed directory watch for a moment.
  for (const dir of [watchDir, userDataDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp dir; the OS reclaims it */
    }
  }
});

describe('r2 #3 — watched folders survive a restart', () => {
  it('persists the list main is given, and a fresh start resumes it from disk', () => {
    const set = handlers.get('filesapp:watch-set') as (e: unknown, r: unknown, o?: unknown) => { roots: string[] };
    expect(set({}, [watchDir], { stabilityMs: 3_000 }).roots).toEqual([watchDir]);
    const stored = JSON.parse(fs.readFileSync(path.join(userDataDir, 'files-watch.json'), 'utf8'));
    expect(stored).toMatchObject({ version: 1, roots: [watchDir], stabilityMs: 3_000 });

    // Stop, then start the way app start does: with nothing but the file.
    set({}, []);
    fs.writeFileSync(
      path.join(userDataDir, 'files-watch.json'),
      JSON.stringify({ version: 1, roots: [watchDir], stabilityMs: 3_000 }),
    );
    expect(startFilesWatchFromDisk().roots).toEqual([watchDir]);
    const status = (handlers.get('filesapp:watch-status') as () => { roots: string[] })();
    expect(status.roots).toEqual([watchDir]);
  });

  it('leaves media inside a media-ingest folder to that watcher, and nothing else', () => {
    const anime = path.join(watchDir, 'anime');
    expect(coveredByMediaIngest({ path: path.join(anime, 'Show - 01.mkv'), target: 'media' }, [anime])).toBe(true);
    expect(coveredByMediaIngest({ path: path.join(anime, 'book.epub'), target: 'library-book' }, [anime])).toBe(false);
    expect(coveredByMediaIngest({ path: path.join(watchDir, 'Show - 01.mkv'), target: 'media' }, [anime])).toBe(false);
  });
});

describe('r2 #4 — a broken library record is removable, with Undo', () => {
  it('removes exactly the row and puts it back', async () => {
    const file = path.join(userDataDir, 'library.json');
    fs.writeFileSync(file, JSON.stringify([{ id: 'b1', title: 'One' }, { id: 'b2', title: 'Two' }]));
    const remove = createCleanupSoftDelete(() => userDataDir);
    const receipt = await remove({
      itemId: 'library:b1',
      name: 'One',
      classId: 'broken-links',
      mode: 'soft',
      sizeBytes: null,
      location: { store: 'file', path: 'C:\\gone.epub' },
      source: 'library',
      requiresConfirmation: true,
    });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).map((r: { id: string }) => r.id)).toEqual(['b2']);
    expect(undoSoftDeletedMediaRow(userDataDir, receipt.undoToken)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).map((r: { id: string }) => r.id).sort()).toEqual(['b1', 'b2']);
  });
});

describe('r2 #9 — preview resolves by id and reads the file', () => {
  it('refuses a row the index does not know', async () => {
    const preview = handlers.get('filesapp:preview') as (e: unknown, id: unknown) => Promise<unknown>;
    await expect(preview({}, 'no-such-item')).resolves.toMatchObject({ kind: 'none' });
  });

  it('shows a subtitle file as its cue text and an image as a local URL', async () => {
    const { previewFilesItem } = await import('../filesApp/preview');
    const srt = path.join(watchDir, 'ep.srt');
    fs.writeFileSync(
      srt,
      ['1', '00:00:01,000 --> 00:00:02,000', 'こんにちは', '', '2', '00:00:03,000 --> 00:00:04,000', '世界', ''].join('\n'),
    );
    const png = path.join(watchDir, 'cover.png');
    fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const deps = { localFileUrl: (p: string) => `localfile://wall/${p}` };
    await expect(previewFilesItem({ kind: 'subtitle', location: { store: 'file', path: srt } }, deps)).resolves.toEqual({
      kind: 'text',
      text: 'こんにちは\n世界',
      truncated: false,
    });
    await expect(previewFilesItem({ kind: 'artwork', location: { store: 'file', path: png } }, deps)).resolves.toEqual({
      kind: 'image',
      url: `localfile://wall/${png}`,
    });
  });
});
