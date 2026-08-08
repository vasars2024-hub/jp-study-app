// The secret store behind every `passwordRef` in scraper settings.
//
// The settings document is deliberately secret-free — it is exportable, it is
// diffed in the UI, and `validateScraperQbittorrentSettings` actively strips a
// plaintext `password` key. What it carries instead is a reference; this module
// is what that reference points at.
//
// Secrets are encrypted with Electron's safeStorage, which is DPAPI on Windows
// and the Keychain on macOS, so the file on disk is useless to anything but
// this user on this machine. When the OS cannot provide encryption the secret
// is refused rather than written in the clear — a scraper is not worth leaking
// a torrent client's password over.
//
// **That refusal policy now lives in `main/credentials/vault.ts`** and is shared
// with the app-wide vault rather than implemented twice. Only the policy moved:
// this store keeps its own file (`<scraperRoot>/credentials.json`) and its own
// `{ secrets: { ref: b64 } }` shape, because scraper refs are per-connection
// names chosen by the user, not the fixed registry ids the app vault keys on.

import { openSecret, sealSecret } from '../credentials/vault';
import { readScraperJson, writeScraperJson } from './store';
import { scraperLog } from './logBus';

const CREDENTIALS_FILE = 'credentials.json';

interface CredentialFile {
  /** ref → base64 of the safeStorage ciphertext. */
  secrets: Record<string, string>;
}

const EMPTY: CredentialFile = { secrets: {} };

export interface CredentialWriteResult {
  ok: boolean;
  /** The ref the caller should persist in settings. */
  ref: string;
  message: string;
}

/** Stores a secret and returns the reference to keep in settings. */
export async function setScraperSecret(
  ref: string,
  secret: string,
): Promise<CredentialWriteResult> {
  const key = ref.trim();
  if (!key) return { ok: false, ref: '', message: 'A credential needs a reference name.' };
  if (!secret) {
    await clearScraperSecret(key);
    return { ok: true, ref: '', message: 'Credential removed.' };
  }
  // `sealSecret` returns null for both "the OS says it cannot encrypt" and
  // "encryption threw"; either way the secret is refused, not downgraded.
  const sealed = sealSecret(secret);
  if (sealed === null) {
    scraperLog('error', 'credentials', 'OS encryption is unavailable; refused to store a secret.');
    return {
      ok: false,
      ref: '',
      message: 'This system cannot encrypt stored secrets, so nothing was saved.',
    };
  }
  const file = await readScraperJson<CredentialFile>(CREDENTIALS_FILE, EMPTY);
  const secrets = { ...file.secrets, [key]: sealed };
  await writeScraperJson(CREDENTIALS_FILE, { secrets });
  scraperLog('info', 'credentials', `Stored a secret for "${key}".`);
  return { ok: true, ref: key, message: 'Stored in OS-protected storage.' };
}

/** Reads a secret back. Returns '' when there is none, never throws. */
export async function getScraperSecret(ref: string): Promise<string> {
  const key = ref.trim();
  if (!key) return '';
  const file = await readScraperJson<CredentialFile>(CREDENTIALS_FILE, EMPTY);
  const stored = file.secrets[key];
  if (!stored) return '';
  const plain = openSecret(stored);
  if (!plain) {
    // A secret encrypted by a different user or machine cannot be read here.
    // Treating that as "no secret" produces an "unauthorized" result the user
    // can act on, rather than a crash.
    scraperLog('warn', 'credentials', `Could not decrypt the secret for "${key}".`);
  }
  return plain;
}

export async function hasScraperSecret(ref: string): Promise<boolean> {
  const file = await readScraperJson<CredentialFile>(CREDENTIALS_FILE, EMPTY);
  return Boolean(file.secrets[ref.trim()]);
}

export async function clearScraperSecret(ref: string): Promise<void> {
  const file = await readScraperJson<CredentialFile>(CREDENTIALS_FILE, EMPTY);
  if (!(ref in file.secrets)) return;
  const secrets = { ...file.secrets };
  delete secrets[ref];
  await writeScraperJson(CREDENTIALS_FILE, { secrets });
  scraperLog('info', 'credentials', `Removed the secret for "${ref}".`);
}
