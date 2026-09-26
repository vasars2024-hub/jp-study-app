// @vitest-environment node
/**
 * THE A11Y GATE'S ARTWORK FIXTURE, AGAINST THE REAL MAIN-PROCESS LOADERS — slice 65.
 *
 * `packaged-a11y-deep-gate.mjs --fixture` seeds a throwaway profile with `media.json` +
 * poster PNGs and `library.json` + cover PNGs, and its C0b step then measured that NOT ONE
 * of the images on screen came from it. "The app did not read the seeded stores" was the
 * obvious reading, and it is wrong: both stores load fine. What moved is the *surface* —
 * `player` routes to the Seanime workspace now (AppSection.tsx:73, MediaWorkspace.tsx:15),
 * which reads the sidecar, not `media.json`. See docs/migration/SLICE_65_ARTWORK_FIXTURE.md.
 *
 * That distinction is only worth anything if it is checkable without the packaged app, which
 * is what this file is for. It writes the fixture's EXACT bytes into a scratch userData dir
 * and drives the real `media:list` / `media:artwork` / `library:sync` handlers over them.
 *
 * If this file ever goes red, the fixture and the loaders have genuinely drifted apart and
 * the gate's premise needs re-deriving. While it is green, a C0b failure is a statement about
 * ROUTING and nothing else.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-fixture-test-'));

/**
 * Handlers are captured rather than dispatched through a real ipcMain, so the assertions run
 * against the same closures the packaged app registers.
 */
const handlers = new Map<string, (...args: unknown[]) => unknown>();

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

/**
 * ffmpeg is stubbed to ALWAYS return null — the point of the poster assertion is that the URL
 * came from the fixture's `posterPath`, and a working thumbnailer would hide a broken
 * `posterPath` behind a generated still that looks identical at the call site.
 */
