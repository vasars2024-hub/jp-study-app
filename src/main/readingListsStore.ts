/**
 * The main-owned Reading Lists store.
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §10.1 is blunt about why this is here and
 * not in the renderer: Reading Garden persists to `localStorage`
 * (`jp-reading-garden-v1`), and renderer storage has **no restore point** —
 * userData backups hold main-process JSON only. A profile reset would eat a year
 * of lists. So: main-process JSON, single writer, atomic.
 *
 * Three files, and the third is the one that makes P0's acceptance provable.
 *
 *   `reading-lists.json`         the document
 *   `reading-lists.last-good.json`  the last document that parsed
 *   `reading-lists-events.jsonl` append-only, one line per applied mutation
 *
 * ## Why a separate last-good file rather than "fail closed to empty"
 *
 * `agentSpendStore` and `agentWorkspaceStore` both fall back to an empty document
 * on a parse failure, and for them that is right: an empty spend ledger refuses
 * nothing, an empty workspace loses a conversation the user can start again. Here
 * the same choice would silently show zero lists — which §11.4 names as the
 * failure mode to avoid, because the user cannot tell it apart from "I never made
 * any". The last-good copy is written only after a document has been read AND
 * parsed, so it is by construction a document that worked, and serving it is the
 * difference between losing one write and losing everything.
 *
 * The recovery is *reported*, never silent: the snapshot carries a health record
 * saying which of the four states produced it and how many revisions were lost.
 *
 * ## The event log
 *
 * Append-only JSONL, capped. It is what makes "when did I actually finish this"
 * answerable (§5.12), what makes an accidental bulk delete recoverable (§5.13),
 * and what §11.4's "undo, everywhere" reads from. Appending is best-effort: a
 * failure to log must never fail the write that was already committed, because a
 * lost log line costs history and a lost document costs the lists.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { writeFileAtomicSync } from './atomicJson';
import {
  emptyReadingListsDocument,
  isReadingListsDocumentShape,
  normalizeReadingListsDocument,
  readingListsNormalizationWipes,
  type ReadingListEvent,
  type ReadingListsDocument,
} from '../shared/readingLists';
import type {
  ReadingListsHealth,
  ReadingListsSnapshot,
} from '../shared/readingListsBridge';

export const READING_LISTS_FILE = 'reading-lists.json';
export const READING_LISTS_LAST_GOOD_FILE = 'reading-lists.last-good.json';
export const READING_LISTS_EVENTS_FILE = 'reading-lists-events.jsonl';

/**
 * The log is history, not state — nothing reads past this depth, and an unbounded
 * append-only file on a path the user never sees is how a 5 GB surprise happens.
 * Trimming keeps the newest.
 */
export const READING_LISTS_EVENT_LIMIT = 5000;

export interface ReadingListsWriteResult {
  applied: boolean;
  snapshot: ReadingListsSnapshot;
}

export interface ReadingListsStore {
  readonly filePath: string;
  readonly lastGoodPath: string;
  readonly eventsPath: string;
  /** The document plus how it came to be. Never throws. */
  read(): ReadingListsSnapshot;
  /**
   * Compare-and-swap. `baseRevision` must equal the persisted revision or the
   * write is refused and the *current* snapshot is returned for the caller to
   * re-apply against.
   */
  write(
    baseRevision: number,
    document: unknown,
    events?: readonly Omit<ReadingListEvent, 'revision'>[],
  ): ReadingListsWriteResult;
  /** Newest first, capped by `limit`. */
  events(limit?: number): ReadingListEvent[];
}

function atomicWrite(filePath: string, text: string): void {
  // No `.bak`: this store keeps its own last-good file (see `lastGoodPath`).
  writeFileAtomicSync(filePath, text, { mode: 0o600, backup: false });
}

/**
 * A parse that distinguishes "absent" from "unreadable".
 *
 * The two must not collapse into one `catch`: an absent file is first run and is
 * not a fault, an unreadable file is the case that has to trigger recovery and
 * say so. Reading the directory entry rather than catching `ENOENT` keeps that
 * distinction in one place.
 */
function readDocument(filePath: string): ReadingListsDocument | 'absent' | 'unreadable' {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'absent' : 'unreadable';
  }
  try {
    const parsed: unknown = JSON.parse(text);
    // `normalizeReadingListsDocument` is total, so ANY input parses to a usable
    // document rather than throwing. That would turn a corrupt-but-valid-JSON
    // file into a silent wipe, which is the whole failure this function exists to
    // catch — so require the document shape here instead.
    //
    // This used to reject only `null`, arrays and scalars, which let `{}` — the
    // shape a half-written file most easily lands on — through as a healthy empty
    // library (boss audit 2026-09-05, Finding 1).
    if (!isReadingListsDocumentShape(parsed)) return 'unreadable';
    // ...and the shape guard is document-level only, so a file whose `lists` are
    // all unusable members still passes it, normalizes to zero, and would be
    // promoted over the restore point exactly as `{}` used to be (boss audit
    // 2026-09-05 attempt 4, Finding 3). A file that claims lists and can serve
    // none of them is unreadable, not empty.
    if (readingListsNormalizationWipes(parsed)) return 'unreadable';
    return normalizeReadingListsDocument(parsed);
  } catch {
    return 'unreadable';
  }
}

