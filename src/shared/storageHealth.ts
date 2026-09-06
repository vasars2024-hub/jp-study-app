/**
 * A standing guard against the storage fault behind audit item 5.7.
 *
 * 5.7 was filed as "the Scraper and other new features don't remember". Every
 * scraper key turned out to be well-formed; what was wrong was the shared
 * resource. `localStorage` held **51.62 MB**, 49 MB of it two keys that were
 * being JSON-stringified once more on every boot (audit 6.A), so any feature
 * writing a new or growing value was writing into a store already past its
 * ceiling — and the newest features lose that race, because theirs are the keys
 * not yet present. After the 6.A repair the same 73 keys measured 1.35 MB.
 *
 * The root cause is fixed. This module exists because **the class recurs**: the
 * moment some other writer starts re-encoding, or one key starts growing without
 * a bound, the store fills again and the symptom comes back somewhere else
 * entirely. Nothing measured the store, so nothing could see it coming.
 *
 * Two things are checked, and they are not the same kind of finding:
 *
 * - **Over-encoding is a defect**, always, at any size. It is the 6.A signature
 *   and it compounds per boot. Any key carrying it makes the store `critical`.
 * - **Size is a budget, not a quota.** The real ceiling on this profile is
 *   unknown and larger than the web default: 51.62 MB was stored, and after the
 *   repair a probe wrote 12.8 MB of scratch on top of 1.35 MB without a
 *   `QuotaExceededError`. So the thresholds below are a *growth alarm* chosen
 *   against the measured healthy baseline, deliberately not a claim about where
 *   writes start failing. Crossing one means "look at this", not "it is full".
 *
 * Bytes are counted as Chromium meters them — UTF-16, two bytes per code unit,
 * key included — so the number here is comparable with the browser's own
 * accounting rather than with `value.length`.
 */

import { QUARANTINE_SUFFIX, unwrapOverEncoded } from './overEncodedJson';

/** The subset of `Storage` this module reads. Keeps it testable off a real DOM. */
export type ReadableStorage = Pick<Storage, 'getItem' | 'key' | 'length'>;

export interface StorageKeySize {
  key: string;
  bytes: number;
}

export interface StorageFootprint {
  keyCount: number;
  totalBytes: number;
  /** Descending by size, capped by `largestCount`. */
  largest: StorageKeySize[];
}

export interface OverEncodedKey {
  key: string;
  /** Successful `JSON.parse` passes. 1 is healthy; > 1 is the 6.A defect. */
  layers: number;
  bytes: number;
}

export type StorageHealthStatus = 'ok' | 'warn' | 'critical';

/** Machine-readable reasons. The UI maps these to i18n keys; never user text. */
export type StorageHealthReason = 'over-encoded' | 'total-over-budget' | 'key-over-budget';

export interface StorageHealth {
  status: StorageHealthStatus;
  footprint: StorageFootprint;
  overEncoded: OverEncodedKey[];
  reasons: StorageHealthReason[];
  /** Keys at or above `keyBudgetBytes`, largest first. */
  oversizedKeys: StorageKeySize[];
}

export interface StorageBudget {
  /** Whole-store growth alarm. Baseline after the 6.A repair was 1.35 MB. */
  totalBudgetBytes: number;
  /** Single-key alarm. The largest healthy key measured 1.26 MB. */
  keyBudgetBytes: number;
}

export const DEFAULT_STORAGE_BUDGET: StorageBudget = {
  totalBudgetBytes: 8 * 1024 * 1024,
  keyBudgetBytes: 2 * 1024 * 1024,
};

/** UTF-16 bytes for one entry, counted the way the browser meters the origin. */
export function entryBytes(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

function listKeys(storage: ReadableStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key != null) keys.push(key);
  }
  return keys;
}

export function measureStorage(storage: ReadableStorage, largestCount = 10): StorageFootprint {
  const sizes: StorageKeySize[] = [];
  let totalBytes = 0;
  for (const key of listKeys(storage)) {
    const value = storage.getItem(key) ?? '';
    const bytes = entryBytes(key, value);
    totalBytes += bytes;
    sizes.push({ key, bytes });
  }
  sizes.sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));
  return { keyCount: sizes.length, totalBytes, largest: sizes.slice(0, largestCount) };
}

/**
 * Keys carrying more encoding layers than they should.
 *
 * Two exclusions, both of which would otherwise produce a permanent false
 * positive:
 *
 * 1. **Peeling is blind** (`overEncodedJson`'s own stated limit): a stored bare
 *    scalar such as `jp-app-zoom` = `1.1` parses once to a number, and a value
 *    that is a quoted number peels twice with nothing in the text to say it was
 *    not two encodings. Only a peeled **object or array** is reported, which is
 *    the shape every 6.A victim had.
 * 2. **Quarantine copies are raw damaged text on purpose.** `.corrupt-backup`
 *    keys exist to preserve a value the reader could not repair; flagging them
 *    would report the rescue as the injury, forever.
 */
export function scanOverEncoded(storage: ReadableStorage): OverEncodedKey[] {
  const found: OverEncodedKey[] = [];
  for (const key of listKeys(storage)) {
    if (key.endsWith(QUARANTINE_SUFFIX)) continue;
    const raw = storage.getItem(key);
    if (raw == null || raw === '') continue;
    const { value, layers } = unwrapOverEncoded(raw);
    if (layers <= 1) continue;
    if (typeof value !== 'object' || value === null) continue;
    found.push({ key, layers, bytes: entryBytes(key, raw) });
  }
  found.sort((a, b) => b.layers - a.layers || b.bytes - a.bytes);
  return found;
}

export function inspectStorageHealth(
  storage: ReadableStorage,
  budget: StorageBudget = DEFAULT_STORAGE_BUDGET,
): StorageHealth {
  const footprint = measureStorage(storage);
  const overEncoded = scanOverEncoded(storage);
  const oversizedKeys = footprint.largest.filter((entry) => entry.bytes >= budget.keyBudgetBytes);

  const reasons: StorageHealthReason[] = [];
  if (overEncoded.length > 0) reasons.push('over-encoded');
  if (footprint.totalBytes >= budget.totalBudgetBytes) reasons.push('total-over-budget');
  if (oversizedKeys.length > 0) reasons.push('key-over-budget');

  // Over-encoding is a defect at any size, so it outranks the budget alarms.
  const status: StorageHealthStatus =
    overEncoded.length > 0 ? 'critical' : reasons.length > 0 ? 'warn' : 'ok';

  return { status, footprint, overEncoded, reasons, oversizedKeys };
}

/**
 * True when a thrown value is the browser refusing a write for want of room.
 *
 * Checked by name and by legacy code rather than by `instanceof DOMException`,
 * because the two names below are what Chromium and Gecko actually throw and
 * `instanceof` does not survive every test environment.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const candidate = err as { name?: unknown; code?: unknown };
  if (candidate.name === 'QuotaExceededError') return true;
  if (candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  // Pre-DOMException-name browsers signalled quota numerically.
  return candidate.code === 22 || candidate.code === 1014;
}
