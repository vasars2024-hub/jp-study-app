/** Stable contract for long-running dictionary imports.
 *
 * The worker/main bridge owns execution; this module only describes the
 * observable state so renderer recovery cannot infer success from progress.
 */
export type DictionaryImportKind = 'cedict' | 'wiktextract' | 'dsl' | 'jmnedict' | 'kanjidic' | 'stardict' | 'tatoeba' | 'legacy';

export type DictionaryImportTerminal =
  | { state: 'committed'; counts: Record<string, number> }
  | { state: 'cancelled'; counts: Record<string, number> }
  | { state: 'failed'; error: string };

export interface DictionaryImportProgress {
  jobId: string;
  kind: DictionaryImportKind;
  lines: number;
  /** A bounded human-readable phase; consumers must not treat it as terminal. */
  phase: 'reading' | 'importing' | 'committing';
}

export interface DictionaryImportJobSnapshot {
  jobId: string;
  kind: DictionaryImportKind;
  status: 'running' | DictionaryImportTerminal['state'];
  progress?: DictionaryImportProgress;
  terminal?: DictionaryImportTerminal;
}

const KINDS = new Set<DictionaryImportKind>(['cedict', 'wiktextract', 'dsl', 'jmnedict', 'kanjidic', 'stardict', 'tatoeba', 'legacy']);
const PHASES = new Set<DictionaryImportProgress['phase']>(['reading', 'importing', 'committing']);
const TERMINAL_STATES = new Set<DictionaryImportTerminal['state']>(['committed', 'cancelled', 'failed']);
const JOB_ID_MAX = 128;
const ERROR_MAX = 2_000;
const COUNT_KEY_MAX = 64;
const COUNT_ENTRIES_MAX = 32;

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function boundedText(value: unknown, max: number): value is string {
  return text(value) && value.length <= max;
}

function counts(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= COUNT_ENTRIES_MAX && entries
    .every(([key, entry]) => boundedText(key, COUNT_KEY_MAX)
      && typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 0);
}

/**
 * Validate untrusted worker/IPC data before a renderer treats it as state.
 * Invalid snapshots are rejected rather than being rendered as a false success.
 */
export function normalizeDictionaryImportJobSnapshot(value: unknown): DictionaryImportJobSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!boundedText(raw.jobId, JOB_ID_MAX) || !KINDS.has(raw.kind as DictionaryImportKind)) return null;
  if (raw.status !== 'running' && !TERMINAL_STATES.has(raw.status as DictionaryImportTerminal['state'])) return null;
  const snapshot: DictionaryImportJobSnapshot = {
    jobId: raw.jobId,
    kind: raw.kind as DictionaryImportKind,
    status: raw.status as DictionaryImportJobSnapshot['status'],
  };
  if (raw.progress !== undefined) {
    if (!raw.progress || typeof raw.progress !== 'object') return null;
    const progress = raw.progress as Record<string, unknown>;
    if (progress.jobId !== snapshot.jobId || progress.kind !== snapshot.kind
      || !Number.isSafeInteger(progress.lines) || (progress.lines as number) < 0
      || !PHASES.has(progress.phase as DictionaryImportProgress['phase'])) return null;
    snapshot.progress = { jobId: snapshot.jobId, kind: snapshot.kind, lines: progress.lines as number, phase: progress.phase as DictionaryImportProgress['phase'] };
  }
  if (snapshot.status === 'running') return snapshot;
  if (!raw.terminal || typeof raw.terminal !== 'object') return null;
  const terminal = raw.terminal as Record<string, unknown>;
  if (terminal.state !== snapshot.status) return null;
  if (terminal.state === 'failed') {
    if (!boundedText(terminal.error, ERROR_MAX)) return null;
    snapshot.terminal = { state: 'failed', error: terminal.error };
  } else {
    if (!counts(terminal.counts)) return null;
    snapshot.terminal = { state: terminal.state, counts: terminal.counts as Record<string, number> };
  }
  return snapshot;
}

export function isDictionaryImportTerminal(
  snapshot: DictionaryImportJobSnapshot,
): snapshot is DictionaryImportJobSnapshot & { status: DictionaryImportTerminal['state']; terminal: DictionaryImportTerminal } {
  return snapshot.status === 'committed' || snapshot.status === 'cancelled' || snapshot.status === 'failed';
}

// ----- what a caller asks for, and what crosses the worker boundary ----------

/**
 * A request to import one source. `filePath` is required for file importers and
 * meaningless for `legacy`, which reads the whole
 * `userData/yomitan` tree the main process names for it.
 */
export interface DictionaryImportRequest {
  kind: DictionaryImportKind;
  filePath?: string;
  /** Tatoeba's links TSV; required together with its sentence TSV. */
  linksFilePath?: string;
  /** Overrides the importer's own default dictionary id. Bounded like `jobId`. */
  dictId?: string;
}

const PATH_MAX = 4_096;

/**
 * Validate a renderer-supplied request before the main process spawns anything.
 *
 * Returns `null` rather than a corrected request: an import that silently ran
 * against a different source than the one asked for is worse than a refusal.
 */
export function normalizeDictionaryImportRequest(value: unknown): DictionaryImportRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!KINDS.has(raw.kind as DictionaryImportKind)) return null;
  const kind = raw.kind as DictionaryImportKind;
  const request: DictionaryImportRequest = { kind };
  if (kind === 'legacy') {
    // A path would be ignored; accepting one would imply it was honoured.
    if (raw.filePath !== undefined || raw.linksFilePath !== undefined) return null;
  } else {
    if (!boundedText(raw.filePath, PATH_MAX)) return null;
    request.filePath = raw.filePath;
    if (kind === 'tatoeba') {
      if (!boundedText(raw.linksFilePath, PATH_MAX)) return null;
      request.linksFilePath = raw.linksFilePath;
    } else if (raw.linksFilePath !== undefined) return null;
  }
  if (raw.dictId !== undefined) {
    if (!boundedText(raw.dictId, JOB_ID_MAX)) return null;
    request.dictId = raw.dictId;
  }
  return request;
}

/** Main -> worker. The worker serves exactly one job and then exits. */
export type DictionaryImportWorkerIn =
  | { type: 'start'; jobId: string; request: DictionaryImportRequest; dbDir: string; legacyRoot: string }
  | { type: 'cancel' };

/** Worker -> main. Anything else on the channel is dropped, not guessed at. */
export type DictionaryImportWorkerOut =
  | { type: 'progress'; progress: DictionaryImportProgress }
  | { type: 'terminal'; jobId: string; kind: DictionaryImportKind; terminal: DictionaryImportTerminal };
