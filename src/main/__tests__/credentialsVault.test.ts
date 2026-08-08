// @vitest-environment node
//
// The Phase 0 credentials vault.
//
// The test that matters most here is the **refusal path**: on a machine whose
// OS cannot encrypt, the vault must decline to store a secret rather than
// writing it in the clear. That is the one behaviour separating this store from
// the three legacy ones it is meant to replace, and it has no positive
// observable — "nothing was written" looks identical to "the write silently
// went somewhere else" — so every refusal assertion below also reads the file
// back and asserts the plaintext is not in it.
//
// No real credential appears in this file. Every secret is an obvious fake.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
let encryptionAvailable = true;

// A reversible stand-in for DPAPI/Keychain: the point is that the secret leaves
// the caller and comes back, and that `enc:` never appears without it.
vi.mock('electron', () => ({
  app: { getPath: (): string => tempRoot },
  ipcMain: { handle: (): void => undefined },
  safeStorage: {
    isEncryptionAvailable: (): boolean => encryptionAvailable,
    encryptString: (value: string): Buffer => Buffer.from(`enc:${value}`),
    decryptString: (buffer: Buffer): string => {
      const text = buffer.toString();
      if (!text.startsWith('enc:')) throw new Error('not ours');
      return text.slice(4);
    },
  },
}));

const {
  clearSecret,
  hasSecret,
  openSecret,
  readSecret,
  recordTestResult,
  sealSecret,
  setCredentialVaultRoot,
  vaultCanStore,
  vaultStatus,
  vaultStatuses,
  writeSecret,
  writeSecretSet,
} = await import('../credentials/vault');

const FAKE_KEY = 'FAKE-JITEN-KEY-NOT-REAL-0001';

const vaultFile = (): string => path.join(tempRoot, 'credentials.dat');
const rawVault = (): string => {
  try {
    return fs.readFileSync(vaultFile(), 'utf-8');
  } catch {
    return '';
  }
};

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cred-vault-'));
  setCredentialVaultRoot(tempRoot);
});

afterAll(async () => {
  setCredentialVaultRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(() => {
  encryptionAvailable = true;
  fs.rmSync(vaultFile(), { force: true });
});

afterEach(() => {
  delete process.env.JPSTUDY_KEY_JITEN;
  delete process.env.JPSTUDY_KEY_JITEN_APIKEY;
});

describe('the shared encryption policy', () => {
  it('seals and opens a round trip', () => {
    const sealed = sealSecret(FAKE_KEY);
    expect(sealed).not.toBeNull();
    expect(sealed).not.toContain(FAKE_KEY);
    expect(openSecret(sealed as string)).toBe(FAKE_KEY);
  });

  it('refuses to seal when the OS cannot encrypt, rather than returning plaintext', () => {
    encryptionAvailable = false;
    expect(sealSecret(FAKE_KEY)).toBeNull();
  });

  it('treats an unopenable value as absent instead of throwing', () => {
    expect(openSecret('bm90LW91cnM=')).toBe('');
    expect(openSecret('')).toBe('');
  });
});

describe('storing a secret', () => {
  it('stores and reads it back', () => {
    expect(writeSecret('jiten', 'apiKey', FAKE_KEY)).toEqual({
      ok: true,
      messageKey: 'credential.result.stored',
    });
    expect(readSecret('jiten', 'apiKey')).toBe(FAKE_KEY);
    expect(hasSecret('jiten')).toBe(true);
  });

  it('stores a related secret set in one vault update', () => {
    expect(writeSecretSet('mal', {
      accessToken: 'FAKE-MAL-ACCESS-NOT-REAL',
      refreshToken: 'FAKE-MAL-REFRESH-NOT-REAL',
    }).ok).toBe(true);
    expect(readSecret('mal', 'accessToken')).toBe('FAKE-MAL-ACCESS-NOT-REAL');
    expect(readSecret('mal', 'refreshToken')).toBe('FAKE-MAL-REFRESH-NOT-REAL');
  });

  it('refuses a whole secret set when encryption is unavailable', () => {
    encryptionAvailable = false;
    expect(writeSecretSet('mal', {
      accessToken: 'FAKE-MAL-ACCESS-NOT-REAL',
      refreshToken: 'FAKE-MAL-REFRESH-NOT-REAL',
    })).toEqual({ ok: false, messageKey: 'credential.result.noEncryption' });
    expect(rawVault()).not.toContain('FAKE-MAL-ACCESS-NOT-REAL');
    expect(rawVault()).not.toContain('FAKE-MAL-REFRESH-NOT-REAL');
  });

  it('resolves a bare credential id to its primary field', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    expect(readSecret('jiten')).toBe(FAKE_KEY);
  });

  it('never writes the plaintext to disk', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    expect(rawVault()).not.toContain(FAKE_KEY);
    expect(rawVault()).toContain('jiten.apiKey');
  });

  it('trims, and treats an empty value as a removal', () => {
    writeSecret('jiten', 'apiKey', `  ${FAKE_KEY}  `);
    expect(readSecret('jiten')).toBe(FAKE_KEY);
    expect(writeSecret('jiten', 'apiKey', '   ')).toEqual({
      ok: true,
      messageKey: 'credential.result.removed',
    });
    expect(hasSecret('jiten')).toBe(false);
  });

  it('rejects a blank id or field', () => {
    expect(writeSecret('', 'apiKey', FAKE_KEY).ok).toBe(false);
    expect(writeSecret('jiten', '', FAKE_KEY).ok).toBe(false);
  });
});

