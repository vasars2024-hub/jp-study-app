/**
 * The app-wide credential vault — one encrypted store for every API key.
 *
 * This generalizes `main/scraper/credentials.ts`, which was this vault in
 * miniature for one feature. The policy is that module's, unchanged and now
 * shared rather than copied:
 *
 *   **When the OS cannot encrypt, the write is refused — never downgraded to
 *   plaintext.** A feature that does not work on a machine with a broken
 *   keychain is a smaller harm than an API key sitting in readable JSON that
 *   the user was never told about. `sealSecret` below is the single
 *   implementation of that rule, and `scraper/credentials.ts` calls it too, so
 *   the two cannot drift.
 *
 * Three further rules, each load-bearing:
 *
 *   - **A secret never crosses to the renderer.** `readSecret` is main-only;
 *     the IPC surface (`./ipc.ts`) exposes `CredentialStatus`, which has
 *     nowhere to put a key. This is the discipline
 *     `subtitleProviderClients.ts` already follows.
 *   - **An undecryptable secret reads as absent, not as an error.** A store
 *     copied from another machine, or one whose OS credential was rotated,
 *     produces a "not configured" state the user can act on instead of an
 *     exception on every call.
 *   - **An environment variable wins over the file** and is never written back,
 *     matching `malSync.ts:313`'s `JP_STUDY_MAL_CLIENT_ID` handling. That keeps
 *     CI and throwaway machines out of the vault entirely.
 *
 * The file is `<userData>/credentials.dat`. The extension is deliberately not
 * `.json`: the contents are base64 ciphertext, and a `.json` credential file is
 * an invitation to open it in an editor and "fix" it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import {
  CREDENTIAL_REGISTRY,
  credentialEnvVar,
  credentialSpec,
  type CredentialSpec,
  type CredentialStatus,
} from '../../shared/credentialRegistry';

const VAULT_FILE = 'credentials.dat';

interface VaultFile {
  version: number;
  /** `<credentialId>.<fieldName>` → base64 of the safeStorage ciphertext. */
  secrets: Record<string, string>;
  /** Per-credential test bookkeeping. Never holds a secret. */
  meta: Record<string, { lastTestedAt: number; lastError: string }>;
}

const EMPTY: VaultFile = { version: 1, secrets: {}, meta: {} };

export interface VaultWriteResult {
  ok: boolean;
  /**
   * i18n key describing the outcome, resolved by the renderer with `t()`.
   * A key rather than a sentence because this value is rendered as UI text and
   * the whole app is on the live translation system (CLAUDE.md, i18n rule 1).
   */
  messageKey: string;
}

let overrideRoot: string | null = null;

/** Test seam — points the vault at a temp directory, mirroring `setScraperStoreRoot`. */
export function setCredentialVaultRoot(root: string | null): void {
  overrideRoot = root;
}

function vaultRoot(): string {
  if (overrideRoot) return overrideRoot;
  return app.getPath('userData');
}

function vaultPath(): string {
  return path.join(vaultRoot(), VAULT_FILE);
}

// ---------------------------------------------------------------------------
// The shared policy — also used by main/scraper/credentials.ts
// ---------------------------------------------------------------------------

/** True when the OS can encrypt. Never throws; a throwing check means "no". */
export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * Encrypts a secret for storage, or returns `null` when the OS cannot.
 *
 * `null` is the refusal. Callers must treat it as "do not write" — returning an
 * unencrypted string here is the one change to this file that would undo the
 * reason it exists.
 */
export function sealSecret(plain: string): string | null {
  if (!encryptionAvailable()) return null;
  try {
    return safeStorage.encryptString(plain).toString('base64');
  } catch {
    return null;
  }
}

