// @vitest-environment jsdom
/**
 * Opening an .mp4 when the media server cannot play it (2026-10 hardware run: the
 * file was imported, the workspace could only say "not installed", and the user was
 * given nothing to do), plus the import bug found on the way there: `media:addPaths`
 * answers with the whole library, which the importer read as "what was added".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { mediaServerReachFor, noServerNotice, probeMediaServer } from '../mediaOpenFallback';
import { executeImport, undoImports } from '../fileImportExecute';
import { en } from '../../shared/i18n/catalogs/en';

function item(id: string, patch: Partial<MediaItem> = {}): MediaItem {
  return { id, title: id, path: `D:\\media\\${id}.mp4`, fileName: `${id}.mp4`, addedAt: 1, kind: 'video', ...patch } as MediaItem;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('where an opened video can go', () => {
  it('reads a missing binary and a disabled sidecar as "no study player"', () => {
    expect(mediaServerReachFor({ kind: 'failed', errorCode: 'missing-exe' })).toBe('missing');
    expect(mediaServerReachFor({ kind: 'disabled' })).toBe('disabled');
    // Recoverable states still open the workspace, which explains them itself.
    expect(mediaServerReachFor({ kind: 'failed', errorCode: 'crashed' })).toBe('workspace');
    expect(mediaServerReachFor({ kind: 'starting' })).toBe('workspace');
    expect(mediaServerReachFor({ kind: 'ready' })).toBe('workspace');
    expect(mediaServerReachFor(null)).toBe('workspace');
  });

  it('starts a sidecar nobody started yet: a missing binary answers at once', async () => {
    const api = {
      seanimeStatus: vi.fn(async () => ({ kind: 'stopped' as const })),
      seanimeStart: vi.fn(async () => ({ kind: 'failed' as const, errorCode: 'missing-exe' as const })),
    };
    await expect(probeMediaServer(api)).resolves.toBe('missing');
    expect(api.seanimeStart).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a slow start: a server still starting has a binary', async () => {
    vi.useFakeTimers();
    const api = {
      seanimeStatus: vi.fn(async () => ({ kind: 'stopped' as const })),
      seanimeStart: vi.fn(() => new Promise<null>(() => undefined)),
    };
    const reach = probeMediaServer(api, 1500);
    await vi.advanceTimersByTimeAsync(1600);
    await expect(reach).resolves.toBe('workspace');
  });

  it('never starts a server that is already up', async () => {
    const api = { seanimeStatus: vi.fn(async () => ({ kind: 'ready' as const })), seanimeStart: vi.fn() };
    await expect(probeMediaServer(api)).resolves.toBe('workspace');
    expect(api.seanimeStart).not.toHaveBeenCalled();
  });

  it('offers the system player and says why, in words that exist', () => {
    const missing = noServerNotice('missing');
    const off = noServerNotice('disabled');
    // Missing binary: no inline player exists either, so the library is where the file is.
    expect(missing.tab).toBe('library');
    // Switched off: the simple inline player still plays it.
    expect(off.tab).toBe('video');
    for (const key of [missing.messageKey, off.messageKey, missing.actionKey, 'mediaWorkspace.openFile.systemPlayerFailed']) {
      expect(en[key as keyof typeof en]).toBeTruthy();
    }
    expect(en[missing.messageKey]).toContain('{name}');
  });
});

describe('importing one video into a library that already has titles', () => {
  function stubApi(before: MediaItem[], after: MediaItem[]) {
    const api = {
      listMedia: vi.fn(async () => before),
      addMediaPaths: vi.fn(async () => after),
      removeMedia: vi.fn(async () => undefined),
      fileDropFolderFiles: vi.fn(async () => [] as string[]),
    };
    Object.defineProperty(window, 'api', { configurable: true, writable: true, value: api });
    return api;
  }

  it('plays the file that was opened, not nothing', async () => {
    const old = item('old-show');
    const fresh = item('umi-sanpo');
    stubApi([old], [old, fresh]);
    const onPlayMedia = vi.fn();
    await executeImport({ path: 'd:/media/umi-sanpo.mp4', name: 'umi-sanpo.mp4', isDirectory: false }, 'media', { onPlayMedia });
    expect(onPlayMedia).toHaveBeenCalledWith(fresh);
  });

  it('Undo removes only what this import added, never the rest of the library', async () => {
    const old = item('old-show');
    const fresh = item('umi-sanpo');
    const api = stubApi([old], [old, fresh]);
    const receipt = await executeImport({ path: fresh.path, name: fresh.fileName, isDirectory: false }, 'media');
    expect(receipt?.mediaIds).toEqual([fresh.id]);
    await undoImports([receipt!]);
    expect(api.removeMedia).toHaveBeenCalledTimes(1);
    expect(api.removeMedia).toHaveBeenCalledWith(fresh.id);
  });

  it('re-opening a file already in the library plays it and Undo leaves it alone', async () => {
    const old = item('old-show');
    const api = stubApi([old], [old]);
    const onPlayMedia = vi.fn();
    const receipt = await executeImport({ path: old.path, name: old.fileName, isDirectory: false }, 'media', { onPlayMedia });
    expect(onPlayMedia).toHaveBeenCalledWith(old);
    await undoImports([receipt!]);
    expect(api.removeMedia).not.toHaveBeenCalled();
  });
});
