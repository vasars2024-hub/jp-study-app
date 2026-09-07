/**
 * `media:pruneMissing` is a bulk, irreversible delete and it asked nothing.
 *
 * The handler (`main/media.ts:475`) keeps only the items whose `path` passes
 * `fs.existsSync`, writes the database back, and then `rmSync`s their covers and
 * every cached transcode the surviving paths no longer hash to. Notes, watch
 * position and the language profile go with the row. Two hosts reached it — the
 * Media Hub dashboard's "Remove missing entries" button and
 * `MediaLibraryActions.pruneMissing` — and neither asked, while `clearAll` three
 * lines below the latter did. That is the per-host drift D137 was, so the guard
 * lives in one shared module and both hosts call it.
 *
 * The fourth case is the ratchet and is not decoration: without it every
 * assertion here would pass just as well with the confirm deleted, which is
 * exactly how the Blanc remove guard was lost the first time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const confirmDialog = vi.fn<(opts: Record<string, unknown>) => Promise<boolean>>();
vi.mock('../components/ui/dialogService', () => ({ confirmDialog: (o: Record<string, unknown>) => confirmDialog(o) }));

const pruneMedia = vi.fn(async () => ({ removed: 3, items: [] }));

// Keys are echoed back with their vars so a case can assert which message the
// helper chose without pinning English wording.
const t = (key: string, vars?: Record<string, string | number>): string =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

beforeEach(() => {
  confirmDialog.mockReset();
  pruneMedia.mockClear();
  (globalThis as unknown as { window: unknown }).window = { api: { pruneMedia } };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('confirmAndPruneMissingMedia', () => {
  it('does NOT prune when the user declines — the guard itself', async () => {
    confirmDialog.mockResolvedValue(false);
    const { confirmAndPruneMissingMedia } = await import('../components/media/pruneMissingMedia');

    const result = await confirmAndPruneMissingMedia(t, 12);

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(pruneMedia).not.toHaveBeenCalled();
    // `null`, not `{removed: 0}` — a refusal must be distinguishable from a run
    // that found nothing, or the host reports "library is up to date" on Cancel.
    expect(result).toBeNull();
  });

  it('prunes once the user accepts, and returns the handler result', async () => {
    confirmDialog.mockResolvedValue(true);
    const { confirmAndPruneMissingMedia } = await import('../components/media/pruneMissingMedia');

    const result = await confirmAndPruneMissingMedia(t, 12);

    expect(pruneMedia).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ removed: 3, items: [] });
  });

  it('names the count when the host has probed the paths, and marks the dialog danger', async () => {
    confirmDialog.mockResolvedValue(false);
    const { confirmAndPruneMissingMedia } = await import('../components/media/pruneMissingMedia');

    await confirmAndPruneMissingMedia(t, 12);

    const opts = confirmDialog.mock.calls[0][0];
    expect(opts.message).toBe('mediaLib.prune.confirm.message:{"count":12}');
    expect(opts.danger).toBe(true);
  });

  it('falls back to the countless message rather than inventing a number', async () => {
    confirmDialog.mockResolvedValue(false);
    const { confirmAndPruneMissingMedia } = await import('../components/media/pruneMissingMedia');

    await confirmAndPruneMissingMedia(t);

    // Not `{count: 0}`: MediaLibraryActions has not probed each path, and a
    // confirm reading "Remove 0 entries?" is worse than one that omits the count.
    expect(confirmDialog.mock.calls[0][0].message).toBe('mediaLib.prune.confirm.messageUnknown');
  });
});
