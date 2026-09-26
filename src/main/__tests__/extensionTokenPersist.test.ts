// @vitest-environment node
/**
 * Resilience audit #2: "New token" on a full disk used to change the token in
 * memory first and only log the failed write — the app showed (and served)
 * a token that a restart silently replaced with the old one, un-pairing the
 * extension the user had just re-paired.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-exttoken-'));
if (!process.resourcesPath) {
  (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = tmpRoot;
}

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getAppPath: () => tmpRoot, isPackaged: false },
  ipcMain: { handle: () => undefined, on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openPath: async () => '' },
}));

const { getExtensionBridgeStatus, regenerateExtensionToken } = await import('../extensionServer');

function storedToken(): string | undefined {
  const file = fs.readdirSync(tmpRoot).find((name) => /extension.*\.json$/i.test(name) && !name.endsWith('.bak'));
  if (!file) return undefined;
  return (JSON.parse(fs.readFileSync(path.join(tmpRoot, file), 'utf-8')) as { token?: string }).token;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('regenerating the pairing token on a full disk', () => {
  it('keeps the old token active and on disk, and says the disk is full', () => {
    const before = getExtensionBridgeStatus().token;
    expect(before.length).toBeGreaterThanOrEqual(16);
    expect(storedToken()).toBe(before);

    const realOpen = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, ...rest: unknown[]) => {
      if (String(file).startsWith(tmpRoot)) {
        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      }
      return (realOpen as (...args: unknown[]) => number)(file, ...rest);
    }) as typeof fs.openSync);

    const failed = regenerateExtensionToken();
    expect(failed.token).toBe(before);
    expect(failed.saveFailure).toBe('storage-full');
    expect(storedToken()).toBe(before);

    vi.restoreAllMocks();
    const ok = regenerateExtensionToken();
    expect(ok.token).not.toBe(before);
    expect(ok.saveFailure).toBeUndefined();
    expect(storedToken()).toBe(ok.token);
  });
});
