// @vitest-environment node
//
// Jiten's API key was the app's one secret stored in readable JSON
// (`<userData>/jiten.json`, PROFESSIONAL_DICTIONARY_PLAN.md §0.1). This is the
// migration that moves it into the credentials vault, exercised through the
// real `ipcMain` handlers rather than through internals — the leak this fixes
// was at the IPC boundary as much as on disk, so the boundary is what gets
// asserted.
//
// Note what is *not* deleted: `jiten.json` also carries the user's source
// profiles and reading plan, so the migration strips the `apiKey` field and
// leaves the rest untouched. A test below pins that, because "delete the old
// file" would have destroyed a reading plan.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { JitenStore } from '../../shared/jiten';

let tempRoot = '';
let encryptionAvailable = true;

type Handler = (...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  app: { getPath: (): string => tempRoot },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler);
    },
  },
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

// jiten.ts pulls the library importer in for its EPUB path; none of it is
// reached here, and importing the real module would drag in the whole library
// subsystem.
vi.mock('../library', () => ({
  importEpubBufferToLibrary: (): unknown => ({ id: 'unused' }),
  itemDir: (): string => path.join(tempRoot, 'items'),
}));

const { registerJitenIpc } = await import('../jiten');
const { readSecret, setCredentialVaultRoot } = await import('../credentials/vault');

const FAKE_KEY = 'FAKE-JITEN-KEY-NOT-REAL-0001';

const storeFile = (): string => path.join(tempRoot, 'jiten.json');
const vaultFile = (): string => path.join(tempRoot, 'credentials.dat');

const readStoreFile = (): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(storeFile(), 'utf-8')) as Record<string, unknown>;

const call = async (channel: string, ...args: unknown[]): Promise<unknown> => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({} as unknown, ...args);
};

/** A pre-migration store: plaintext key beside real user data. */
const LEGACY_FILE = {
  config: { apiBaseUrl: 'https://api.jiten.moe/api', apiKey: FAKE_KEY },
  sourceProfiles: [{ id: 'p1', label: 'Mine', enabled: true }],
  plan: [{ id: 'jiten-7', titleJp: 'ソメシング', createdAt: 1, updatedAt: 1 }],
};

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'jiten-cred-'));
  setCredentialVaultRoot(tempRoot);
  registerJitenIpc();
});

afterAll(async () => {
  setCredentialVaultRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(() => {
  encryptionAvailable = true;
  fs.rmSync(storeFile(), { force: true });
  fs.rmSync(vaultFile(), { force: true });
});

describe('migrating the plaintext key', () => {
  it('moves an existing key into the vault and strips it from jiten.json', async () => {
    fs.writeFileSync(storeFile(), JSON.stringify(LEGACY_FILE), 'utf-8');

    await call('jiten:getStore');

    expect(readSecret('jiten', 'apiKey')).toBe(FAKE_KEY);
    expect(fs.readFileSync(storeFile(), 'utf-8')).not.toContain(FAKE_KEY);
    expect((readStoreFile().config as Record<string, unknown>).apiKey).toBeUndefined();
  });

  it('keeps the source profiles and reading plan the same file carries', async () => {
    fs.writeFileSync(storeFile(), JSON.stringify(LEGACY_FILE), 'utf-8');

    await call('jiten:getStore');

    // Verbatim: the migration removes one field and rewrites everything else
    // exactly as it found it.
    const after = readStoreFile();
    expect(after.sourceProfiles).toEqual(LEGACY_FILE.sourceProfiles);
    expect(after.plan).toEqual(LEGACY_FILE.plan);
    expect((after.config as Record<string, unknown>).apiBaseUrl).toBe('https://api.jiten.moe/api');
  });

  it('is a no-op when there is no old file', async () => {
    expect(fs.existsSync(storeFile())).toBe(false);

    const store = (await call('jiten:getStore')) as JitenStore;

    expect(store.config.apiKey).toBeUndefined();
    expect(fs.existsSync(vaultFile())).toBe(false);
    expect(readSecret('jiten', 'apiKey')).toBe('');
  });

  it('is a no-op when the old file has no key', async () => {
    fs.writeFileSync(
      storeFile(),
      JSON.stringify({ ...LEGACY_FILE, config: { apiBaseUrl: 'https://api.jiten.moe/api' } }),
      'utf-8',
    );

    await call('jiten:getStore');

    expect(fs.existsSync(vaultFile())).toBe(false);
  });

  it('runs once — a second read does not rewrite anything', async () => {
    fs.writeFileSync(storeFile(), JSON.stringify(LEGACY_FILE), 'utf-8');
    await call('jiten:getStore');
    const afterFirst = fs.readFileSync(storeFile(), 'utf-8');

    await call('jiten:getStore');

    expect(fs.readFileSync(storeFile(), 'utf-8')).toBe(afterFirst);
    expect(readSecret('jiten', 'apiKey')).toBe(FAKE_KEY);
  });
});

describe('when the OS cannot encrypt', () => {
  it('keeps the plaintext rather than destroying a key it cannot store', async () => {
    encryptionAvailable = false;
    fs.writeFileSync(storeFile(), JSON.stringify(LEGACY_FILE), 'utf-8');

    await call('jiten:getStore');

    // The vault refused, so the only copy that exists must survive. Deleting it
    // here would be silent data loss on exactly the machines least able to
    // recover from it.
    expect(fs.readFileSync(storeFile(), 'utf-8')).toContain(FAKE_KEY);
    expect(fs.existsSync(vaultFile())).toBe(false);
  });
});

describe('the IPC boundary', () => {
  it('never hands the key to the renderer', async () => {
    fs.writeFileSync(storeFile(), JSON.stringify(LEGACY_FILE), 'utf-8');

    const fromGet = (await call('jiten:getStore')) as JitenStore;
    const fromUpdate = (await call('jiten:updateConfig', {})) as JitenStore;
    const fromProfiles = (await call('jiten:setSourceProfiles', [])) as JitenStore;

    for (const store of [fromGet, fromUpdate, fromProfiles]) {
      expect(store.config.apiKey).toBeUndefined();
      expect(JSON.stringify(store)).not.toContain(FAKE_KEY);
    }
  });

  it('stores a key the renderer sends', async () => {
    await call('jiten:updateConfig', { apiBaseUrl: 'https://api.jiten.moe/api', apiKey: FAKE_KEY });
    expect(readSecret('jiten', 'apiKey')).toBe(FAKE_KEY);
    expect(fs.readFileSync(storeFile(), 'utf-8')).not.toContain(FAKE_KEY);
  });

  it('leaves the key alone when the renderer sends an empty one', async () => {
    // The Novels panel re-sends its (now always blank) draft field on every
    // save. Before the vault, that blank wiped the stored key.
    await call('jiten:updateConfig', { apiKey: FAKE_KEY });
    await call('jiten:updateConfig', { apiBaseUrl: 'https://api.jiten.moe/api', apiKey: '' });
    expect(readSecret('jiten', 'apiKey')).toBe(FAKE_KEY);
  });

  it('removes the key only on an explicit null', async () => {
    await call('jiten:updateConfig', { apiKey: FAKE_KEY });
    await call('jiten:updateConfig', { apiKey: null });
    expect(readSecret('jiten', 'apiKey')).toBe('');
  });
});
