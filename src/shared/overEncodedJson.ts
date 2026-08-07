/**
 * Repair for values that were JSON-stringified more than once.
 *
 * `migrationRunner.writeLocal` used to re-stringify what `getItem` already
 * returned as text, adding **one escaping layer per boot**. That guard is in
 * place now (`migrationRunner.ts`), but nothing repaired the values that had
 * already accumulated layers, and the damage compounds: measured on a live
 * profile 2026-08-07, `jp-flashcard-deck` sat at **9 layers and 37.25 MB** for a
 * payload that is 1.26 MB once — a 29.6x bloat.
 *
 * Two consequences, and the second is the one that hurts:
 *
 * 1. A reader that parses **once** gets a `string` where it expected an object,
 *    so its field checks fail and it falls back to empty. 3,221 flashcards read
 *    as a deck of zero.
 * 2. `JSON.parse` of the bloated text is synchronous and cost **5.2 s** of
 *    blocked main thread on every read.
 *
 * `unwrapOverEncoded` peels until a parse fails or the result stops being a
 * string. The `layers` count is returned rather than assumed, so callers rewrite
 * the key only when it is greater than 1.
 *
 * **Limit, stated so nobody trips on it:** peeling is blind, so a stored value
 * that is a bare string of digits cannot survive — `"42"` parses to `'42'`,
 * which parses again to the number `42`, and nothing in the text distinguishes
 * that from one extra encoding layer. Apply this only to keys whose payload is
 * an object or array. Both current callers (`jp-flashcard-deck`,
 * `jp-study-csv-editor-v1`) store objects.
 */

export interface UnwrapResult<T> {
  /** The fully peeled value, or `null` when nothing parsed. */
  value: T | null;
  /** How many successful `JSON.parse` passes it took. 1 is a healthy value. */
  layers: number;
}

/** Hard stop so a pathological value cannot spin: 18 layers was the live worst case. */
const MAX_LAYERS = 40;

/**
 * Suffix for a value that was over-encoded and could **not** be recovered into
 * the shape its reader expects.
 *
 * This exists because of a real loss during the audit. `jp-study-csv-editor-v1`
 * sat at 18 layers / 12.3 MB; peeling produced an object that did not match
 * `{table:{headers,rows}}`, so the reader returned `null`, the panel fell back
 * to `defaultEditorSnapshot()`, and the first save wrote a 288-byte empty table
 * over it. That overwrite is the *pre-existing* behaviour — a single parse
 * failed the same way — but it means a damaged value is destroyed by the very
 * act of opening the feature that owns it, with nothing kept.
 *
 * Quarantining costs one extra key and makes the failure recoverable by hand
 * instead of terminal. Renderer storage has no restore point (audit §6.4).
 */
export const QUARANTINE_SUFFIX = '.corrupt-backup';

/**
 * Copy `key` aside before a caller lets a damaged value be overwritten.
 * No-ops when the value is healthy, when there is nothing stored, or when a
 * quarantine copy already exists — the *first* damaged value is the one worth
 * keeping, and re-running must not overwrite it with an already-defaulted one.
 */
export function quarantineIfUnrepaired(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  layers: number,
): 'quarantined' | 'skipped' | 'failed' {
  if (!isOverEncoded(layers)) return 'skipped';
  try {
    const raw = storage.getItem(key);
    if (raw == null || raw === '') return 'skipped';
    const backupKey = `${key}${QUARANTINE_SUFFIX}`;
    if (storage.getItem(backupKey) != null) return 'skipped';
    storage.setItem(backupKey, raw);
    return 'quarantined';
  } catch {
    // Quota is the likely cause, and the damaged value is large by definition.
    return 'failed';
  }
}

export function unwrapOverEncoded<T = unknown>(raw: string | null | undefined): UnwrapResult<T> {
  if (raw == null || raw === '') return { value: null, layers: 0 };
  let current: unknown = raw;
  let layers = 0;
  while (typeof current === 'string' && layers < MAX_LAYERS) {
    let next: unknown;
    try {
      next = JSON.parse(current);
    } catch {
      // Not JSON any more. If we never parsed anything the value was never
      // JSON at all; otherwise this is the real payload and it is a string.
      break;
    }
    current = next;
    layers += 1;
  }
  return { value: (current ?? null) as T | null, layers };
}

/**
 * True when the stored text carries more encoding layers than it should.
 * `expected` is 1 for the ordinary `JSON.stringify(obj)` case.
 */
export function isOverEncoded(layers: number, expected = 1): boolean {
  return layers > expected;
}
