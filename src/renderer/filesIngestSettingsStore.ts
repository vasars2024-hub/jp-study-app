/**
 * Gates 31 and 36 — where the ingest settings live.
 *
 * The same renderer-localStorage shape as gates 16, 18, 19 and 22, through the
 * shared `filesDocStore`; see that module's header for why renderer and not
 * main, and why a failed write reports itself rather than passing silently.
 *
 * **The window is sent to main, it does not live there.** `stabilityMs` is a
 * user preference that the scan needs, so the document is renderer-owned and
 * every `filesScan` call carries the current value. Main re-normalises what it
 * receives rather than trusting it (`main/filesApp/ipc.ts`), so a corrupted
 * document cannot turn the completeness check off from over here.
 *
 * **Refusals and failed saves stay distinct.** A value out of range is the
 * model refusing (`errorKey`); a value the model accepted that `localStorage`
 * would not take is `storageErrorKey`. The user's next move differs: retype
 * versus nothing they can do, and a settings panel that showed one message for
 * both would tell half of them to retype a number that was fine.
 */
import {
  DEFAULT_INGEST_SETTINGS,
  normalizeIngestSettings,
  setIngestCategoryPolicy,
  setIngestConfidence,
  setIngestStabilityMs,
  type IngestCategoryPolicy,
  type IngestConfidencePolicy,
  type IngestSettings,
  type IngestSettingsResult,
} from '../shared/filesApp/ingest';
import type { DropTargetId } from '../shared/fileRouting';
import { createFilesDocStore, type FilesDocCommit } from './filesDocStore';

export const FILES_INGEST_SETTINGS_STORAGE_KEY = 'jp-files-ingest-settings-v1';
export const FILES_INGEST_SETTINGS_CHANGED_EVENT = 'filesapp:ingest-settings-changed';

const store = createFilesDocStore<IngestSettings>({
  storageKey: FILES_INGEST_SETTINGS_STORAGE_KEY,
  changedEvent: FILES_INGEST_SETTINGS_CHANGED_EVENT,
  parse: normalizeIngestSettings,
  empty: DEFAULT_INGEST_SETTINGS,
  saveFailedKey: 'filesApp.settings.error.saveFailed',
});

export type IngestSettingsCommit = FilesDocCommit<IngestSettings>;

export function loadIngestSettings(): IngestSettings {
  return store.load();
}

function commit(
  operation: (doc: IngestSettings) => IngestSettingsResult,
): IngestSettingsCommit {
  return store.commit(operation);
}

export function commitIngestConfidence(policy: IngestConfidencePolicy): IngestSettingsCommit {
  return commit((doc) => setIngestConfidence(doc, policy));
}

export function commitIngestCategoryPolicy(
  target: DropTargetId,
  policy: IngestCategoryPolicy,
): IngestSettingsCommit {
  return commit((doc) => setIngestCategoryPolicy(doc, target, policy));
}

export function commitIngestStabilityMs(value: number): IngestSettingsCommit {
  return commit((doc) => setIngestStabilityMs(doc, value));
}

export function onIngestSettingsChanged(listener: () => void): () => void {
  return store.onChanged(listener);
}

/**
 * Test seam. `localStorage.clear()` alone does NOT isolate a suite: the store
 * keeps an in-module fallback so a quota error degrades to "forgotten on
 * restart" rather than to "the setting stops working", and that fallback
 * survives a cleared localStorage.
 */
export function resetIngestSettingsMemoryForTests(): void {
  store.resetMemoryForTests();
}
