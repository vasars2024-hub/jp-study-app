/**
 * Note-type field names, cached per model name.
 *
 * `modelFieldNames` used to be asked fresh by every caller: the mining gateway
 * (three times per mined card), the dictionary's "already in Anki?" marker (once
 * per deck / note-type target per popup render), the link pass and the
 * field-mapping panels. A headless E2E run counted 348 of them in five minutes,
 * most for note types the collection did not have — a failed answer was never
 * remembered, so every re-render asked again.
 *
 * Here the answer is kept per model name, a missing note type included:
 *   - a known note type for `FIELDS_TTL_MS` (the user can add a field in Anki
 *     while Gum runs; the TTL is the safety net, not the main invalidation);
 *   - a missing one ("model was not found") for `MISSING_TTL_MS`, re-thrown
 *     as the same AnkiError without a request;
 *   - concurrent asks for one model share one request.
 *
 * Invalidation: `invalidateModelFieldNames()` on reconnect (the note type may
 * have been edited while Anki was closed), when a profile changes its note type,
 * on an explicit refresh (`{ refresh: true }`), when `createModel` makes the
 * type (primed with the fields it was created with), and whenever ANY action
 * answers "model was not found" (`onAnkiApiError`).
 */
import { AnkiError, invoke, invokeMulti, onAnkiApiError } from './client';

export const FIELDS_TTL_MS = 10 * 60_000;
export const MISSING_TTL_MS = 60_000;

/** AnkiConnect's wording for a note type that does not exist (2.1.x: "model was not found: X"). */
const MODEL_MISSING_RE = /model (?:was )?not found|no such model|model .* does not exist/i;

export function isModelMissingError(err: unknown): boolean {
  return err instanceof AnkiError && err.kind === 'api' && MODEL_MISSING_RE.test(err.message);
}

type Entry =
  | { kind: 'fields'; fields: string[]; at: number }
  | { kind: 'missing'; message: string; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, { gen: number; promise: Promise<string[]> }>();
/** Bumped per model name on invalidation, so a request already in flight cannot re-fill a cleared entry. */
const generations = new Map<string, number>();
let now: () => number = Date.now;
let subscribed = false;

function gen(modelName: string): number {
  return generations.get(modelName) ?? 0;
}

function subscribe(): void {
  if (subscribed) return;
  subscribed = true;
  // Any action naming a note type that is gone (addNote, canAddNotes, …) drops
  // that type's entry; when the message does not say which, drop them all.
  onAnkiApiError((err, params) => {
    if (!MODEL_MISSING_RE.test(err.message)) return;
    const named = modelNameOf(params) ?? /model (?:was )?not found:\s*(.+)$/i.exec(err.message)?.[1]?.trim();
    if (err.action === 'modelFieldNames') return; // recorded as `missing` by the fetch itself
    invalidateModelFieldNames(named || undefined);
  });
}

function modelNameOf(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const p = params as { modelName?: unknown; note?: { modelName?: unknown } };
  if (typeof p.modelName === 'string') return p.modelName;
  if (p.note && typeof p.note.modelName === 'string') return p.note.modelName;
  return undefined;
}

/**
 * The ordered field names of `modelName`. Throws the AnkiError AnkiConnect gave
 * (cached for a missing note type), never an empty list for one that is missing.
 */
export function getModelFieldNames(modelName: string, opts: { refresh?: boolean } = {}): Promise<string[]> {
  subscribe();
  const name = modelName.trim();
  if (opts.refresh) invalidateModelFieldNames(name);
  const hit = cache.get(name);
  if (hit) {
    const age = now() - hit.at;
    if (hit.kind === 'fields' && age < FIELDS_TTL_MS) return Promise.resolve(hit.fields.slice());
    if (hit.kind === 'missing' && age < MISSING_TTL_MS) {
      return Promise.reject(new AnkiError('api', 'modelFieldNames', hit.message));
    }
    cache.delete(name);
  }
  const g = gen(name);
  const pending = inflight.get(name);
  if (pending && pending.gen === g) return pending.promise.then((f) => f.slice());

  const entry: { gen: number; promise: Promise<string[]> } = { gen: g, promise: Promise.resolve([]) };
  entry.promise = (async () => {
    try {
      const fields = (await enqueue(name)).map(String);
      if (gen(name) === g) cache.set(name, { kind: 'fields', fields, at: now() });
      return fields;
    } catch (err) {
      if (isModelMissingError(err) && gen(name) === g) {
        cache.set(name, { kind: 'missing', message: (err as AnkiError).message, at: now() });
      }
      throw err;
    } finally {
      if (inflight.get(name) === entry) inflight.delete(name);
    }
  })();
  inflight.set(name, entry);
  return entry.promise.then((f) => f.slice());
}

// ----- One request for every note type asked in the same turn ----------------
//
// The dictionary's "already in Anki?" marker asks about every deck / note-type
// target a language routes to, all at once (one IPC call per target). Asks that
// arrive before the next macrotask share ONE `multi` request; a lone ask is a
// plain `modelFieldNames`.

interface Queued {
  name: string;
  resolve: (fields: string[]) => void;
  reject: (err: unknown) => void;
}

let queue: Queued[] = [];
let flushScheduled = false;

function enqueue(name: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    queue.push({ name, resolve, reject });
    if (flushScheduled) return;
    flushScheduled = true;
    setImmediate(() => void flush());
  });
}

async function flush(): Promise<void> {
  const batch = queue;
  queue = [];
  flushScheduled = false;
  if (!batch.length) return;
  if (batch.length === 1) {
    const [only] = batch;
    try {
      only.resolve((await invoke('modelFieldNames', { modelName: only.name })) ?? []);
    } catch (err) {
      only.reject(err);
    }
    return;
  }
  try {
    const outcomes = await invokeMulti(batch.map((q) => ({ action: 'modelFieldNames' as const, params: { modelName: q.name } })));
    batch.forEach((q, i) => {
      const outcome = outcomes[i];
      if (outcome.ok) q.resolve(Array.isArray(outcome.result) ? (outcome.result as string[]) : []);
      else q.reject(outcome.error);
    });
  } catch (err) {
    for (const q of batch) q.reject(err);
  }
}

/** The fields a just-created note type has, so the next ask needs no request. */
export function primeModelFieldNames(modelName: string, fields: readonly string[]): void {
  const name = modelName.trim();
  generations.set(name, gen(name) + 1);
  inflight.delete(name);
  cache.set(name, { kind: 'fields', fields: fields.map(String), at: now() });
}

/** Forget one note type's fields, or every note type's (no argument). */
export function invalidateModelFieldNames(modelName?: string): void {
  if (modelName === undefined) {
    for (const name of new Set([...cache.keys(), ...inflight.keys()])) generations.set(name, gen(name) + 1);
    cache.clear();
    inflight.clear();
    return;
  }
  const name = modelName.trim();
  generations.set(name, gen(name) + 1);
  cache.delete(name);
  inflight.delete(name);
}

/** Tests: a clean cache and an injectable clock. */
export function resetModelFieldCacheForTests(clock: () => number = Date.now): void {
  cache.clear();
  inflight.clear();
  generations.clear();
  queue = [];
  flushScheduled = false;
  now = clock;
}
