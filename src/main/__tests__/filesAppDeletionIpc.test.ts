import { describe, expect, it, vi } from 'vitest';
import type { FilesDeletionTarget } from '../../shared/filesApp/deletion';
import {
  FILES_DELETE_CHANNEL,
  createFilesDeletionMainDependencies,
  deleteFilesItemInMain,
  lookupFilesDeletionTarget,
  registerFilesDeletionIpc,
  type FilesDeletionMainDependencies,
} from '../filesApp/deletionIpc';

function target(overrides: Partial<FilesDeletionTarget> = {}): FilesDeletionTarget {
  return {
    id: 'transcript:one',
    name: 'Episode 1 transcript.json',
    kind: 'transcript',
    location: { store: 'file', path: 'C:\\owned\\episode-1.json' },
    sizeBytes: 512,
    ...overrides,
  };
}

function dependencies(row: FilesDeletionTarget | null = target()) {
  const lookupItem = vi.fn((itemId: string) => (row?.id === itemId ? row : null));
  const trashItem = vi.fn(async () => undefined);
  const onTrashed = vi.fn();
  return { lookupItem, trashItem, onTrashed } satisfies FilesDeletionMainDependencies;
}

describe('Files app main-process deletion boundary', () => {
  it('binds each lookup to the current index and invalidates only after success', async () => {
    let rows = [target({ id: 'transcript:first' })];
    const access = {
      getItems: vi.fn(() => rows),
      invalidate: vi.fn(),
      trashItem: vi.fn(async () => undefined),
    };
    const deps = createFilesDeletionMainDependencies(access);

    await expect(deleteFilesItemInMain({ itemId: 'transcript:first' }, deps)).resolves.toMatchObject({
      ok: true,
      itemId: 'transcript:first',
    });
    rows = [target({ id: 'transcript:second' })];
    await expect(deleteFilesItemInMain({ itemId: 'transcript:second' }, deps)).resolves.toMatchObject({
      ok: true,
      itemId: 'transcript:second',
    });

    expect(access.getItems).toHaveBeenCalledTimes(2);
    expect(access.trashItem).toHaveBeenNthCalledWith(1, 'C:\\owned\\episode-1.json');
    expect(access.invalidate).toHaveBeenCalledTimes(2);
  });

  it('adapts the authoritative snapshot without losing reference ownership', () => {
    const rows = [
      {
        id: 'media:referenced',
        name: 'Episode 1.mkv',
        kind: 'video',
        location: { store: 'file' as const, path: 'D:\\Anime\\Episode 1.mkv' },
        sizeBytes: 1_024,
        flags: { referenced: true, transcribed: true },
        rendererOnlyField: 'ignored',
      },
    ];

    expect(lookupFilesDeletionTarget(rows, 'media:referenced')).toEqual({
      id: 'media:referenced',
      name: 'Episode 1.mkv',
      kind: 'video',
      location: { store: 'file', path: 'D:\\Anime\\Episode 1.mkv' },
      sizeBytes: 1_024,
      referenced: true,
    });
    expect(lookupFilesDeletionTarget(rows, 'media:missing')).toBeNull();
  });

  it('resolves the path from the main index and trashes exactly that target', async () => {
    const deps = dependencies();

    await expect(deleteFilesItemInMain({ itemId: 'transcript:one' }, deps)).resolves.toEqual({
      ok: true,
      itemId: 'transcript:one',
      mode: 'trash',
    });
    expect(deps.lookupItem).toHaveBeenCalledWith('transcript:one');
    expect(deps.trashItem).toHaveBeenCalledWith('C:\\owned\\episode-1.json');
    expect(deps.onTrashed).toHaveBeenCalledWith(target());
  });

  it('ignores injected renderer path and kind fields', async () => {
    const deps = dependencies();

    await deleteFilesItemInMain(
      {
        itemId: 'transcript:one',
        path: 'C:\\not-owned\\secret.txt',
        kind: 'transcript',
      },
      deps,
    );
    expect(deps.trashItem).toHaveBeenCalledWith('C:\\owned\\episode-1.json');
    expect(deps.trashItem).not.toHaveBeenCalledWith('C:\\not-owned\\secret.txt');
  });

  it('proves missing and stale confirmations cannot reach shell.trashItem', async () => {
    const video = target({ id: 'media:one', kind: 'video' });
    const deps = dependencies(video);

    await expect(deleteFilesItemInMain({ itemId: 'media:one' }, deps)).resolves.toMatchObject({
      ok: false,
      reasonKey: 'filesApp.delete.confirmationRequired',
    });
    await expect(
      deleteFilesItemInMain(
        { itemId: 'media:one', confirmedItemId: 'media:previous-selection' },
        deps,
      ),
    ).resolves.toMatchObject({ ok: false, reasonKey: 'filesApp.delete.confirmationMismatch' });
    expect(deps.trashItem).not.toHaveBeenCalled();
    expect(deps.onTrashed).not.toHaveBeenCalled();

    await expect(
      deleteFilesItemInMain({ itemId: 'media:one', confirmedItemId: 'media:one' }, deps),
    ).resolves.toMatchObject({ ok: true, mode: 'trash' });
    expect(deps.trashItem).toHaveBeenCalledOnce();
    expect(deps.onTrashed).toHaveBeenCalledOnce();
  });

  it('refuses unknown, referenced and index-only rows without touching the filesystem', async () => {
    const unknown = dependencies(null);
    await expect(deleteFilesItemInMain({ itemId: 'missing' }, unknown)).resolves.toMatchObject({
      ok: false,
      reasonKey: 'filesApp.delete.notFound',
    });
    expect(unknown.trashItem).not.toHaveBeenCalled();

    for (const row of [
      target({ referenced: true }),
      target({ location: { store: 'json', file: 'notes.json', pointer: '/1' } }),
    ]) {
      const deps = dependencies(row);
      await expect(deleteFilesItemInMain({ itemId: row.id }, deps)).resolves.toMatchObject({
        ok: false,
        reasonKey: 'filesApp.delete.refuseNotTrashable',
      });
      expect(deps.trashItem).not.toHaveBeenCalled();
      expect(deps.onTrashed).not.toHaveBeenCalled();
    }
  });

  it('keeps the cached index when shell.trashItem fails', async () => {
    const deps = dependencies();
    deps.trashItem.mockRejectedValueOnce(new Error('Recycle Bin unavailable'));

    await expect(deleteFilesItemInMain({ itemId: 'transcript:one' }, deps)).resolves.toMatchObject({
      ok: false,
      reasonKey: 'filesApp.delete.failed',
    });
    expect(deps.onTrashed).not.toHaveBeenCalled();
  });

  it('does not report false failure after trashing when cache invalidation throws', async () => {
    const deps = dependencies();
    deps.onTrashed.mockImplementationOnce(() => {
      throw new Error('cache unavailable');
    });

    await expect(deleteFilesItemInMain({ itemId: 'transcript:one' }, deps)).resolves.toEqual({
      ok: true,
      itemId: 'transcript:one',
      mode: 'trash',
    });
    expect(deps.trashItem).toHaveBeenCalledOnce();
  });

  it('rejects malformed requests and a mismatched lookup result', async () => {
    const deps = dependencies();

    for (const request of [null, {}, { itemId: '' }, { itemId: 42 }]) {
      await expect(deleteFilesItemInMain(request, deps)).resolves.toMatchObject({
        ok: false,
        reasonKey: 'filesApp.delete.invalidRequest',
      });
    }
    deps.lookupItem.mockImplementationOnce(() => target({ id: 'transcript:other' }));
    await expect(
      deleteFilesItemInMain({ itemId: 'transcript:one' }, deps),
    ).resolves.toMatchObject({ ok: false, reasonKey: 'filesApp.delete.notFound' });
    expect(deps.trashItem).not.toHaveBeenCalled();
  });

  it('registers one handler on the narrow channel', async () => {
    let registered:
      | { channel: string; listener: (_event: unknown, request: unknown) => unknown }
      | undefined;
    const deps = dependencies();
    registerFilesDeletionIpc(
      {
        handle: (channel, listener) => {
          registered = { channel, listener };
        },
      },
      deps,
    );

    expect(registered?.channel).toBe(FILES_DELETE_CHANNEL);
    await expect(registered?.listener({}, { itemId: 'transcript:one' })).resolves.toMatchObject({
      ok: true,
      mode: 'trash',
    });
  });
});
