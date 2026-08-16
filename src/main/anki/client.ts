// Typed AnkiConnect transport (SERVICES_PATCH.md 5.2). One request shape:
// POST <ankiUrl> with body { action, version: 6, params }. Every failure is
// normalized into an AnkiError before leaving this module.

import { ANKI_UNREACHABLE_MSG, ANKI_COLLECTION_UNAVAILABLE_MSG } from '../../shared/anki';
import type { AnkiConnectModel } from '../../shared/ankiConnectDraft';
import { DEFAULT_ANKI_URL } from '../../shared/profiles';

// ----- Wire shapes ---------------------------------------------------------

export interface AnkiNoteInput {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options: { allowDuplicate: false };
}

export interface AnkiNoteInfo {
  noteId: number;
  modelName: string;
  fields: Record<string, { value: string; order: number }>;
  cards: number[];
  tags: string[];
  /** Epoch seconds. Reported by AnkiConnect 6; the workbench draft preserves it. */
  mod?: number;
  profile?: string;
}

export interface AnkiCardInfo {
  cardId: number;
  /** Days; negative values (learning steps in seconds) clamp to 0 at fold time. */
  interval: number;
  note: number;
  /** Anki scheduler queue. -1 is the authoritative suspended state. */
  queue?: number;
  /** The rest of the scheduler row, read by the workbench draft and by nothing else. */
  deckName?: string;
  modelName?: string;
  ord?: number;
  type?: number;
  due?: number;
  factor?: number;
  reps?: number;
  lapses?: number;
  left?: number;
  mod?: number;
  flags?: number;
}

export interface CreateModelParams {
  modelName: string;
  inOrderFields: string[];
  css: string;
  cardTemplates: { Name: string; Front: string; Back: string }[];
}

/** Compile-time action map: params and result types per AnkiConnect action. */
export interface AnkiActionMap {
  version: { params: undefined; result: number };
  deckNames: { params: undefined; result: string[] };
  createDeck: { params: { deck: string }; result: number };
  modelNames: { params: undefined; result: string[] };
  modelFieldNames: { params: { modelName: string }; result: string[] };
  createModel: { params: CreateModelParams; result: unknown };
  addNote: { params: { note: AnkiNoteInput }; result: number };
  canAddNotes: { params: { notes: AnkiNoteInput[] }; result: boolean[] };
  deleteNotes: { params: { notes: number[] }; result: null };
  deleteMediaFile: { params: { filename: string }; result: null };
  storeMediaFile: { params: { filename: string; data: string }; result: string };
  findNotes: { params: { query: string }; result: number[] };
  /** Read-only card search. Used by the due forecast, which lets Anki's own
   *  scheduler resolve `prop:due=N` rather than deriving dates locally. */
  findCards: { params: { query: string }; result: number[] };
  notesInfo: { params: { notes: number[] }; result: AnkiNoteInfo[] };
  cardsInfo: { params: { cards: number[] }; result: AnkiCardInfo[] };
  // ----- workbench draft reads (ANKI_DECK_WORKBENCH_PLAN.md adapter 2) -----
  /** Deck name to deck id. `deckNames` alone cannot key a card's deck. */
  deckNamesAndIds: { params: undefined; result: Record<string, number> };
  /**
   * Anki's whole model row per name — `type`, `sortf`, `flds`, `tmpls`, `css`,
   * `latexPre/Post`. `modelFieldNames` + `modelTemplates` + `modelStyling` need
   * three round trips per note type and still report neither cloze nor sortf.
   */
  findModelsByName: { params: { modelNames: string[] }; result: AnkiConnectModel[] };
  /**
   * For a normal deck this returns the deck-options preset; for a filtered one it
   * returns the deck row itself, with `dyn: 1`. That difference is the only way
   * this API reports a filtered deck, whose cards are on loan and not editable.
   */
  getDeckConfig: { params: { deck: string }; result: { id?: number; dyn?: number } };
  // ----- workbench live commit (ANKI_DECK_WORKBENCH_PLAN.md Phase 6) -----
  /** Whole-row field replacement, keyed by field NAME. Errors when the note is open in Anki's editor. */
  updateNoteFields: {
    params: { note: { id: number; fields: Record<string, string> } };
    result: null;
  };
  /**
   * Tags are committed as a diff rather than through `updateNoteTags`, which
   * replaces the whole string: the draft carries `marked` as a flag, so a
   * replacement would drop it. See `shared/ankiConnectCommit.ts`.
   */
  addTags: { params: { notes: number[]; tags: string }; result: null };
  removeTags: { params: { notes: number[]; tags: string }; result: null };
  /**
   * The only AnkiConnect route to a card's raw `due` column — `setDueDate` takes
   * days-from-now and rewrites `type`/`queue`, which cannot express a new card's
   * queue position. `warning_check` is the add-on's own acknowledgement that the
   * caller is writing a scheduler column directly; the workbench refuses cards in
   * filtered decks before it gets here.
   */
  setSpecificValueOfCard: {
    params: { card: number; keys: string[]; newValues: string[]; warning_check?: boolean };
    result: boolean[];
  };
  /** The profile the write landed in, echoed back into the commit result. */
  getActiveProfile: { params: undefined; result: string };
}

