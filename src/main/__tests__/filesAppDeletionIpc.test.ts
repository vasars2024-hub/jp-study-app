import { describe, expect, it, vi } from 'vitest';
import type { FilesDeletionTarget } from '../../shared/filesApp/deletion';
import {
  FILES_DELETE_CHANNEL,
  deleteFilesItemInMain,
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
  return { lookupItem, trashItem } satisfies FilesDeletionMainDependencies;
}

describe('Files app main-process deletion boundary', () => {
  it('resolves the path from the main index and trashes exactly that target', async () => {
    const deps = dependencies();

    await expect(deleteFilesItemInMain({ itemId: 'transcript:one' }, deps)).resolves.toEqual({
      ok: true,
      itemId: 'transcript:one',
      mode: 'trash',
    });
    expect(deps.lookupItem).toHaveBeenCalledWith('transcript:one');
    expect(deps.trashItem).toHaveBeenCalledWith('C:\\owned\\episode-1.json');
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

    await expect(
      deleteFilesItemInMain({ itemId: 'media:one', confirmedItemId: 'media:one' }, deps),
    ).resolves.toMatchObject({ ok: true, mode: 'trash' });
    expect(deps.trashItem).toHaveBeenCalledOnce();
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
    }
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
