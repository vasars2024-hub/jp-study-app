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
}

export type LocalDeckApkgWorkerResponse =
  | { kind: 'accepted'; id: string }
  | { kind: 'complete'; id: string; outputPath: string; notes: number; media: number }
  | { kind: 'error'; id: string; error: string };
