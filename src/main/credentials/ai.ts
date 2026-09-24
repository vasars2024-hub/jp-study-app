/**
 * AI-provider credentials backed by the app-wide vault.
 *
 * Older installs may still have `mining/api-keys.json` and the even older
 * `mining/gemini-api-key.txt`. Reads migrate one provider at a time. A legacy
 * value is removed only after the vault confirms an encrypted write, so a
 * machine without working OS encryption neither loses the only copy nor writes
 * a new plaintext downgrade.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  clearSecret,
  openSecret,
  readSecret,
  writeSecret,
  type VaultWriteResult,
} from './vault';
import { readJsonSync, writeJsonAtomicSync } from '../atomicJson';

export type AiCredentialId = 'gemini' | 'deepseek';

interface LegacyAiKeyFile {
  gemini?: string;
  deepseek?: string;
  _encrypted?: boolean;
}

function miningRoot(): string {
  return path.join(app.getPath('userData'), 'mining');
}

function legacyStorePath(): string {
  return path.join(miningRoot(), 'api-keys.json');
}

function legacyGeminiPath(): string {
  return path.join(miningRoot(), 'gemini-api-key.txt');
}

function readLegacyFile(): LegacyAiKeyFile {
  return readJsonSync<LegacyAiKeyFile>(legacyStorePath(), {}, {
    validate: (v) => v !== null && typeof v === 'object',
  });
}

function decodeLegacy(value: unknown, encrypted: boolean): string {
  if (typeof value !== 'string' || !value) return '';
  return (encrypted ? openSecret(value) : value).trim();
}

function legacyValue(id: AiCredentialId): string {
  const file = readLegacyFile();
  const fromStore = decodeLegacy(file[id], file._encrypted === true);
  if (fromStore || id !== 'gemini') return fromStore;
  try {
    return fs.readFileSync(legacyGeminiPath(), 'utf-8').trim();
  } catch {
    return '';
  }
}

function atomicWriteLegacy(file: LegacyAiKeyFile): void {
  // No `.bak`: it would keep the provider key this rewrite just removed.
  writeJsonAtomicSync(legacyStorePath(), file, { mode: 0o600, backup: false });
}

/** Removes only the migrated provider, preserving another provider not yet moved. */
function removeLegacyValue(id: AiCredentialId): void {
  if (id === 'gemini') {
    try {
      fs.rmSync(legacyGeminiPath(), { force: true });
    } catch {
      /* absent or not removable: the vault remains the authoritative value */
    }
  }

  const file = readLegacyFile();
  if (!(id in file)) return;
  delete file[id];
  if (!file.gemini && !file.deepseek) {
    try {
      fs.rmSync(legacyStorePath(), { force: true });
    } catch {
      /* absent or not removable */
    }
    return;
  }
  try {
    atomicWriteLegacy(file);
  } catch {
    /* leaving an obsolete copy is safer than damaging the remaining provider */
  }
}

export function readAiProviderSecret(id: AiCredentialId): string {
  const current = readSecret(id, 'apiKey');
  if (current) return current;

  const legacy = legacyValue(id);
  if (!legacy) return '';
  const migrated = writeSecret(id, 'apiKey', legacy);
  if (migrated.ok) removeLegacyValue(id);
  return readSecret(id, 'apiKey') || legacy;
}

export function writeAiProviderSecret(id: AiCredentialId, value: string): VaultWriteResult {
  const normalized = value.trim();
  if (!normalized) {
    clearSecret(id, 'apiKey');
    removeLegacyValue(id);
    return { ok: true, messageKey: 'credential.result.removed' };
  }

  const result = writeSecret(id, 'apiKey', normalized);
  if (result.ok) removeLegacyValue(id);
  return result;
}
