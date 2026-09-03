// @vitest-environment node
//
// Attaching a subtitle FILE already on disk — the route behind a dropped or
// scanned `.srt`/`.ass`.
//
// Why it exists: until 2026-09-03 that import had no route at all.
// `renderer/fileImportExecute.ts` dispatched a `media:attach-subtitle`
// CustomEvent whose own comment said "the player owns subtitle attachment", and
// a grep of the whole tree found exactly ONE reference to that event name — the
// dispatch. Nothing listened. The import returned a receipt, navigated to the
// player, and threw the file away: a false success, which is the single thing
// the drop router was built to remove.
//
// What this guards is mostly what the route must NOT do. It must not copy a
// file the user already manages, it must not guess an owner, and it must not
// silently succeed. Each of those is a separate `it` below, because each was a
// real choice and a later edit can undo any one of them on its own.

import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MediaItem, SubtitleRecord } from '../../shared/types';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subattachfile-test-'));
/** The user's own folder — deliberately NOT under userData. */
const libraryDir = path.join(tmpRoot, 'library');
fs.mkdirSync(libraryDir, { recursive: true });

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const { attachSubtitleFile, registerSubtitleDiscoveryIpc } = await import('../subtitleDiscovery');

const CUES = '1\n00:00:01,000 --> 00:00:03,000\nこんにちは、世界。\n';
const VIDEO = path.join(libraryDir, 'jojo-01.mkv');

let items: MediaItem[] = [];
let patches: { ids: readonly string[]; patch: Partial<MediaItem> }[] = [];

const mediaItem = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: 'm1',
  title: 'JoJo no Kimyou na Bouken - 01',
  path: VIDEO,
  fileName: 'jojo-01.mkv',
  addedAt: 1,
  ...over,
} as MediaItem);

/** Writes a sidecar beside the library video and returns its absolute path. */
function sidecar(name: string, text = CUES): string {
  const file = path.join(libraryDir, name);
  fs.writeFileSync(file, text, 'utf-8');
  return file;
}

/** The record the last patch wrote, if any. */
function written(): SubtitleRecord | undefined {
  return (patches.at(-1)?.patch.subtitles as SubtitleRecord[] | undefined)?.at(-1);
}

beforeEach(() => {
  items = [mediaItem()];
  patches = [];
  registerSubtitleDiscoveryIpc({
    listItems: () => items,
    patchItems: (ids, patch) => { patches.push({ ids, patch }); },
  });
  fs.rmSync(libraryDir, { recursive: true, force: true });
  fs.mkdirSync(libraryDir, { recursive: true });
  fs.writeFileSync(VIDEO, 'not really a video', 'utf-8');
});

afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

