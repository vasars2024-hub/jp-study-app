// @vitest-environment node
//
// MAL's OAuth session now shares the central credential vault. These tests keep
// legacy compatibility explicit without ever using a real token.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
let canEncrypt = true;

vi.mock('electron', () => ({
  app: { getPath: (): string => tempRoot, getName: (): string => 'jp-study-app' },
  ipcMain: { handle: (): void => undefined },
  net: { request: (): void => undefined },
  shell: { openExternal: async (): Promise<void> => undefined },
  safeStorage: {
    isEncryptionAvailable: (): boolean => canEncrypt,
    encryptString: (value: string): Buffer => Buffer.from(`enc:${value}`),
    decryptString: (buffer: Buffer): string => {
      const value = buffer.toString();
      if (!value.startsWith('enc:')) throw new Error('not ours');
      return value.slice(4);
    },
  },
}));

const { readSecret, setCredentialVaultRoot } = await import('../credentials/vault');
const { fileMalTokenStore, MalSyncError } = await import('../malSync');

const ACCESS = 'FAKE-MAL-ACCESS-NOT-REAL';
const REFRESH = 'FAKE-MAL-REFRESH-NOT-REAL';
const tokenPath = (): string => path.join(tempRoot, 'mal-tokens.json');
const vaultPath = (): string => path.join(tempRoot, 'credentials.dat');
const store = () => fileMalTokenStore(tokenPath);

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mal-vault-'));
  setCredentialVaultRoot(tempRoot);
});

afterAll(async () => {
  setCredentialVaultRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(() => {
  canEncrypt = true;
  fs.rmSync(tokenPath(), { force: true });
  fs.rmSync(vaultPath(), { force: true });
});

describe('MAL central-vault storage', () => {
  it('stores only expiry and username in the MAL metadata file', () => {
    store().write({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: 1234, username: 'reader' });

    const raw = fs.readFileSync(tokenPath(), 'utf-8');
    expect(raw).not.toContain(ACCESS);
    expect(raw).not.toContain(REFRESH);
    expect(JSON.parse(raw)).toEqual({ version: 2, expiresAt: 1234, username: 'reader' });
    expect(readSecret('mal', 'accessToken')).toBe(ACCESS);
    expect(readSecret('mal', 'refreshToken')).toBe(REFRESH);
    expect(store().read()).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 1234,
      username: 'reader',
    });
  });

  it('migrates the former encrypted token file and preserves its metadata', () => {
    const seal = (value: string): string => Buffer.from(`enc:${value}`).toString('base64');
    fs.writeFileSync(tokenPath(), JSON.stringify({
      encrypted: true,
      accessToken: seal(ACCESS),
      refreshToken: seal(REFRESH),
      expiresAt: 5678,
      username: 'legacy-reader',
    }));

    expect(store().read()).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 5678,
      username: 'legacy-reader',
    });
    expect(readSecret('mal', 'accessToken')).toBe(ACCESS);
    const migrated = fs.readFileSync(tokenPath(), 'utf-8');
    expect(migrated).not.toContain('accessToken');
    expect(migrated).not.toContain('refreshToken');
  });

  it('migrates a former plaintext token file without writing plaintext again', () => {
    fs.writeFileSync(tokenPath(), JSON.stringify({
      encrypted: false,
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 9012,
    }));

    expect(store().read()?.accessToken).toBe(ACCESS);
    expect(fs.readFileSync(tokenPath(), 'utf-8')).not.toContain(ACCESS);
    expect(fs.readFileSync(vaultPath(), 'utf-8')).not.toContain(ACCESS);
  });

  it('refuses a new session rather than downgrading it to plaintext', () => {
    canEncrypt = false;
    expect(() => store().write({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 1234,
    })).toThrow(MalSyncError);
    expect(fs.existsSync(tokenPath())).toBe(false);
    expect(fs.existsSync(vaultPath())).toBe(false);
  });

  it('keeps an existing plaintext session readable when migration cannot encrypt', () => {
    fs.writeFileSync(tokenPath(), JSON.stringify({
      encrypted: false,
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 3456,
      username: 'offline-keychain',
    }));
    canEncrypt = false;

    expect(store().read()).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 3456,
      username: 'offline-keychain',
    });
    expect(fs.readFileSync(tokenPath(), 'utf-8')).toContain(ACCESS);
    expect(fs.existsSync(vaultPath())).toBe(false);
  });

  it('clears both vault secrets and profile metadata on sign-out', () => {
    const current = store();
    current.write({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: 1234 });
    current.clear();
    expect(readSecret('mal', 'accessToken')).toBe('');
    expect(readSecret('mal', 'refreshToken')).toBe('');
    expect(fs.existsSync(tokenPath())).toBe(false);
  });
});
