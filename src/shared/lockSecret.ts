/**
 * lock4 — what the lock asks for (main keeps the kind, never a length):
 * `pin4` the classic 4-digit PIN (submits on the 4th digit), `pin` 4-12 digits
 * (the pad gets an Enter key), `passphrase` 6-64 characters, not all digits.
 * All are scrypt-hashed in main and share one backoff. Small on purpose: it is
 * in every window's boot graph (`lockStatus.ts` is type-only there).
 */
export type LockSecretKind = 'pin4' | 'pin' | 'passphrase';

export const LOCK_PIN_MAX_DIGITS = 12;
export const LOCK_PASSPHRASE_MAX_CHARS = 64;

/** The kind of an already-normalized secret, or null when it is not a valid one. */
export function lockSecretKindOf(secret: string): LockSecretKind | null {
  if (/^\d+$/.test(secret)) {
    if (secret.length === 4) return 'pin4';
    return secret.length > 4 && secret.length <= LOCK_PIN_MAX_DIGITS ? 'pin' : null;
  }
  const chars = [...secret].length;
  // No control characters: the lock screen's field could never type one back.
  if (chars < 6 || chars > LOCK_PASSPHRASE_MAX_CHARS || /\p{Cc}/u.test(secret)) return null;
  return 'passphrase';
}

/**
 * The form a secret is hashed in: NFC (one word, whatever the IME composed),
 * outer whitespace trimmed. A 4-digit PIN is unchanged, so old hashes match.
 */
export function normalizeLockSecret(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > LOCK_PASSPHRASE_MAX_CHARS * 4) return null;
  const s = input.normalize('NFC').trim();
  return lockSecretKindOf(s) ? s : null;
}

export function normalizeLockSecretKind(v: unknown): LockSecretKind {
  return v === 'pin' || v === 'passphrase' ? v : 'pin4';
}
