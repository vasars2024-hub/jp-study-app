/**
 * Messages for the whole-deck .apkg jobs that run in the deck utility process
 * (`main/anki/apkgReadWorker.ts`) beside the workbench's paged draft read:
 * import as cards, read a word list for the Level Meter, and export.
 *
 * A job message carries `op`; the draft read's message never does, which is
 * how the worker tells them apart without changing the draft protocol.
 */
import type { ApkgExportRequest } from './ankiApkgExport';

export type ApkgJobIn =
  | { op: 'cards'; filePath: string; mediaDir?: string }
  | { op: 'words'; filePath: string }
  | { op: 'export'; sourcePath: string; outPath: string; request: ApkgExportRequest };

export interface ApkgJobProgress {
  phase: 'progress';
  stage: string;
  done: number;
  total: number;
}

export type ApkgJobOut =
  | { phase: 'accepted' }
  | ApkgJobProgress
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export function isApkgJob(message: unknown): message is ApkgJobIn {
  const op = (message as { op?: unknown } | null)?.op;
  return op === 'cards' || op === 'words' || op === 'export';
}

/** Progress pushed to the renderer while an import runs (`apkg:importProgress`). */
export interface ApkgImportProgressEvent {
  filePath: string;
  stage: string;
  done: number;
  total: number;
}
