import { describe, expect, it, vi } from 'vitest';
import {
  executeFilesDeletion,
  planFilesDeletion,
  type FilesDeletionDependencies,
  type FilesDeletionTarget,
} from '../filesApp/deletion';

function target(overrides: Partial<FilesDeletionTarget> = {}): FilesDeletionTarget {
  return {
    id: 'transcript:episode-3',
    name: 'Episode 3 transcript.json',
    kind: 'transcript',
    location: { store: 'file', path: 'C:\\fixture\\Episode 3 transcript.json' },
    sizeBytes: 4_096,
    ...overrides,
  };
}

function dependencies(): FilesDeletionDependencies & {
  trashFile: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
} {
  return {
    trashFile: vi.fn(async () => undefined),
    softDelete: vi.fn(async () => ({ undoToken: 'undo:one', undoExpiresAt: 12_345 })),
  };
}

describe('Files app deletion policy', () => {
  it('names distinct recovery semantics and includes the item name and size', () => {
    expect(planFilesDeletion(target())).toMatchObject({
      mode: 'trash',
      messageKey: 'filesApp.delete.confirmTrash',
      messageValues: { name: 'Episode 3 transcript.json', sizeBytes: 4_096 },
      requiresExplicitConfirmation: false,
    });
    expect(
      planFilesDeletion(
        target({ location: { store: 'json', file: 'notes.json', pointer: '/rows/3' } }),
      ).messageKey,
    ).toBe('filesApp.delete.confirmSoft');
    expect(
      planFilesDeletion(
        target({ location: { store: 'derived', describes: 'storage total' } }),
      ).messageKey,
    ).toBe('filesApp.delete.refuseComputed');
  });

  it('trashes one exact file-backed derived output and never calls the soft-delete owner', async () => {
    const deps = dependencies();
    const result = await executeFilesDeletion(target(), {}, deps);

    expect(result).toEqual({ ok: true, itemId: 'transcript:episode-3', mode: 'trash' });
    expect(deps.trashFile).toHaveBeenCalledOnce();
    expect(deps.trashFile).toHaveBeenCalledWith('C:\\fixture\\Episode 3 transcript.json');
    expect(deps.softDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes one exact index row and returns the owner-issued undo receipt', async () => {
    const deps = dependencies();
    const row = target({
      id: 'highlight:42',
      name: 'Highlight 42',
      location: { store: 'sqlite', database: 'library.db', table: 'highlights', rowId: '42' },
    });
    const result = await executeFilesDeletion(row, {}, deps);

    expect(result).toEqual({
      ok: true,
      itemId: 'highlight:42',
      mode: 'soft',
      undoToken: 'undo:one',
      undoExpiresAt: 12_345,
    });
    expect(deps.softDelete).toHaveBeenCalledOnce();
    expect(deps.softDelete).toHaveBeenCalledWith(row);
    expect(deps.trashFile).not.toHaveBeenCalled();
  });

  it('refuses computed state without invoking either destructive dependency', async () => {
    const deps = dependencies();
    const result = await executeFilesDeletion(
      target({ id: 'stats:total', location: { store: 'derived', describes: 'study total' } }),
      {},
      deps,
    );

    expect(result).toEqual({
      ok: false,
      itemId: 'stats:total',
      reasonKey: 'filesApp.delete.refuseComputed',
    });
    expect(deps.trashFile).not.toHaveBeenCalled();
    expect(deps.softDelete).not.toHaveBeenCalled();
  });

  it('proves the irreplaceable-media guard fires before the trash dependency', async () => {
    const deps = dependencies();
    const video = target({
      id: 'media:episode-3',
      name: 'Episode 3.mkv',
      kind: 'video',
      location: { store: 'file', path: 'C:\\fixture\\Episode 3.mkv' },
      sizeBytes: 734_003_200,
    });

    expect(await executeFilesDeletion(video, {}, deps)).toEqual({
      ok: false,
      itemId: 'media:episode-3',
      reasonKey: 'filesApp.delete.confirmationRequired',
    });
    expect(deps.trashFile).not.toHaveBeenCalled();
  });

  it('rejects confirmation for a previous selection and accepts the exact item id', async () => {
    const deps = dependencies();
    const video = target({
      id: 'media:episode-3',
      kind: 'video',
      location: { store: 'file', path: 'C:\\fixture\\Episode 3.mkv' },
    });

    expect(
      await executeFilesDeletion(video, { confirmedItemId: 'media:episode-2' }, deps),
    ).toMatchObject({ ok: false, reasonKey: 'filesApp.delete.confirmationMismatch' });
    expect(deps.trashFile).not.toHaveBeenCalled();

    expect(
      await executeFilesDeletion(video, { confirmedItemId: 'media:episode-3' }, deps),
    ).toEqual({ ok: true, itemId: 'media:episode-3', mode: 'trash' });
    expect(deps.trashFile).toHaveBeenCalledWith('C:\\fixture\\Episode 3.mkv');
  });

  it('returns a named failure instead of reporting false success', async () => {
    const deps = dependencies();
    deps.trashFile.mockRejectedValueOnce(new Error('Recycle Bin unavailable'));

    await expect(executeFilesDeletion(target(), {}, deps)).resolves.toEqual({
      ok: false,
      itemId: 'transcript:episode-3',
      reasonKey: 'filesApp.delete.failed',
      detail: 'Recycle Bin unavailable',
    });
  });
});