// ----- Timeout tiers ---------------------------------------------------------

/** FAST: version / deckNames / modelNames / modelFieldNames. */
export const FAST_TIMEOUT_MS = 5000;
/** MUTATE: addNote / canAddNotes / createModel / createDeck. */
export const MUTATE_TIMEOUT_MS = 8000;
/** BULK: findNotes / notesInfo / cardsInfo — per chunk. */
export const BULK_TIMEOUT_MS = 20000;

const DEFAULT_TIMEOUTS: Record<keyof AnkiActionMap, number> = {
  version: FAST_TIMEOUT_MS,
  deckNames: FAST_TIMEOUT_MS,
  modelNames: FAST_TIMEOUT_MS,
  modelFieldNames: FAST_TIMEOUT_MS,
  createDeck: MUTATE_TIMEOUT_MS,
  createModel: MUTATE_TIMEOUT_MS,
  addNote: MUTATE_TIMEOUT_MS,
  canAddNotes: MUTATE_TIMEOUT_MS,
  deleteNotes: MUTATE_TIMEOUT_MS,
  deleteMediaFile: MUTATE_TIMEOUT_MS,
  storeMediaFile: MUTATE_TIMEOUT_MS,
  findNotes: BULK_TIMEOUT_MS,
  findCards: BULK_TIMEOUT_MS,
  notesInfo: BULK_TIMEOUT_MS,
  cardsInfo: BULK_TIMEOUT_MS,
  deckNamesAndIds: FAST_TIMEOUT_MS,
  getDeckConfig: FAST_TIMEOUT_MS,
  updateNoteFields: MUTATE_TIMEOUT_MS,
  addTags: MUTATE_TIMEOUT_MS,
  removeTags: MUTATE_TIMEOUT_MS,
  setSpecificValueOfCard: MUTATE_TIMEOUT_MS,
  getActiveProfile: FAST_TIMEOUT_MS,
  // BULK: a model row carries every template's full HTML, so a collection with
  // dozens of note types answers slower than any other read-only action.
  findModelsByName: BULK_TIMEOUT_MS,
};

// ----- Error taxonomy --------------------------------------------------------

export type AnkiErrorKind =
  | 'transport' // fetch failed / ECONNREFUSED: Anki or add-on absent
  | 'timeout' // AbortSignal fired (folded into transport for UI purposes)
  | 'collection' // AnkiConnect up but collection not loaded
  | 'api' // HTTP 200 but body.error set (bad deck, bad model, collection locked)
  | 'duplicate'; // api error matching /duplicate/i, split out for callers

export class AnkiError extends Error {
  readonly kind: AnkiErrorKind;
  readonly action: keyof AnkiActionMap;

  constructor(kind: AnkiErrorKind, action: keyof AnkiActionMap, message: string) {
    super(message);
    this.name = 'AnkiError';
    this.kind = kind;
    this.action = action;
  }
}

