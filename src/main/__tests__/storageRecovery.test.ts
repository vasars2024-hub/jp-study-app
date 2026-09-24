// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: { handle: (): void => undefined },
}));
vi.mock('../errorLog', () => ({ logDiagnostic: (): void => undefined }));

import { chromiumOriginId, preserveIdbFiles, safeDbName, saveIdbRecoveryExport } from '../backup/storageRecovery';

let userData: string;
beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'idb-recovery-'));
});
afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('IndexedDB recovery exports', () => {
  it('maps dev and packaged origins to Chromium storage ids', () => {
    expect(chromiumOriginId('http://localhost:5173')).toBe('http_localhost_5173');
    expect(chromiumOriginId('app://bundle')).toBe('app_bundle_0');
    expect(chromiumOriginId('null')).toBeNull();
  });

  it('writes the export under userData/recovery with a safe name', () => {
    const file = saveIdbRecoveryExport(userData, '../../evil', '{"a":1}');
    expect(path.dirname(file)).toBe(path.join(userData, 'recovery'));
    expect(path.basename(file)).toMatch(/^_.*evil-.*\.json$/);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"a":1}');
    expect(safeDbName('jp-study-db')).toBe('jp-study-db');
  });

  it('copies only the calling origin raw files aside', () => {
    const idb = path.join(userData, 'IndexedDB');
    fs.mkdirSync(path.join(idb, 'app_bundle_0.indexeddb.leveldb'), { recursive: true });
    fs.writeFileSync(path.join(idb, 'app_bundle_0.indexeddb.leveldb', '000003.log'), 'data');
    fs.mkdirSync(path.join(idb, 'http_localhost_5173.indexeddb.leveldb'), { recursive: true });
    const dir = preserveIdbFiles(userData, 'app://bundle', 'jp-study-db');
    expect(dir).toBeTruthy();
    expect(fs.readdirSync(dir as string)).toEqual(['app_bundle_0.indexeddb.leveldb']);
    expect(fs.readFileSync(path.join(dir as string, 'app_bundle_0.indexeddb.leveldb', '000003.log'), 'utf8')).toBe('data');
    expect(preserveIdbFiles(userData, 'https://example.com', 'x')).toBeNull();
  });
});
