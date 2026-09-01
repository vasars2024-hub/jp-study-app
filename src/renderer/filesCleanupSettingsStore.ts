/**
 * Gates 32-35 — where the cleanup settings live.
 *
 * Same renderer-localStorage shape as the ingest settings beside it, through
 * `filesDocStore`, and for the same reason: they are user preferences that a
 * main-process operation needs, so the document is renderer-owned and every
 * plan/run call carries the current value. Main re-normalizes what it receives
 * (`main/filesApp/cleanupIpc.ts`), so a corrupted document over here cannot
 * switch on the class that reaches five gigabytes of video.
 */
import {
  DEFAULT_CLEANUP_SETTINGS,
  FILES_BROKEN_LINK_POLICIES,
  FILES_CLEANUP_CLASS_IDS,
  normalizeCleanupSettings,
  type FilesBrokenLinkPolicy,
  type FilesCleanupClassId,
  type FilesCleanupSettings,
} from '../shared/filesApp/cleanup';
import { createFilesDocStore, type FilesDocCommit } from './filesDocStore';

export const FILES_CLEANUP_SETTINGS_STORAGE_KEY = 'jp-files-cleanup-settings-v1';
export const FILES_CLEANUP_SETTINGS_CHANGED_EVENT = 'filesapp:cleanup-settings-changed';

const store = createFilesDocStore<FilesCleanupSettings>({
  storageKey: FILES_CLEANUP_SETTINGS_STORAGE_KEY,
  changedEvent: FILES_CLEANUP_SETTINGS_CHANGED_EVENT,
  parse: normalizeCleanupSettings,
  empty: DEFAULT_CLEANUP_SETTINGS,
  saveFailedKey: 'filesApp.settings.error.saveFailed',
});

export type CleanupSettingsCommit = FilesDocCommit<FilesCleanupSettings>;

export function loadCleanupSettings(): FilesCleanupSettings {
  return store.load();
}

export function commitCleanupClassEnabled(
  classId: FilesCleanupClassId,
  enabled: boolean,
): CleanupSettingsCommit {
  return store.commit((doc) => {
    if (!FILES_CLEANUP_CLASS_IDS.includes(classId)) {
      return { doc, errorKey: 'filesApp.cleanup.error.unknownClass' };
    }
    // Kept in declaration order rather than click order, so the report's class
    // rows do not reshuffle every time a checkbox is toggled.
    const next = FILES_CLEANUP_CLASS_IDS.filter((id) =>
      id === classId ? enabled : doc.enabledClasses.includes(id),
    );
    return { doc: { ...doc, enabledClasses: next } };
  });
}

export function commitBrokenLinkPolicy(policy: FilesBrokenLinkPolicy): CleanupSettingsCommit {
  return store.commit((doc) => {
    if (!FILES_BROKEN_LINK_POLICIES.includes(policy)) {
      return { doc, errorKey: 'filesApp.cleanup.error.unknownPolicy' };
    }
    return { doc: { ...doc, brokenLinkPolicy: policy } };
  });
}

export function onCleanupSettingsChanged(listener: () => void): () => void {
  return store.onChanged(listener);
}

/** Test seam — see the ingest store's note; a cleared localStorage is not enough. */
export function resetCleanupSettingsMemoryForTests(): void {
  store.resetMemoryForTests();
}