export function isUnreachable(err: unknown): boolean {
  return err instanceof AnkiError && (err.kind === 'transport' || err.kind === 'timeout');
}

export function isCollectionUnavailable(err: unknown): boolean {
  return err instanceof AnkiError && err.kind === 'collection';
}

/**
 * The section 5.2 mapping rule, applied at every IPC boundary:
 * transport|timeout -> ANKI_UNREACHABLE_MSG, duplicate -> the literal
 * 'duplicate' (existing views branch on it), api -> verbatim message.
 */
export function toUiError(err: unknown): string {
  if (err instanceof AnkiError) {
    if (err.kind === 'duplicate') return 'duplicate';
    if (err.kind === 'collection') return ANKI_COLLECTION_UNAVAILABLE_MSG;
    if (err.kind === 'api') return err.message;
    return ANKI_UNREACHABLE_MSG;
  }
  return err instanceof Error ? err.message : String(err);
}

function classifyApiError(msg: string): AnkiErrorKind {
  if (/duplicate/i.test(msg)) return 'duplicate';
  if (
    /collection is not available|collection not available|collection was not available|CollectionNotAvailable|DBError|media currently syncing|already open in another/i.test(
      msg,
    )
  ) {
    return 'collection';
  }
  return 'api';
}

// ----- Endpoint --------------------------------------------------------------

let urlProvider: () => string = () => DEFAULT_ANKI_URL;

/** Wired by anki/index.ts to the ProfileStore's shared ankiUrl. */
export function setAnkiUrlProvider(provider: () => string): void {
  urlProvider = provider;
}

// ----- Out-of-band failure signal (heartbeat H8) ------------------------------

const transportFailureListeners = new Set<() => void>();

/**
 * Fires whenever any client call fails with a transport/timeout-kind error
 * (except caller-initiated aborts and quiet probe calls). The heartbeat
 * subscribes so ordinary traffic fast-paths its failure transitions.
 */
export function onTransportFailure(cb: () => void): () => void {
  transportFailureListeners.add(cb);
  return () => transportFailureListeners.delete(cb);
}

function notifyTransportFailure(): void {
  for (const cb of Array.from(transportFailureListeners)) {
    try {
      cb();
    } catch (err) {
      console.error('[anki] transport-failure listener threw:', err);
    }
  }
}

// ----- invoke ----------------------------------------------------------------

export interface InvokeOpts {
  timeoutMs?: number;
  /** Caller-owned cancellation (interval poller epoch aborts). Not counted as a connectivity failure. */
  signal?: AbortSignal;
  /** Suppress the transport-failure signal — used by the heartbeat's own probes, which report through the FSM instead. */
  quiet?: boolean;
}

export async function invoke<A extends keyof AnkiActionMap>(
  action: A,
  params: AnkiActionMap[A]['params'],
  opts?: InvokeOpts,
): Promise<AnkiActionMap[A]['result']> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUTS[action];
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onOuterAbort = (): void => ctrl.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  let body: { result?: unknown; error?: unknown } | undefined;
  try {
    const res = await fetch(urlProvider(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: 6, params: params ?? {} }),
      signal: ctrl.signal,
    });
    body = (await res.json()) as { result?: unknown; error?: unknown };
  } catch (err) {
    const callerAborted = Boolean(opts?.signal?.aborted) && !timedOut;
    if (!callerAborted && !opts?.quiet) notifyTransportFailure();
    const detail = err instanceof Error ? err.message : String(err);
    throw new AnkiError(
      timedOut || callerAborted ? 'timeout' : 'transport',
      action,
      callerAborted ? 'aborted by caller' : detail,
    );
  } finally {
    clearTimeout(timer);
    if (opts?.signal) opts.signal.removeEventListener('abort', onOuterAbort);
  }

  if (body && body.error != null) {
    const msg = String(body.error);
    throw new AnkiError(classifyApiError(msg), action, msg);
  }
  return (body ? body.result : undefined) as AnkiActionMap[A]['result'];
}
