export interface LocalDeckApkgMedia {
  fileName: string;
  filePath: string;
}

export interface LocalDeckApkgRequest {
  kind: 'write';
  id: string;
  outputPath: string;
  deckName: string;
  /** Header first, followed by card rows in the shared deck-export order. */
  rows: string[][];
  media: LocalDeckApkgMedia[];
  nowMs: number;
  /**
   * Per card row (aligned with `rows.slice(1)`): its local schedule, written as
   * Anki scheduling columns so the package imports reviewed cards as reviewed.
   * Absent or null entries export as new cards — the format before this existed.
   */
  schedules?: Array<LocalDeckApkgSchedule | null>;
}

export interface LocalDeckApkgSchedule {
  srs?: import('./localSrs').LocalSrsState;
  suspended?: boolean;
}

export type LocalDeckApkgWorkerResponse =
  | { kind: 'accepted'; id: string }
  | { kind: 'complete'; id: string; outputPath: string; notes: number; media: number; scheduled?: number }
  | { kind: 'error'; id: string; error: string };
