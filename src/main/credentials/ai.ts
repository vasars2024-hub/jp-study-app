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
import { readJsonSync, removeJsonStore, writeJsonAtomicSync } from '../atomicJson';
import {
  AI_PROVIDER_KEY_BUCKETS,
  type AiApiKeysSet,
  type AiProviderKeyBucket,
} from '../../shared/aiProviders';

/**
 * One vault entry per provider bucket. Only `gemini` and `deepseek` ever had a
 * legacy plaintext file; the newer buckets (Anthropic, OpenAI, a local
 * OpenAI-compatible server's optional key) were born in the vault.
 */
export type AiCredentialId = AiProviderKeyBucket;

function hasLegacyStore(id: AiCredentialId): id is 'gemini' | 'deepseek' {
  return id === 'gemini' || id === 'deepseek';
}

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
  if (!hasLegacyStore(id)) return '';
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
  if (!hasLegacyStore(id)) return;
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
      removeJsonStore(legacyStorePath());
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

function safeSecretSet(bucket: AiCredentialId): boolean {
  try {
    return Boolean(readAiProviderSecret(bucket).trim());
  } catch {
    return false;
  }
}

/**
 * Which provider buckets can be used right now — booleans only, never a key.
 *
 * The OpenAI-compatible server (Ollama, LM Studio) needs no key: it is usable
 * once its URL and model are set in Settings > AI, so that is what its entry
 * reports. Every other bucket is usable when the vault holds a key.
 */
export function aiCredentialsUsable(
  options: { compatBaseUrl: string; compatModel: string },
): Required<AiApiKeysSet> {
  const out = {} as Required<AiApiKeysSet>;
  for (const bucket of AI_PROVIDER_KEY_BUCKETS) {
    out[bucket] = bucket === 'openai-compatible'
      ? Boolean(options.compatBaseUrl && options.compatModel)
      : safeSecretSet(bucket);
  }
  return out;
}