/** Decrypts a stored secret. Returns '' for anything unreadable — never throws. */
export function openSecret(sealed: string): string {
  if (!sealed) return '';
  try {
    return safeStorage.decryptString(Buffer.from(sealed, 'base64'));
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function readVault(): VaultFile {
  try {
    const raw = JSON.parse(fs.readFileSync(vaultPath(), 'utf-8')) as Partial<VaultFile>;
    return {
      version: typeof raw.version === 'number' ? raw.version : 1,
      secrets: raw.secrets && typeof raw.secrets === 'object' ? { ...raw.secrets } : {},
      meta: raw.meta && typeof raw.meta === 'object' ? { ...raw.meta } : {},
    };
  } catch {
    // Missing or corrupt both mean "nothing stored", which is a state the UI
    // already renders. Throwing here would take the settings page down with it.
    return { ...EMPTY, secrets: {}, meta: {} };
  }
}

function writeVault(file: VaultFile): void {
  const target = vaultPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  // 0o600: the ciphertext is useless to another user, but there is no reason to
  // hand it to them either.
  fs.writeFileSync(temp, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(temp, target);
}

function secretKey(id: string, field: string): string {
  return `${id}.${field}`;
}

/** The field a bare credential id refers to — the first one a spec declares. */
function primaryField(spec: CredentialSpec | undefined): string {
  return spec?.fields[0]?.name ?? 'apiKey';
}

function envValue(id: string, field: string): string {
  const spec = credentialSpec(id);
  const names = [credentialEnvVar(id, field)];
  // The bare `JPSTUDY_KEY_<ID>` form addresses the primary field, so a
  // single-field credential needs no suffix.
  if (field === primaryField(spec)) names.push(credentialEnvVar(id));
  for (const name of names) {
    const value = (process.env[name] ?? '').trim();
    if (value) return value;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API — main process only
// ---------------------------------------------------------------------------

/**
 * Stores a secret, or refuses when the OS cannot encrypt.
 *
 * An empty `secret` clears the field, which is how the settings page implements
 * Remove without a second channel.
 */
export function writeSecret(id: string, field: string, secret: string): VaultWriteResult {
  const trimmedId = id.trim();
  const trimmedField = field.trim();
  if (!trimmedId || !trimmedField) return { ok: false, messageKey: 'credential.result.badId' };

  const value = secret.trim();
  if (!value) {
    clearSecret(trimmedId, trimmedField);
    return { ok: true, messageKey: 'credential.result.removed' };
  }

  const sealed = sealSecret(value);
  if (sealed === null) {
    return { ok: false, messageKey: 'credential.result.noEncryption' };
  }

  const file = readVault();
  file.secrets[secretKey(trimmedId, trimmedField)] = sealed;
  writeVault(file);
  return { ok: true, messageKey: 'credential.result.stored' };
}

/**
 * Stores several fields for one credential in a single vault rewrite.
 *
 * Every non-empty value is sealed before the current file is changed. If even
 * one value cannot be encrypted, nothing is written. OAuth token pairs use this
 * path so an access token can never land without its matching refresh token.
 */
export function writeSecretSet(id: string, secrets: Record<string, string>): VaultWriteResult {
  const trimmedId = id.trim();
  const entries = Object.entries(secrets).map(([field, secret]) => [
    field.trim(),
    secret.trim(),
  ] as const);
  if (!trimmedId || entries.length === 0 || entries.some(([field]) => !field)) {
    return { ok: false, messageKey: 'credential.result.badId' };
  }

  const sealed = new Map<string, string>();
  for (const [field, secret] of entries) {
    if (!secret) continue;
    const value = sealSecret(secret);
    if (value === null) {
      return { ok: false, messageKey: 'credential.result.noEncryption' };
    }
    sealed.set(field, value);
  }

  const file = readVault();
  let changed = false;
  for (const [field, secret] of entries) {
    const key = secretKey(trimmedId, field);
    if (!secret) {
      if (key in file.secrets) {
        delete file.secrets[key];
        changed = true;
      }
      continue;
    }
    file.secrets[key] = sealed.get(field) as string;
    changed = true;
  }
  if (changed) writeVault(file);
  return {
    ok: true,
    messageKey: sealed.size > 0 ? 'credential.result.stored' : 'credential.result.removed',
  };
}

/**
 * Reads a secret back. **Main process only** — nothing on the IPC surface
 * returns this value.
 *
 * An environment override wins over the stored value, so a machine can run on
 * `JPSTUDY_KEY_GEMINI` without anything being written to disk.
 */
export function readSecret(id: string, field?: string): string {
  const trimmedId = id.trim();
  if (!trimmedId) return '';
  const name = (field ?? primaryField(credentialSpec(trimmedId))).trim();

  const fromEnv = envValue(trimmedId, name);
  if (fromEnv) return fromEnv;

  const stored = readVault().secrets[secretKey(trimmedId, name)];
  return stored ? openSecret(stored) : '';
}

/**
 * Whether a usable value exists.
 *
 * This decrypts rather than checking for the key's presence: a stored secret
 * that cannot be decrypted on this machine is not usable, and reporting it as
 * "configured" would send the user hunting for a server-side problem that is
 * really a local one.
 */
export function hasSecret(id: string, field?: string): boolean {
  return readSecret(id, field).length > 0;
}

/** Removes one field, or every field of a credential when `field` is omitted. */
export function clearSecret(id: string, field?: string): void {
  const trimmedId = id.trim();
  if (!trimmedId) return;
  const file = readVault();
  const prefix = `${trimmedId}.`;
  const doomed = field
    ? [secretKey(trimmedId, field.trim())]
    : Object.keys(file.secrets).filter((key) => key.startsWith(prefix));

  let changed = false;
  for (const key of doomed) {
    if (key in file.secrets) {
      delete file.secrets[key];
      changed = true;
    }
  }
  if (!field && file.meta[trimmedId]) {
    delete file.meta[trimmedId];
    changed = true;
  }
  if (changed) writeVault(file);
}

/** Records the outcome of a Test so the page can show when it last passed. */
export function recordTestResult(id: string, ok: boolean, error = ''): void {
  const trimmedId = id.trim();
  if (!trimmedId) return;
  const file = readVault();
  file.meta[trimmedId] = { lastTestedAt: Date.now(), lastError: ok ? '' : error.slice(0, 400) };
  writeVault(file);
}

/**
 * Renderer-safe status for one vault-stored credential.
 *
 * Credentials whose bytes live in another module (`store !== 'vault'`) are not
 * described here — `./ipc.ts` does not invent a status for them, because this
 * module genuinely does not know. The settings page reads those from the
 * existing per-provider APIs instead.
 */
export function vaultStatus(id: string): CredentialStatus {
  const spec = credentialSpec(id);
  const fields = spec?.storedSecretFields
    ?? spec?.fields.filter((entry) => entry.secret).map((entry) => entry.name)
    ?? ['apiKey'];
  const file = readVault();
  const meta = file.meta[id] ?? { lastTestedAt: 0, lastError: '' };

  let configured = false;
  let fromEnv = false;
  for (const field of fields) {
    if (envValue(id, field)) {
      configured = true;
      fromEnv = true;
      break;
    }
    const stored = file.secrets[secretKey(id, field)];
    if (stored && openSecret(stored)) configured = true;
  }

  return {
    id,
    configured,
    lastTestedAt: meta.lastTestedAt,
    lastError: meta.lastError,
    fromEnv,
  };
}

/** Status for every registry credential this vault owns. */
export function vaultStatuses(): CredentialStatus[] {
  return CREDENTIAL_REGISTRY.filter((spec) => spec.store === 'vault').map((spec) => vaultStatus(spec.id));
}

/**
 * Whether this machine can store a secret at all.
 *
 * Surfaced to the page so "Save" can explain the refusal *before* the user
 * pastes a key into a field that will reject it, rather than after.
 */
export function vaultCanStore(): boolean {
  return encryptionAvailable();
}
