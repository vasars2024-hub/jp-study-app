// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Round-2 journey J2: dropping a parent folder of shows ("Anime/" holding one folder
 * per show) was classified as media — the planner's scan recurses — and then refused
 * as an empty folder, because `filedrop:listFolderFiles` only listed the files directly
 * inside the dropped folder. The import now walks the same way the scan does.
 */

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => handlers.set(channel, fn),
    on: () => undefined,
  },
}));

const { registerFileRouterIpc, planForPath } = await import('../fileRouter');
const { listImportableFiles, isSkippedFolder, FOLDER_IMPORT_MAX_DEPTH } = await import('../fileRouterPlanning');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-filerouter-recursive-'));

function touch(...parts: string[]): string {
  const file = path.join(root, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  return file;
}

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('dropping a parent folder of shows', () => {
  const a1 = touch('Anime', 'Show A', 'Show A - 01.mkv');
  const a2 = touch('Anime', 'Show A', 'Show A - 02.mkv');
  const b1 = touch('Anime', 'Show B', 'Season 1', 'Show B S01E01.mp4');
  touch('Anime', 'Show B', 'Season 1', 'Show B S01E01.ass');
  touch('Anime', '.hidden', 'secret.mkv');
  touch('Anime', '$RECYCLE.BIN', 'deleted.mkv');
  touch('Anime', 'System Volume Information', 'tracking.mkv');
  const deep = touch('Anime', 'a', 'b', 'c', 'd', 'e', 'too-deep.mkv');

  it('is planned as media and the import lists every episode in the show folders', async () => {
    const plan = planForPath(path.join(root, 'Anime'));
    expect(plan.candidates[0]?.target).toBe('media');

    registerFileRouterIpc();
    const list = handlers.get('filedrop:listFolderFiles');
    expect(list).toBeTypeOf('function');
    const files = (await list!({}, path.join(root, 'Anime'))) as string[];
    expect(files).toEqual(expect.arrayContaining([a1, a2, b1]));
  });

  it('skips hidden and system folders, subtitles, and anything past the depth bound', () => {
    const files = listImportableFiles(path.join(root, 'Anime'));
    expect(files).toHaveLength(3);
    expect(files.some((f) => f.includes('.hidden') || f.includes('$RECYCLE') || f.includes('System Volume'))).toBe(false);
    expect(files).not.toContain(deep);
    expect(files.some((f) => f.endsWith('.ass'))).toBe(false);
    expect(FOLDER_IMPORT_MAX_DEPTH).toBeGreaterThanOrEqual(2);
  });

  it('the triage count matches what the import brings in', () => {
    const plan = planForPath(path.join(root, 'Anime'));
    expect(plan.folderSummary?.media).toBe(3);
  });

  it('knows the system folder names', () => {
    for (const name of ['.git', '$RECYCLE.BIN', 'System Volume Information', '__MACOSX', '@eaDir', 'node_modules']) {
      expect(isSkippedFolder(name)).toBe(true);
    }
    expect(isSkippedFolder('Season 1')).toBe(false);
  });

  it('a flat folder still imports as before', () => {
    const flat = touch('Flat', 'ep1.mkv');
    expect(listImportableFiles(path.join(root, 'Flat'))).toEqual([flat]);
  });
});
