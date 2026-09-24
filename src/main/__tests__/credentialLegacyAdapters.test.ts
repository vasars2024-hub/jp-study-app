// @vitest-environment node

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
let encryptionAvailable = true;

vi.mock('electron', () => ({
  app: { getPath: (): string => tempRoot },
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

const { setCredentialVaultRoot, readSecret } = await import('../credentials/vault');
const { readAiProviderSecret, writeAiProviderSecret } = await import('../credentials/ai');
const { readSubtitleProviderSecret, writeSubtitleProviderSecret } = await import(
  '../credentials/subtitles'
);

const miningRoot = (): string => path.join(tempRoot, 'mining');
const aiStore = (): string => path.join(miningRoot(), 'api-keys.json');
const geminiText = (): string => path.join(miningRoot(), 'gemini-api-key.txt');
const subtitleStore = (): string => path.join(tempRoot, 'subtitle-keys.json');
const vaultFile = (): string => path.join(tempRoot, 'credentials.dat');

beforeAll(async () => {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'credential-adapters-'));
  setCredentialVaultRoot(tempRoot);
});

afterAll(async () => {
  setCredentialVaultRoot(null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
});

beforeEach(() => {
  encryptionAvailable = true;
  fs.rmSync(vaultFile(), { force: true });
  // A .bak without its primary now counts as damage and is reinstated.
  fs.rmSync(`${vaultFile()}.bak`, { force: true });
  fs.rmSync(miningRoot(), { recursive: true, force: true });
  fs.rmSync(subtitleStore(), { force: true });
  fs.rmSync(`${subtitleStore()}.bak`, { force: true });
});

afterEach(() => {
  for (const id of ['GEMINI', 'DEEPSEEK', 'JIMAKU', 'OPENSUBTITLES']) {
    delete process.env[`JPSTUDY_KEY_${id}`];
    delete process.env[`JPSTUDY_KEY_${id}_APIKEY`];
  }
});

describe('AI-provider migration', () => {
  it('moves both legacy JSON keys into the shared encrypted vault', () => {
    fs.mkdirSync(miningRoot(), { recursive: true });
    fs.writeFileSync(
      aiStore(),
      JSON.stringify({ gemini: 'FAKE-GEMINI', deepseek: 'FAKE-DEEPSEEK', _encrypted: false }),
      'utf-8',
    );

    expect(readAiProviderSecret('gemini')).toBe('FAKE-GEMINI');
    expect(readAiProviderSecret('deepseek')).toBe('FAKE-DEEPSEEK');
    expect(readSecret('gemini')).toBe('FAKE-GEMINI');
    expect(readSecret('deepseek')).toBe('FAKE-DEEPSEEK');
    expect(fs.existsSync(aiStore())).toBe(false);
    expect(fs.readFileSync(vaultFile(), 'utf-8')).not.toContain('FAKE-GEMINI');
  });

  it('migrates the oldest Gemini text file', () => {
    fs.mkdirSync(miningRoot(), { recursive: true });
    fs.writeFileSync(geminiText(), 'FAKE-OLD-GEMINI', 'utf-8');

    expect(readAiProviderSecret('gemini')).toBe('FAKE-OLD-GEMINI');
    expect(fs.existsSync(geminiText())).toBe(false);
  });

  it('refuses a new plaintext downgrade when encryption is unavailable', () => {
    encryptionAvailable = false;
    expect(writeAiProviderSecret('gemini', 'FAKE-NEW').ok).toBe(false);
    expect(fs.existsSync(vaultFile())).toBe(false);
    expect(fs.existsSync(aiStore())).toBe(false);
  });

  it('keeps and can use an existing plaintext key until encryption returns', () => {
    encryptionAvailable = false;
    fs.mkdirSync(miningRoot(), { recursive: true });
    fs.writeFileSync(aiStore(), JSON.stringify({ gemini: 'FAKE-LEGACY' }), 'utf-8');

    expect(readAiProviderSecret('gemini')).toBe('FAKE-LEGACY');
    expect(fs.readFileSync(aiStore(), 'utf-8')).toContain('FAKE-LEGACY');
    expect(fs.existsSync(vaultFile())).toBe(false);
  });
});

describe('subtitle-provider migration', () => {
  it('moves legacy provider keys into the shared encrypted vault', () => {
    fs.writeFileSync(
      subtitleStore(),
      JSON.stringify({ jimaku: 'FAKE-JIMAKU', opensubtitles: 'FAKE-OPENSUBTITLES' }),
      'utf-8',
    );

    expect(readSubtitleProviderSecret('jimaku')).toBe('FAKE-JIMAKU');
    expect(readSubtitleProviderSecret('opensubtitles')).toBe('FAKE-OPENSUBTITLES');
    expect(fs.existsSync(subtitleStore())).toBe(false);
    expect(fs.readFileSync(vaultFile(), 'utf-8')).not.toContain('FAKE-JIMAKU');
  });

  it('round-trips new keys only through the vault', () => {
    expect(writeSubtitleProviderSecret('jimaku', 'FAKE-NEW-JIMAKU').ok).toBe(true);
    expect(readSubtitleProviderSecret('jimaku')).toBe('FAKE-NEW-JIMAKU');
    expect(fs.existsSync(subtitleStore())).toBe(false);
  });

  it('refuses a new plaintext downgrade when encryption is unavailable', () => {
    encryptionAvailable = false;
    expect(writeSubtitleProviderSecret('opensubtitles', 'FAKE-NEW-OS').ok).toBe(false);
    expect(fs.existsSync(vaultFile())).toBe(false);
    expect(fs.existsSync(subtitleStore())).toBe(false);
  });
});
