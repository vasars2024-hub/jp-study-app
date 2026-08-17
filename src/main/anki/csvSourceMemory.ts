// Fingerprint → source path for CSV/TSV drafts.
//
// Its own module rather than a export on either side, because the reader
// (`csvDraftRead.ts`) populates it and the writer (`csvExport.ts`) consumes it,
// and the writer imports `decodeTextBuffer` from the reader. Putting the memory
// on the writer would close that loop and — worse than the cycle — pull
// `electron` into the reader's import graph, where its tests run in a plain node
// environment with no Electron to mock.
//
// The package exporter keeps the equivalent map inside `apkgExport.ts`; it can,
// because nothing it owns is imported back the other way.

const recentSources = new Map<string, string>();

/** Small on purpose: it exists to survive the minutes between reading a deck and
 *  exporting it, not forever. Oldest entry is evicted first. */
const RECENT_SOURCE_LIMIT = 8;

export function rememberCsvSource(fingerprint: string, filePath: string): void {
  recentSources.delete(fingerprint);
  recentSources.set(fingerprint, filePath);
  while (recentSources.size > RECENT_SOURCE_LIMIT) {
    const oldest = recentSources.keys().next().value;
    if (oldest == null) break;
    recentSources.delete(oldest);
  }
}

export function recallCsvSource(fingerprint: string): string | undefined {
  return recentSources.get(fingerprint);
}

/** Test/probe seam: the map is process-global and a test must not inherit one. */
export function forgetCsvSources(): void {
  recentSources.clear();
}