describe('attachSubtitleFile', () => {
  it('attaches a sidecar to the item it sits beside', () => {
    const file = sidecar('jojo-01.ja.srt');
    const result = attachSubtitleFile({ path: file });
    expect(result.ok).toBe(true);
    expect(result.lang).toBe('ja');
    expect(patches).toHaveLength(1);
    expect(patches[0].ids).toEqual(['m1']);
    expect(written()).toMatchObject({ lang: 'ja', source: 'sidecar', format: 'srt', external: true });
  });

  it('references the file in place and copies nothing into userData', () => {
    // The contrast with `attachSubtitleText`, which writes into the cache
    // because it is handed bytes with nowhere to live. Two copies of one
    // subtitle drift apart, and the user manages this one.
    const file = sidecar('jojo-01.ja.srt');
    expect(attachSubtitleFile({ path: file }).ok).toBe(true);
    expect(written()?.path).toBe(file);
    expect(fs.existsSync(path.join(tmpRoot, 'subtitles'))).toBe(false);
  });

  it('takes a bare string as well as a { path } object', () => {
    const file = sidecar('jojo-01.ja.ass');
    expect(attachSubtitleFile(file).ok).toBe(true);
    expect(written()?.format).toBe('ass');
  });

  it('refuses a subtitle no library item sits beside, and patches nothing', () => {
    // The whole point of the sidecar rule. There IS an item in the library, it
    // is simply not this file's owner — so a "nearest item" fallback would have
    // attached episode 1's track to a different episode, which is the defect
    // `matchSubtitleTracks` exists to prevent everywhere else.
    const file = sidecar('some-other-show-05.ja.srt');
    const result = attachSubtitleFile({ path: file });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No library item sits beside');
    expect(patches).toHaveLength(0);
  });

  it('refuses a sidecar in a different directory with the same stem', () => {
    const elsewhere = path.join(tmpRoot, 'elsewhere');
    fs.mkdirSync(elsewhere, { recursive: true });
    const file = path.join(elsewhere, 'jojo-01.ja.srt');
    fs.writeFileSync(file, CUES, 'utf-8');
    expect(attachSubtitleFile({ path: file }).ok).toBe(false);
    expect(patches).toHaveLength(0);
  });

  it('refuses a format the player cannot read', () => {
    const file = sidecar('jojo-01.ja.zip', 'PK');
    const result = attachSubtitleFile({ path: file });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not a subtitle format');
    expect(patches).toHaveLength(0);
  });

  it('refuses a path that is not on disk', () => {
    const result = attachSubtitleFile({ path: path.join(libraryDir, 'jojo-01.ja.srt') });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('no longer on disk');
    expect(patches).toHaveLength(0);
  });

  it('refuses a file that names no language rather than filing it as one', () => {
    // A track filed under the wrong language is worse than an unattached file:
    // it becomes the Japanese track the player picks.
    const file = sidecar('jojo-01.srt');
    const result = attachSubtitleFile({ path: file });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not name a language');
    expect(patches).toHaveLength(0);
  });

  it('refuses the same file twice and patches nothing the second time', () => {
    const file = sidecar('jojo-01.ja.srt');
    expect(attachSubtitleFile({ path: file }).ok).toBe(true);
    const record = written();
    items = [mediaItem({ subtitles: record ? [record] : [] })];
    patches = [];
    const again = attachSubtitleFile({ path: file });
    expect(again.ok).toBe(false);
    expect(again.message).toContain('already attached');
    expect(patches).toHaveLength(0);
  });

  it('refuses empty and malformed input', () => {
    expect(attachSubtitleFile(undefined).ok).toBe(false);
    expect(attachSubtitleFile({}).ok).toBe(false);
    expect(attachSubtitleFile('').ok).toBe(false);
    expect(patches).toHaveLength(0);
  });
});

describe('the import call site actually uses it', () => {
  // A route with no consumer is the exact defect this slice removed, so the
  // ratchet is on the wiring, not only on the function. Comments are stripped
  // first: the block above the call names the dead event on purpose.
  const source = (...parts: string[]): string =>
    fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8')
      .replace(/\r\n?/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('the dropped-subtitle case calls the real route', () => {
    const importer = source('renderer', 'fileImportExecute.ts');
    expect(importer).toContain('window.api.attachSubtitleFile(subject.path)');
    // And refuses on failure rather than returning a receipt for nothing.
    expect(importer).toContain('if (!res?.ok) return refuse(IMPORT_REFUSE_FAILED)');
  });

  it('no dispatch of the dead media:attach-subtitle event survives', () => {
    const importer = source('renderer', 'fileImportExecute.ts');
    expect(importer).not.toContain('media:attach-subtitle');
  });

  it('is bound on the preload bridge and handled in main', () => {
    // preload alone is not proof: it reloads with the window, main does not.
    expect(source('preload.ts')).toContain("ipcRenderer.invoke('subtitleDiscovery:attachFile'");
    expect(source('main', 'subtitleDiscovery.ts'))
      .toContain("ipcMain.handle('subtitleDiscovery:attachFile'");
  });
});
