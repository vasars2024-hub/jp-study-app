/**
 * The typed contract between the main-owned Reading Lists store
 * (`main/readingListsStore.ts`) and its renderer consumers.
 *
 * Shaped like `agentSpendBridge.ts` / `agentOperationalBridge.ts`, and for the
 * same two reasons: a failure carries a closed set of codes rather than prose
 * that could name a user-data path, and both directions are re-derived rather
 * than trusted.
 *
 * ## Why the write is compare-and-swap, not `save`
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §0 records the trap this avoids:
 * `preferredSubtitleId` is persisted in main precisely because "the library and
 * the player are different windows". Reading Lists has the same shape — the
 * library window, the reader window and a desktop widget can all be looking at
 * the same list — and the completion detector (§4) writes from main with no
 * renderer involved at all. A plain `save` would let a window that had been open
 * since this morning write back a document without the book main ticked five
 * minutes ago, silently un-finishing it. So a write carries the revision it was
 * derived from and is refused if the document has moved.
 *
 * The refusal is not an error state for the caller to surface: it returns the
 * current document, and the renderer re-applies its intent against that. That is
 * exactly `agentWorkspaceStore.compareAndWrite`'s contract, which is the
 * precedent this follows rather than inventing a second one.
 */

import {
  isReadingListsDocumentShape,
  normalizeReadingListsDocument,
  type ReadingListEvent,
  type ReadingListsDocument,
} from './readingLists';

/**
 * Channel ids in one place so a parity test can assert the handler, the preload
 * method and the call site agree. Call sites still spell the literal out, as
 * every other channel in this repo does, so `tools/architecture-audit.cjs` can
 * see both ends.
 */
export const READING_LISTS_CHANNELS = {
  load: 'readingLists:load',
  write: 'readingLists:write',
  events: 'readingLists:events',
  changed: 'readingLists:changed',
} as const;

export type ReadingListsChannel =
  (typeof READING_LISTS_CHANNELS)[keyof typeof READING_LISTS_CHANNELS];

/**
 * Two of these are renderer-only. `bridge-unavailable` means `window.api` does
 * not carry the method, which is what a stale preload or a non-Electron host
 * looks like. `conflict` means the compare-and-swap was refused more times than
 * the client retried — a distinct, honest state ("the list moved under you"),
 * and folding it into `write-failed` would be exactly the generic failure the
 * surface must not show. The other two can only originate in main.
 */
export type ReadingListsFailureCode =
  | 'invalid-request'
  | 'read-failed'
  | 'write-failed'
  | 'bridge-unavailable'
  | 'conflict';

/**
 * How the document main is serving came to be. The surface needs this to satisfy
 * §11.4's "a corrupt store shows what happened and offers last-good recovery, it
 * does not silently show zero lists".
 *
 *   `ok`         — the file parsed.
 *   `empty`      — no file yet. First run. Not a fault, and must not read as one.
 *   `recovered`  — the file did not parse and the last-good snapshot was served
 *                  instead. `lostRevisions` is how far back that put the user.
 *   `reset`      — the file did not parse and there was no last-good snapshot.
 *                  The only case where lists are actually gone.
 */
export type ReadingListsHealthState = 'ok' | 'empty' | 'recovered' | 'reset';

export interface ReadingListsHealth {
  state: ReadingListsHealthState;
  /** Revisions between the unreadable document and the one being served. */
  lostRevisions: number;
  /** Set only when `state` is `recovered` or `reset`. Epoch ms. */
  detectedAt?: number;
}

export interface ReadingListsSnapshot {
  document: ReadingListsDocument;
  health: ReadingListsHealth;
}

export interface ReadingListsSuccess {
  ok: true;
  snapshot: ReadingListsSnapshot;
  /**
   * `false` only from `write`, and only because the document had moved. The
   * snapshot is then the current one and the caller re-applies its intent.
   */
  applied: boolean;
}

export interface ReadingListsFailure {
  ok: false;
  code: ReadingListsFailureCode;
}

export type ReadingListsResult = ReadingListsSuccess | ReadingListsFailure;

export interface ReadingListsEventsSuccess {
  ok: true;
  events: ReadingListEvent[];
}

export type ReadingListsEventsResult = ReadingListsEventsSuccess | ReadingListsFailure;

const FAILURE_CODES = new Set<ReadingListsFailureCode>([
  'invalid-request',
  'read-failed',
  'write-failed',
  'bridge-unavailable',
  'conflict',
]);

const HEALTH_STATES = new Set<ReadingListsHealthState>([
  'ok',
  'empty',
  'recovered',
  'reset',
]);

const EVENT_KINDS = new Set<ReadingListEvent['kind']>([
  'list-created',
  'list-updated',
  'list-deleted',
  'entry-added',
  'entry-updated',
  'entry-removed',
  'entry-finished',
  'entry-unfinished',
  'work-bound',
  'import-applied',
  'document-recovered',
]);

export function readingListsSuccess(
  snapshot: ReadingListsSnapshot,
  applied = true,
): ReadingListsSuccess {
  return { ok: true, snapshot, applied };
}

export function readingListsFailure(code: ReadingListsFailureCode): ReadingListsFailure {
  return { ok: false, code };
}