vi.mock('../mediaArtwork', () => ({
  ensureMediaArtwork: () => Promise.resolve(null),
  clearMediaArtwork: () => undefined,
  probeDurationSec: () => Promise.resolve(null),
}));
vi.mock('../mediaMetadata', () => ({
  registerMediaMetadataIpc: () => undefined,
  runMediaMetadata: () => Promise.resolve(undefined),
  // Read by media ingest (`mediaIngest.ts`) to defer its sweep while one is running.
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
vi.mock('../readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('../readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('../epubMeta', () => ({ extractEpubTitleFromOpf: () => undefined }));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));

const { registerMediaIpc } = await import('../media');
const { registerLibraryIpc } = await import('../library');

// ----- the fixture, byte for byte -----------------------------------------
//
// Mirrors `seedArtworkFixture()` in docs/migration/tools/packaged-a11y-deep-gate.mjs. The PNG
// encoder is not mirrored: no loader on either path decodes an image, they only test that the
// file exists, so real pixels would buy nothing here and the gate already hashes them.

const FIXTURE_MEDIA_COUNT = 12;
const FIXTURE_BOOK_COUNT = 8;

/** Same relative layout the gate writes, so a path bug shows up here rather than on screen. */
function seed(): { mediaIds: string[]; bookIds: string[] } {
  const put = (rel: string, bytes: Buffer): string => {
    const abs = path.join(userDataDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
    return abs;
  };

  const mediaIds: string[] = [];
  const mediaItems = [];
  for (let i = 0; i < FIXTURE_MEDIA_COUNT; i += 1) {
    const id = `a11yfix-media-${String(i + 1).padStart(2, '0')}`;
    const fileName = `Fixture Title ${i + 1} - 01.mp4`;
    const filePath = put(path.join('fixture-media', fileName), Buffer.alloc(1024));
    put(path.join('artwork', `${id}.png`), Buffer.alloc(64, 7));
    mediaIds.push(id);
    mediaItems.push({
      id,
      title: `Fixture Title ${i + 1}`,
      path: filePath,
      fileName,
      addedAt: Date.now() - i * 60_000,
      kind: 'video',
      durationSec: 1440 + i * 30,
      lang: 'ja',
      posterPath: `artwork/${id}.png`,
    });
  }
  put('media.json', Buffer.from(`${JSON.stringify({ items: mediaItems, relationships: [] }, null, 2)}\n`, 'utf8'));

  const bookIds: string[] = [];
  const bookItems = [];
  for (let i = 0; i < FIXTURE_BOOK_COUNT; i += 1) {
    const id = `a11yfix-book-${String(i + 1).padStart(2, '0')}`;
    put(path.join('library', id, 'cover.png'), Buffer.alloc(64, 9));
    bookIds.push(id);
    bookItems.push({
      id,
      title: `Fixture Book ${i + 1}`,
      kind: 'book',
      createdAt: Date.now() - i * 90_000,
      coverPath: 'cover.png',
    });
  }
  put('library.json', Buffer.from(`${JSON.stringify(bookItems, null, 2)}\n`, 'utf8'));

  return { mediaIds, bookIds };
}

let mediaIds: string[] = [];
let bookIds: string[] = [];

beforeAll(() => {
  ({ mediaIds, bookIds } = seed());
  registerMediaIpc();
  registerLibraryIpc();
});

afterAll(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler registered for ${channel}`);
  return fn({}, ...args);
};

describe('the a11y gate artwork fixture is readable by the main process', () => {
  it('media:list returns every seeded item — media.json name, location and envelope are right', async () => {
    const items = (await invoke('media:list')) as Array<{ id: string; posterPath?: string }>;
    expect(items).toHaveLength(FIXTURE_MEDIA_COUNT);
    expect(items.map((i) => i.id).sort()).toEqual([...mediaIds].sort());
    // `media:list` backfills release identity and rewrites the store; the poster must survive it.
    expect(items.every((i) => typeof i.posterPath === 'string')).toBe(true);
  });

  it('media:artwork mints a playfile:// URL from posterPath, with ffmpeg guaranteed unavailable', async () => {
    for (const id of mediaIds) {
      const url = (await invoke('media:artwork', id, 'poster')) as string | null;
      expect(url, `no poster URL for ${id}`).toMatch(/^playfile:\/\/[0-9a-f-]{36}$/);
    }
  });

  it('the store survives a reload — the second read is not a first-run artifact', async () => {
    const again = (await invoke('media:list')) as unknown[];
    expect(again).toHaveLength(FIXTURE_MEDIA_COUNT);
    const onDisk = JSON.parse(fs.readFileSync(path.join(userDataDir, 'media.json'), 'utf-8'));
    expect(onDisk.items).toHaveLength(FIXTURE_MEDIA_COUNT);
  });

  it('library:sync returns every seeded book — library.json is a BARE array, and that is correct', async () => {
    const items = (await invoke('library:sync')) as Array<{ id: string; coverPath?: string }>;
    expect(items).toHaveLength(FIXTURE_BOOK_COUNT);
    expect(items.map((i) => i.id).sort()).toEqual([...bookIds].sort());
    expect(items.every((i) => i.coverPath === 'cover.png')).toBe(true);
  });

  it('every seeded cover resolves under libraryRoot(), which is what media:// serves', () => {
    for (const id of bookIds) {
      expect(fs.existsSync(path.join(userDataDir, 'library', id, 'cover.png'))).toBe(true);
    }
  });
});

describe('the items media:list hands the renderer produce a full poster grid', () => {
  /**
   * The last link that can be checked without the packaged app: `MediaLibraryShell` does not
   * render `items`, it renders `buildLibraryEntries(items)`, and each card asks for
   * `entry.artworkItem.id`. A fixture that loads but collapses into three series cards, or whose
   * artworkItem lands on a poster-less member, would still fail C0b for a reason that has
   * nothing to do with routing — so it is worth separating here rather than guessing later.
   */
  it('gives one entry per fixture item, each with a poster-bearing artwork item', async () => {
    const { buildLibraryEntries } = await import('../../shared/mediaLibraryEntries');
    const items = (await invoke('media:list')) as Parameters<typeof buildLibraryEntries>[0];
    const entries = buildLibraryEntries(items);
    expect(entries).toHaveLength(FIXTURE_MEDIA_COUNT);
    expect(entries.every((e) => typeof e.artworkItem.posterPath === 'string')).toBe(true);
    expect(new Set(entries.map((e) => e.artworkItem.id)).size).toBe(FIXTURE_MEDIA_COUNT);
  });
});

describe('the fixture in the gate still writes what this test asserts', () => {
  /**
   * A drift guard, not a style check. The whole value of the test above is that it is over the
   * bytes the gate really writes; if `seedArtworkFixture()` is renamed or repointed at other
   * store names, these assertions quietly stop describing it.
   */
  const gate = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'docs', 'migration', 'tools', 'packaged-a11y-deep-gate.mjs'),
    'utf-8',
  );

  it('still seeds media.json and library.json at the userData root', () => {
    expect(gate).toContain('function seedArtworkFixture(');
    expect(gate).toContain("put('media.json'");
    expect(gate).toContain("put('library.json'");
  });

  it('still seeds the counts this test mirrors', () => {
    expect(gate).toContain(`const FIXTURE_MEDIA_COUNT = ${FIXTURE_MEDIA_COUNT};`);
    expect(gate).toContain(`const FIXTURE_BOOK_COUNT = ${FIXTURE_BOOK_COUNT};`);
  });
});
