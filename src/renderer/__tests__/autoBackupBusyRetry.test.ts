// @vitest-environment jsdom
/**
 * An automatic backup main refused as `busy` (a manual backup or restore held
 * the lock) is retried, rather than dropped for the rest of the session.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/backupSnapshot', () => ({
  applyRendererSnapshot: vi.fn(),
  collectRendererSnapshot: async () => ({ localStorage: {}, indexedDb: {} }),
  collectRendererSnapshotText: async () => '{"app":"jp-study-app","kind":"renderer-snapshot","localStorage":{},"indexedDb":{}}',
  isLegacyBackup: () => false,
  isRendererSnapshot: () => true,
  legacyToSnapshot: vi.fn(),
  SnapshotApplyError: class extends Error {},
}));

import { runAutoBackupIfDue } from '../storage/backupClient';

let replies: unknown[] = [];
const createAuto = vi.fn(async () => replies.shift());

beforeEach(() => {
  createAuto.mockClear();
  (window as unknown as { api: Record<string, unknown> }).api = {
    backupAutoDue: async () => true,
    backupCreateAuto: createAuto,
  };
});

describe('automatic backup', () => {
  it('tries again after a busy refusal', async () => {
    replies = [{ ok: false, skipped: 'busy' }, { ok: true, path: 'x', bytes: 1 }];
    await runAutoBackupIfDue({ retryMs: 0 });
    expect(createAuto).toHaveBeenCalledTimes(2);
  });

  it('gives up after a bounded number of busy refusals', async () => {
    replies = Array.from({ length: 10 }, () => ({ ok: false, skipped: 'busy' }));
    await runAutoBackupIfDue({ retryMs: 0, attempts: 3 });
    expect(createAuto).toHaveBeenCalledTimes(3);
  });

  it('does not retry any other outcome', async () => {
    replies = [{ ok: false, skipped: 'low-disk' }];
    await runAutoBackupIfDue({ retryMs: 0 });
    expect(createAuto).toHaveBeenCalledTimes(1);
  });
});
