// Whether a scraper credential actually exists, as opposed to being named.
//
// A `*Ref` in scraper settings is an opaque handle into OS-protected storage,
// never the secret itself. That makes "the ref is non-empty" a statement about
// the settings document and nothing more: clearing a secret, switching machines
// or a failed write all leave the ref in place with nothing behind it. Rendering
// "password stored" off the ref alone therefore tells a user with an empty vault
// that they are configured, and the connection then fails for no visible reason.
//
// Only main can answer the real question (`scraperHasCredential`), and it
// answers asynchronously — so "not answered yet" is a fourth state, distinct
// from "answered no". Collapsing it into `unset` would flash "no password" on
// every mount for a user who has one.

import type { ScraperTextKey } from '../strings';

export type CredentialPresence =
  /** Main has not answered yet. Say nothing definite. */
  | 'checking'
  /** The ref names a secret and main confirms it exists. */
  | 'stored'
  /** No ref configured at all — nothing was ever set up. */
  | 'unset'
  /** A ref is configured but the store is empty behind it. The honest failure. */
  | 'orphaned'
  /** The probe itself failed or is unavailable. Claim neither yes nor no. */
  | 'unknown';

/** `scraperHasCredential(ref)`'s answer: the boolean, `null` in flight, `'error'` if it never answers. */
export type VaultAnswer = boolean | null | 'error';

export function resolveCredentialPresence(input: {
  /** The `*Ref` value from scraper settings. */
  ref: string | null | undefined;
  vaultHas: VaultAnswer;
}): CredentialPresence {
  const ref = (input.ref ?? '').trim();
  if (!ref) return 'unset';
  if (input.vaultHas === 'error') return 'unknown';
  if (input.vaultHas === null) return 'checking';
  return input.vaultHas ? 'stored' : 'orphaned';
}

/** Text per state, per mode. Exhaustive by type, so a new state cannot render blank. */
export const PASSWORD_PRESENCE_TEXT: Record<CredentialPresence, ScraperTextKey> = {
  checking: 'torrent.credChecking',
  stored: 'torrent.credStored',
  unset: 'torrent.credMissing',
  orphaned: 'torrent.credOrphaned',
  unknown: 'torrent.credUnknown',
};

export const KEY_PRESENCE_TEXT: Record<CredentialPresence, ScraperTextKey> = {
  checking: 'torrent.keyChecking',
  stored: 'torrent.keyStored',
  unset: 'torrent.keyMissing',
  orphaned: 'torrent.keyOrphaned',
  unknown: 'torrent.keyUnknown',
};

export const CREDENTIAL_PRESENCE_TONE: Record<
  CredentialPresence,
  'neutral' | 'good' | 'warn' | 'bad'
> = {
  // `orphaned` is worse than `unset`: nothing was configured is a to-do, while
  // configured-but-empty is a setup the user believes is finished and is not.
  checking: 'neutral',
  stored: 'good',
  unset: 'warn',
  orphaned: 'bad',
  unknown: 'neutral',
};