function health(
  state: ReadingListsHealth['state'],
  lostRevisions = 0,
  detectedAt?: number,
): ReadingListsHealth {
  const record: ReadingListsHealth = { state, lostRevisions };
  if (detectedAt !== undefined) record.detectedAt = detectedAt;
  return record;
}

function appendEvents(eventsPath: string, events: readonly ReadingListEvent[]): void {
  if (!events.length) return;
  try {
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(
      eventsPath,
      `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
  } catch {
    // Best effort by design. See the header: a lost log line costs history, and
    // failing the committed write over it would cost the lists.
    return;
  }
  trimEvents(eventsPath);
}

function trimEvents(eventsPath: string): void {
  try {
    const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= READING_LISTS_EVENT_LIMIT) return;
    atomicWrite(
      eventsPath,
      `${lines.slice(lines.length - READING_LISTS_EVENT_LIMIT).join('\n')}\n`,
    );
  } catch {
    // A log that cannot be trimmed is still a usable log.
  }
}

function readEvents(eventsPath: string, limit: number): ReadingListEvent[] {
  let lines: string[];
  try {
    lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  const out: ReadingListEvent[] = [];
  // Newest first, and stop as soon as `limit` is met: the log is capped at 5000
  // and a surface asking for 20 must not parse all of them.
  for (let index = lines.length - 1; index >= 0 && out.length < limit; index--) {
    try {
      const parsed: unknown = JSON.parse(lines[index]);
      if (parsed && typeof parsed === 'object') out.push(parsed as ReadingListEvent);
    } catch {
      // One torn line — a crash mid-append — does not invalidate the rest.
    }
  }
  return out;
}

export function createReadingListsStore(rootDirectory: string): ReadingListsStore {
  const filePath = path.join(rootDirectory, READING_LISTS_FILE);
  const lastGoodPath = path.join(rootDirectory, READING_LISTS_LAST_GOOD_FILE);
  const eventsPath = path.join(rootDirectory, READING_LISTS_EVENTS_FILE);

  const snapshot = (): ReadingListsSnapshot => {
    const current = readDocument(filePath);
    if (current === 'absent') {
      return { document: emptyReadingListsDocument(), health: health('empty') };
    }
    if (current !== 'unreadable') {
      // Only a document that actually parsed becomes the fallback. Writing it here
      // rather than inside `write` means a file repaired by hand, or one written by
      // an older build, also earns a restore point on the next read.
      const text = JSON.stringify(current, null, 2);
      try {
        if (readFileText(lastGoodPath) !== text) atomicWrite(lastGoodPath, text);
      } catch {
        // The document is fine; only the restore point could not be refreshed.
      }
      return { document: current, health: health('ok') };
    }

    const detectedAt = Date.now();
    const lastGood = readDocument(lastGoodPath);
    if (lastGood === 'absent' || lastGood === 'unreadable') {
      // The only case where lists are genuinely gone. Reported as `reset` so the
      // surface can say that in plain words instead of rendering an empty grid.
      return { document: emptyReadingListsDocument(), health: health('reset', 0, detectedAt) };
    }
    return {
      document: lastGood,
      // Unknown-but-at-least-one: the unreadable file's revision cannot be read, so
      // claiming a precise count would be a fabricated number.
      health: health('recovered', 1, detectedAt),
    };
  };

  return {
    filePath,
    lastGoodPath,
    eventsPath,
    read: () => {
      const result = snapshot();
      if (result.health.state === 'recovered' || result.health.state === 'reset') {
        appendEvents(eventsPath, [
          {
            at: result.health.detectedAt ?? Date.now(),
            kind: 'document-recovered',
            revision: result.document.revision,
            detail: { state: result.health.state },
          },
        ]);
      }
      return result;
    },
    write: (baseRevision, document, events = []) => {
      const current = snapshot();
      if (current.document.revision !== baseRevision) {
        return { applied: false, snapshot: current };
      }
      const next: ReadingListsDocument = {
        ...normalizeReadingListsDocument(document),
        // Main owns the token. A renderer can return the revision it read but
        // cannot choose the next one, skip ahead, or roll the document backwards.
        revision: current.document.revision + 1,
      };
      atomicWrite(filePath, JSON.stringify(next, null, 2));
      appendEvents(
        eventsPath,
        events.map((event) => ({ ...event, revision: next.revision })),
      );
      return { applied: true, snapshot: { document: next, health: health('ok') } };
    },
    events: (limit = 200) => readEvents(eventsPath, Math.max(0, Math.trunc(limit))),
  };
}

function readFileText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

let store: ReadingListsStore | null = null;

/**
 * Resolved lazily: `app.getPath('userData')` is only meaningful after Electron is
 * ready, and a test points `createReadingListsStore` at a temporary root instead.
 */
export function getReadingListsStore(): ReadingListsStore {
  if (!store) store = createReadingListsStore(app.getPath('userData'));
  return store;
}

/** Test seam. Production never calls this. */
export function setReadingListsStoreForTesting(value: ReadingListsStore | null): void {
  store = value;
}
