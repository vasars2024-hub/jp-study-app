import { describe, expect, it, vi } from 'vitest';
import type { FilesDeletionResult } from '../../shared/filesApp/deletion';
import {
  FilesDeletionSession,
  browserFilesSoftDeletePersistence,
  deletionNoticeForResult,
  deletionNoticeForUndo,
  deletionTargetFromItem,
  filesDeletionBridgeFromApi,
  type FilesDeletionBridge,
  type FilesDeletionCatalogueItem,
} from '../components/filesapp/filesDeletionSession';

function item(overrides: Partial<FilesDeletionCatalogueItem> = {}): FilesDeletionCatalogueItem {
  return {
    id: 'transcript:one',
    name: 'Episode 1 transcript.json',
    kind: 'transcript',
    location: { store: 'file', path: 'C:\\fixture\\episode-1.json' },
    sizeBytes: 512,
    flags: {},
    ...overrides,
  };
}

function setup() {
  const values = new Map<string, string>();
  const events: string[] = [];
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const trash = vi.fn<FilesDeletionBridge['trash']>(async ({ itemId }) => ({
    ok: true,
    itemId,
    mode: 'trash',
  }));
  const session = new FilesDeletionSession(
    { trash },
    browserFilesSoftDeletePersistence(storage, (eventName) => events.push(eventName)),
    () => 'undo:one',
    10_000,
  );
  return { session, trash, values, events };
}