/**
 * Guards the one write.
 *
 * `baseRevision` must be present and a number. It is not defaulted: a missing
 * token would turn a compare-and-swap into a blind overwrite, which is the exact
 * failure this contract exists to prevent, and defaulting it would make every
 * caller that forgot it silently unsafe rather than loudly refused.
 *
 * `document` must carry the document SHAPE, not merely be an object. It used to
 * accept `{}` and `[]`, and because `write` normalizes whatever it is given, a
 * caller holding the correct revision could commit a wipe through the front door
 * — the same P0 as the read side (boss audit 2026-09-05, Finding 1). Refusing it
 * here means the malformed write is reported as `invalid-request` rather than
 * applied and broadcast.
 */
export function isReadingListsWriteRequest(
  value: unknown,
): value is { baseRevision: number; document: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const raw = value as { baseRevision?: unknown; document?: unknown };
  if (typeof raw.baseRevision !== 'number' || !Number.isFinite(raw.baseRevision)) return false;
  return isReadingListsDocumentShape(raw.document);
}

export function normalizeReadingListsHealth(value: unknown): ReadingListsHealth {
  const raw = (value && typeof value === 'object' ? value : {}) as {
    state?: unknown;
    lostRevisions?: unknown;
    detectedAt?: unknown;
  };
  const state =
    typeof raw.state === 'string' && HEALTH_STATES.has(raw.state as ReadingListsHealthState)
      ? (raw.state as ReadingListsHealthState)
      : 'ok';
  const lost =
    typeof raw.lostRevisions === 'number' && Number.isFinite(raw.lostRevisions)
      ? Math.max(0, Math.trunc(raw.lostRevisions))
      : 0;
  const health: ReadingListsHealth = { state, lostRevisions: lost };
  if (typeof raw.detectedAt === 'number' && Number.isFinite(raw.detectedAt)) {
    health.detectedAt = raw.detectedAt;
  }
  return health;
}

export function normalizeReadingListsSnapshot(value: unknown): ReadingListsSnapshot {
  const raw = (value && typeof value === 'object' ? value : {}) as {
    document?: unknown;
    health?: unknown;
  };
  return {
    document: normalizeReadingListsDocument(raw.document),
    health: normalizeReadingListsHealth(raw.health),
  };
}

/**
 * Re-derives a result from whatever actually crossed. An unknown shape becomes
 * `read-failed` rather than a thrown renderer exception: the consumers have a
 * recoverable path and no way to recover from a throw.
 */
export function normalizeReadingListsResult(value: unknown): ReadingListsResult {
  if (!value || typeof value !== 'object') return readingListsFailure('read-failed');
  const raw = value as { ok?: unknown; code?: unknown; snapshot?: unknown; applied?: unknown };
  if (raw.ok === false) {
    return readingListsFailure(
      typeof raw.code === 'string' && FAILURE_CODES.has(raw.code as ReadingListsFailureCode)
        ? (raw.code as ReadingListsFailureCode)
        : 'read-failed',
    );
  }
  if (raw.ok !== true) return readingListsFailure('read-failed');
  return readingListsSuccess(
    normalizeReadingListsSnapshot(raw.snapshot),
    // Absent means applied: `load` does not carry the field, and reading a missing
    // flag as "refused" would make every successful load look like a conflict.
    raw.applied !== false,
  );
}

export function normalizeReadingListEvent(value: unknown): ReadingListEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.kind !== 'string' || !EVENT_KINDS.has(raw.kind as ReadingListEvent['kind'])) {
    return null;
  }
  const event: ReadingListEvent = {
    at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0,
    kind: raw.kind as ReadingListEvent['kind'],
    revision:
      typeof raw.revision === 'number' && Number.isFinite(raw.revision)
        ? Math.max(0, Math.trunc(raw.revision))
        : 0,
  };
  if (typeof raw.listId === 'string' && raw.listId) event.listId = raw.listId;
  if (typeof raw.entryId === 'string' && raw.entryId) event.entryId = raw.entryId;
  if (typeof raw.workId === 'string' && raw.workId) event.workId = raw.workId;
  if (raw.detail && typeof raw.detail === 'object' && !Array.isArray(raw.detail)) {
    const detail: Record<string, string | number | boolean | null> = {};
    for (const [key, item] of Object.entries(raw.detail as Record<string, unknown>)) {
      if (
        item === null ||
        typeof item === 'string' ||
        typeof item === 'boolean' ||
        (typeof item === 'number' && Number.isFinite(item))
      ) {
        detail[key] = item;
      }
    }
    event.detail = detail;
  }
  return event;
}

export function normalizeReadingListsEventsResult(value: unknown): ReadingListsEventsResult {
  if (!value || typeof value !== 'object') return readingListsFailure('read-failed');
  const raw = value as { ok?: unknown; code?: unknown; events?: unknown };
  if (raw.ok === false) {
    return readingListsFailure(
      typeof raw.code === 'string' && FAILURE_CODES.has(raw.code as ReadingListsFailureCode)
        ? (raw.code as ReadingListsFailureCode)
        : 'read-failed',
    );
  }
  if (raw.ok !== true) return readingListsFailure('read-failed');
  const events = Array.isArray(raw.events)
    ? raw.events
        .map((item) => normalizeReadingListEvent(item))
        .filter((item): item is ReadingListEvent => item !== null)
    : [];
  return { ok: true, events };
}