describe('the refusal path', () => {
  it('refuses the write when the OS cannot encrypt', () => {
    encryptionAvailable = false;
    expect(writeSecret('jiten', 'apiKey', FAKE_KEY)).toEqual({
      ok: false,
      messageKey: 'credential.result.noEncryption',
    });
  });

  it('leaves nothing on disk after a refusal — not even a file', () => {
    encryptionAvailable = false;
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    expect(fs.existsSync(vaultFile())).toBe(false);
    expect(hasSecret('jiten')).toBe(false);
  });

  it('does not downgrade an existing store to plaintext on a later refused write', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    encryptionAvailable = false;
    const second = writeSecret('jiten', 'apiKey', 'FAKE-SECOND-KEY-NOT-REAL');
    expect(second.ok).toBe(false);
    expect(rawVault()).not.toContain('FAKE-SECOND-KEY-NOT-REAL');
  });

  it('reports that it cannot store, so the page can say so before a key is pasted', () => {
    expect(vaultCanStore()).toBe(true);
    encryptionAvailable = false;
    expect(vaultCanStore()).toBe(false);
  });
});

describe('reading a secret that cannot be decrypted', () => {
  it('reads as absent rather than throwing — a store copied from another machine', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    fs.writeFileSync(
      vaultFile(),
      JSON.stringify({ version: 1, secrets: { 'jiten.apiKey': 'Zm9yZWln' }, meta: {} }),
      'utf-8',
    );
    expect(readSecret('jiten')).toBe('');
    expect(hasSecret('jiten')).toBe(false);
    expect(vaultStatus('jiten').configured).toBe(false);
  });

  it('survives a corrupt file', () => {
    fs.writeFileSync(vaultFile(), 'not json at all', 'utf-8');
    expect(readSecret('jiten')).toBe('');
    expect(vaultStatuses()).toEqual(
      ['gemini', 'deepseek', 'jimaku', 'opensubtitles', 'jiten', 'mal'].map((id) => ({
        id,
        configured: false,
        lastTestedAt: 0,
        lastError: '',
        fromEnv: false,
      })),
    );
  });
});

describe('the environment override', () => {
  it('wins over the stored value and is never written back', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    process.env.JPSTUDY_KEY_JITEN = 'FAKE-ENV-KEY-NOT-REAL';
    expect(readSecret('jiten')).toBe('FAKE-ENV-KEY-NOT-REAL');
    expect(rawVault()).not.toContain('FAKE-ENV-KEY-NOT-REAL');
  });

  it('accepts the explicit per-field form too', () => {
    process.env.JPSTUDY_KEY_JITEN_APIKEY = 'FAKE-ENV-FIELD-KEY';
    expect(readSecret('jiten', 'apiKey')).toBe('FAKE-ENV-FIELD-KEY');
  });

  it('marks the status so the page disables editing', () => {
    process.env.JPSTUDY_KEY_JITEN = 'FAKE-ENV-KEY-NOT-REAL';
    expect(vaultStatus('jiten')).toMatchObject({ configured: true, fromEnv: true });
  });
});

describe('clearing and bookkeeping', () => {
  it('clears one field', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    clearSecret('jiten', 'apiKey');
    expect(hasSecret('jiten')).toBe(false);
  });

  it('clears every field of a credential when no field is named', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    writeSecret('jiten', 'other', 'FAKE-OTHER');
    clearSecret('jiten');
    expect(readSecret('jiten', 'apiKey')).toBe('');
    expect(readSecret('jiten', 'other')).toBe('');
  });

  it('records a test result without ever holding a secret in meta', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    recordTestResult('jiten', false, 'HTTP 401');
    const status = vaultStatus('jiten');
    expect(status.lastTestedAt).toBeGreaterThan(0);
    expect(status.lastError).toBe('HTTP 401');
    recordTestResult('jiten', true);
    expect(vaultStatus('jiten').lastError).toBe('');
  });
});

describe('the renderer-facing shape', () => {
  it('carries no field that could hold a secret', () => {
    writeSecret('jiten', 'apiKey', FAKE_KEY);
    const status = vaultStatus('jiten');
    expect(Object.keys(status).sort()).toEqual([
      'configured',
      'fromEnv',
      'id',
      'lastError',
      'lastTestedAt',
    ]);
    expect(JSON.stringify(status)).not.toContain(FAKE_KEY);
  });

  it('lists only the credentials this vault actually owns', () => {
    // MAL joins the central vault in the OAuth migration slice.
    expect(vaultStatuses().map((entry) => entry.id)).toEqual([
      'gemini',
      'deepseek',
      'jimaku',
      'opensubtitles',
      'jiten',
      'mal',
    ]);
  });
});
