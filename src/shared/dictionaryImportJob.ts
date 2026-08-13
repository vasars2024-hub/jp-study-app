/** Stable contract for long-running dictionary imports.
 *
 * The worker/main bridge owns execution; this module only describes the
 * observable state so renderer recovery cannot infer success from progress.
 */
export type DictionaryImportKind = 'cedict' | 'wiktextract' | 'legacy';

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

export function isDictionaryImportTerminal(
  snapshot: DictionaryImportJobSnapshot,
): snapshot is DictionaryImportJobSnapshot & { status: DictionaryImportTerminal['state']; terminal: DictionaryImportTerminal } {
  return snapshot.status === 'committed' || snapshot.status === 'cancelled' || snapshot.status === 'failed';
}
