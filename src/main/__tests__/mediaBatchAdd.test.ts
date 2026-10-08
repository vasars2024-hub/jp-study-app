// @vitest-environment node
/**
 * Adding music is one read and one write of media.json, not one per file.
 *
 * `media:addPaths` (and the folder / dialog imports) called `addOrGetItem` per
 * file, which read the whole store, searched it and rewrote it (temp + fsync +
 * last-good copy + rename): O(n²), 44 s for 2,001 tracks. The metadata sweep
 * likewise wrote the store twice per title. Both are batched now.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-batch-ud-'));
const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-batch-src-'));

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const h = vi.hoisted(() => ({
  metadataHost: null as null | {
    listItems: () => Array<{ id: string; title: string }>;
    patchItems: (ids: readonly string[], patch: Record<string, unknown>) => void;
    patchEachItem: (entries: ReadonlyArray<readonly [string, Record<string, unknown>]>) => void;
  },
}));

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir, getName: () => 'test' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: () => undefined,
  },
  dialog: {},
  shell: {},
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  net: { fetch: () => undefined },
}));
vi.mock('../mediaArtwork', () => ({
  ensureMediaArtwork: () => Promise.resolve(null),
  clearMediaArtwork: () => undefined,
  probeDurationSec: () => Promise.resolve(null),
}));
vi.mock('../mediaMetadata', () => ({
  registerMediaMetadataIpc: (host: typeof h.metadataHost) => {
    h.metadataHost = host;
  },
  runMediaMetadata: () => Promise.resolve(undefined),
  mediaMetadataRunning: () => false,
}));
vi.mock('../mediaDiscovery', () => ({ registerMediaDiscoveryIpc: () => undefined }));
vi.mock('../transcriptionJobs', () => ({ registerTranscriptionIpc: () => undefined }));
vi.mock('../subtitleDiscovery', () => ({
  clearSubtitleCache: () => undefined,
  loadDiscoverySettings: () => ({}),
  pickPlaybackSubtitle: () => null,
  readSubtitleRecord: () => null,
  readableSubtitleRecords: (records?: unknown[]) => records ?? [],
  registerSubtitleDiscoveryIpc: () => undefined,
  runSubtitleDiscovery: () => Promise.resolve(null),
}));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));

const { registerMediaIpc, flushMediaPatches } = await import('../media');

const TRACKS = 2_001;
let files: string[] = [];

function storeWrites(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(([, to]) => String(to).endsWith('media.json')).length;
}

beforeAll(() => {
  files = Array.from({ length: TRACKS }, (_, i) => path.join(sourceDir, `Artist - Track ${String(i).padStart(4, '0')}.mp3`));
  for (const file of files) fs.writeFileSync(file, 'x');
  registerMediaIpc();
});

afterAll(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(sourceDir, { recursive: true, force: true });
});

describe('adding media in bulk', () => {
  it('adds 2,001 tracks with one write of the store, fast', async () => {
    const rename = vi.spyOn(fs, 'renameSync');
    const t0 = performance.now();
    const items = (await handlers.get('media:addPaths')?.({}, files)) as Array<{ path: string; id: string }>;
    const ms = performance.now() - t0;
    expect(storeWrites(rename)).toBe(1);
    rename.mockRestore();
    expect(items).toHaveLength(TRACKS);
    expect(new Set(items.map((i) => i.path))).toEqual(new Set(files));
    // Newest first, as before: the last file of the drop is at the top.
    expect(items[0].path).toBe(files[TRACKS - 1]);
    expect(ms).toBeLessThan(5_000);
  });

  it('adding the same drop again finds every track and adds none', async () => {
    const items = (await handlers.get('media:addPaths')?.({}, files)) as unknown[];
    expect(items).toHaveLength(TRACKS);
  });

  // A torrent client, the OS watcher and a drop spell the same file differently
  // (separators; case on Windows/macOS). That used to make a second library item.
  it.skipIf(process.platform === 'linux')('finds an item by a differently spelled path instead of duplicating it', async () => {
    const original = files[3];
    const respelled = original.replace(/\\/g, '/').toUpperCase();
    const before = (await handlers.get('media:addPaths')?.({}, [original])) as Array<{ id: string; path: string }>;
    const after = (await handlers.get('media:addPaths')?.({}, [respelled])) as Array<{ id: string; path: string }>;
    expect(after).toHaveLength(before.length);
    expect(after.filter((item) => item.path.toLowerCase().replace(/\\/g, '/') === respelled.toLowerCase())).toEqual([
      expect.objectContaining({ path: original }),
    ]);
  });
});

describe('metadata sweep writes', () => {
  it('collect into one store write, and are visible to reads before it', () => {
    const host = h.metadataHost;
    expect(host).not.toBeNull();
    const ids = host!.listItems().slice(0, 300).map((item) => item.id);
    const rename = vi.spyOn(fs, 'renameSync');
    for (const id of ids) {
      host!.patchItems([id], { malId: 42 });
      host!.patchEachItem([[id, { episodeTitle: `t-${id}` }]]);
    }
    expect(storeWrites(rename)).toBe(0);
    const seen = host!.listItems().find((item) => item.id === ids[7]) as unknown as { malId?: number; episodeTitle?: string };
    expect(seen.malId).toBe(42);
    expect(seen.episodeTitle).toBe(`t-${ids[7]}`);

    flushMediaPatches();
    expect(storeWrites(rename)).toBe(1);
    rename.mockRestore();
    const stored = JSON.parse(fs.readFileSync(path.join(userDataDir, 'media.json'), 'utf8'));
    const items = (stored.items ?? stored) as Array<{ id: string; malId?: number }>;
    expect(items.filter((item) => item.malId === 42)).toHaveLength(300);
  });
});