describe('FilesDeletionSession', () => {
  it('sends only the authoritative item id and confirmation to main, never a path', async () => {
    const { session, trash } = setup();
    const video = item({ id: 'media:one', kind: 'video' });

    await expect(session.delete(video, { confirmedItemId: 'media:one' })).resolves.toEqual({
      ok: true,
      itemId: 'media:one',
      mode: 'trash',
    });
    expect(trash).toHaveBeenCalledWith({
      itemId: 'media:one',
      confirmedItemId: 'media:one',
    });
    expect(JSON.stringify(trash.mock.calls)).not.toContain('fixture');
  });

  it('proves the media guard refuses before the bridge can trash anything', async () => {
    const { session, trash } = setup();

    await expect(session.delete(item({ id: 'media:one', kind: 'video' }))).resolves.toEqual({
      ok: false,
      itemId: 'media:one',
      reasonKey: 'filesApp.delete.confirmationRequired',
    });
    expect(trash).not.toHaveBeenCalled();
  });

  it('soft-deletes a referenced file, filters exactly that row and restores it by token', async () => {
    const { session, trash, events } = setup();
    const referenced = item({
      id: 'media:referenced',
      kind: 'video',
      flags: { referenced: true },
    });
    const other = item({ id: 'media:other' });

    const result = await session.delete(referenced);
    // Audit r2 #2: a linked media row is removed through the media library
    // itself — deferred until the undo window passes, so Undo stays exact.
    expect(result).toMatchObject({
      ok: true,
      itemId: 'media:referenced',
      mode: 'owner',
      undoToken: 'undo:one',
    });
    expect(session.visibleItems([referenced, other]).map((row) => row.id)).toEqual(['media:other']);
    expect(trash).not.toHaveBeenCalled();

    if (!result.ok || result.mode !== 'owner') throw new Error('Expected an owner-delete receipt');
    expect(session.undo(result.undoToken, result.undoExpiresAt - 1)).toEqual({
      ok: true,
      itemId: 'media:referenced',
    });
    expect(session.visibleItems([referenced, other])).toEqual([referenced, other]);
    expect(events).toHaveLength(2);
  });

  it('maps the catalogue referenced flag onto the policy target', () => {
    expect(deletionTargetFromItem(item({ flags: { referenced: true } }))).toMatchObject({
      referenced: true,
    });
  });

  it('adapts the typed preload method and names a stale bridge failure', async () => {
    const filesDelete = vi.fn(async ({ itemId }) => ({
      ok: true as const,
      itemId,
      mode: 'trash' as const,
    }));
    await expect(
      filesDeletionBridgeFromApi({ filesDelete }).trash({ itemId: 'transcript:one' }),
    ).resolves.toMatchObject({ ok: true, itemId: 'transcript:one' });
    expect(filesDelete).toHaveBeenCalledWith({ itemId: 'transcript:one' });

    await expect(
      filesDeletionBridgeFromApi(undefined).trash({ itemId: 'transcript:one' }),
    ).resolves.toEqual({
      ok: false,
      itemId: 'transcript:one',
      reasonKey: 'filesApp.delete.failed',
      detail: 'Files delete bridge unavailable',
    });
  });

  it('maps trash, soft delete and failures onto distinct inspector notices', () => {
    expect(
      deletionNoticeForResult(
        { ok: true, itemId: 'transcript:one', mode: 'trash' },
        'Episode 1.json',
      ),
    ).toEqual({
      key: 'filesApp.delete.trashed',
      values: { name: 'Episode 1.json' },
      tone: 'ok',
    });
    expect(
      deletionNoticeForResult(
        {
          ok: true,
          itemId: 'note:one',
          mode: 'soft',
          undoToken: 'undo:note:one',
          undoExpiresAt: 12_000,
        },
        'Note one',
      ),
    ).toMatchObject({
      key: 'filesApp.delete.softDeleted',
      tone: 'ok',
      undoToken: 'undo:note:one',
      undoExpiresAt: 12_000,
    });
    expect(
      deletionNoticeForResult(
        { ok: false, itemId: 'note:one', reasonKey: 'filesApp.delete.notFound' },
        'Note one',
      ),
    ).toEqual({ key: 'filesApp.delete.notFound', tone: 'error' });
  });

  it('keeps expired and failed Undo outcomes distinct', () => {
    expect(deletionNoticeForUndo({ ok: true, itemId: 'note:one' })).toEqual({
      key: 'filesApp.delete.undoRestored',
      tone: 'ok',
    });
    expect(deletionNoticeForUndo({ ok: false, reason: 'expired' })).toEqual({
      key: 'filesApp.delete.undoExpired',
      tone: 'error',
    });
    expect(deletionNoticeForUndo({ ok: false, reason: 'storage-failed' })).toEqual({
      key: 'filesApp.delete.undoFailed',
      tone: 'error',
    });
  });

  it('refuses computed rows without touching either persistence or main', async () => {
    const { session, trash, values } = setup();
    const computed = item({
      id: 'stats:total',
      kind: 'statistic',
      location: { store: 'derived', describes: 'study total' },
    });

    await expect(session.delete(computed)).resolves.toMatchObject({
      ok: false,
      reasonKey: 'filesApp.delete.refuseComputed',
    });
    expect(trash).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it('rejects a bridge result for a different row', async () => {
    const { session, trash } = setup();
    trash.mockResolvedValueOnce({
      ok: true,
      itemId: 'transcript:other',
      mode: 'trash',
    } satisfies FilesDeletionResult);

    await expect(session.delete(item())).resolves.toMatchObject({
      ok: false,
      itemId: 'transcript:one',
      reasonKey: 'filesApp.delete.failed',
    });
  });

  it('rejects a malformed bridge success instead of hiding the selected row', async () => {
    const { session, trash } = setup();
    trash.mockResolvedValueOnce({
      ok: true,
      itemId: 'transcript:one',
      mode: 'soft',
    } as FilesDeletionResult);

    await expect(session.delete(item())).resolves.toMatchObject({
      ok: false,
      itemId: 'transcript:one',
      reasonKey: 'filesApp.delete.failed',
    });
  });

  it('turns a rejected trash bridge into the named failure state', async () => {
    const { session, trash } = setup();
    trash.mockRejectedValueOnce(new Error('Files delete bridge unavailable'));

    await expect(session.delete(item())).resolves.toEqual({
      ok: false,
      itemId: 'transcript:one',
      reasonKey: 'filesApp.delete.failed',
      detail: 'Files delete bridge unavailable',
    });
  });
});
