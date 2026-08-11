/**
 * Where does a dropped file belong?
 *
 * Before this module, dropping a file on the desktop understood exactly two
 * things — books and A/V — and everything else was silently discarded. Each
 * other subsystem the app can feed (decks, dictionaries, subtitles, VN scripts,
 * wallpapers, shortcuts, backups) had an importer, but you had to already know
 * which one and go find it.
 *
 * This is the pure half: extension and filename in, ranked candidates out. It
 * has no filesystem access on purpose, so the whole table is unit-testable and
 * the ambiguous cases are visible rather than buried in an if-chain. The
 * side-effecting half — stat, content sniffing, dispatch, undo — is
 * `main/fileRouter.ts`.
 */
import {
  ARCHIVE_EXT,
  AUDIO_EXT,
  BOOK_EXT,
  IMAGE_EXT,
  SUBTITLE_EXT,
  VIDEO_EXT,
  WALL_EXT,
  extOf,
} from './mediaKind';

export type DropTargetId =
  | 'library-book'
  | 'library-manga'
  | 'media'
  | 'subtitle'
  | 'wallpaper'
  | 'anki-level'
  | 'anki-cards'
  | 'deck-csv'
  | 'dictionary-yomitan'
  | 'frequency-dict'
  | 'vn-script'
  | 'shortcut'
  | 'backup'
  | 'folder'
  | 'unknown';

/**
 * `exact`     — one destination, route without asking.
 * `likely`    — best guess, route but say what was assumed in the toast.
 * `ambiguous` — genuinely two or more valid homes; ask.
 */
export type DropConfidence = 'exact' | 'likely' | 'ambiguous';

export interface DropCandidate {
  target: DropTargetId;
  confidence: DropConfidence;
  /** i18n key, never English text — this string reaches the UI. */
  reasonKey: string;
}

/** i18n key for a target's human name, used by the triage sheet and toasts. */
export function targetLabelKey(target: DropTargetId): string {
  return `fileDrop.target.${target}`;
}

const SHORTCUT_EXT = new Set(['.lnk', '.url', '.desktop']);
const DECK_TEXT_EXT = new Set(['.csv', '.tsv']);
const VN_SCRIPT_EXT = new Set(['.ks', '.scn', '.rpy']);

function candidate(
  target: DropTargetId,
  confidence: DropConfidence,
  reasonKey: string,
): DropCandidate {
  return { target, confidence, reasonKey };
}

/**
 * Ranked destinations for one path, most likely first.
 *
 * Never returns an empty array — an unrecognised file yields a single
 * `unknown` candidate so the caller always has something to show the user.
 * Silent discard is what this module exists to remove.
 */
export function classifyByExtension(filePath: string): DropCandidate[] {
  const ext = extOf(filePath);
  const name = (filePath.replace(/\\/g, '/').split('/').pop() ?? filePath).toLowerCase();

  if (!ext) return [candidate('unknown', 'ambiguous', 'fileDrop.reason.noExtension')];

  if (SUBTITLE_EXT.has(ext)) {
    return [candidate('subtitle', 'exact', 'fileDrop.reason.subtitle')];
  }

  if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext)) {
    return [candidate('media', 'exact', 'fileDrop.reason.media')];
  }

  if (ext === '.epub' || ext === '.pdf') {
    return [candidate('library-book', 'exact', 'fileDrop.reason.book')];
  }

  if (SHORTCUT_EXT.has(ext)) {
    return [candidate('shortcut', 'exact', 'fileDrop.reason.shortcut')];
  }

  if (ext === '.apkg') {
    /*
     * Deliberately two candidates, and now both are real.
     *
     * An .apkg genuinely has two honest homes: measure the user's level from the
     * words in it, or import the notes as reviewable cards. Neither is a safe
     * silent default — routing to the level meter alone looks like an import
     * that dropped every card, and importing hundreds of cards unasked is worse.
     *
     * Card import leads: dropping a deck on the desktop most often means "add
     * this deck", and the level check is the specialised reading.
     */
    return [
      candidate('anki-cards', 'likely', 'fileDrop.reason.apkgCards'),
      candidate('anki-level', 'ambiguous', 'fileDrop.reason.apkgLevel'),
    ];
  }

  if (DECK_TEXT_EXT.has(ext)) {
    return [candidate('deck-csv', 'likely', 'fileDrop.reason.deckTable')];
  }

  if (ARCHIVE_EXT.has(ext)) {
    if (ext === '.cbz') return [candidate('library-manga', 'exact', 'fileDrop.reason.cbz')];
    // A .zip is a manga volume or a Yomitan dictionary, and nothing in the name
    // reliably says which. `main/fileRouter.ts` sniffs the archive index; until
    // it has, both are live.
    return [
      candidate('dictionary-yomitan', 'ambiguous', 'fileDrop.reason.zipDict'),
      candidate('library-manga', 'ambiguous', 'fileDrop.reason.zipManga'),
    ];
  }

  if (IMAGE_EXT.has(ext)) {
    const wallpaperCapable = WALL_EXT.includes(ext);
    // A bare image is a wallpaper or a manga page. Always ask — guessing here
    // either replaces the user's desktop or buries a page in the library.
    const out = [candidate('library-manga', 'ambiguous', 'fileDrop.reason.imagePage')];
    if (wallpaperCapable) {
      out.unshift(candidate('wallpaper', 'ambiguous', 'fileDrop.reason.imageWallpaper'));
    }
    return out;
  }

  if (VN_SCRIPT_EXT.has(ext)) {
    return [candidate('vn-script', 'likely', 'fileDrop.reason.vnScript')];
  }

  if (ext === '.json') {
    // Three JSON consumers with no shared marker in the filename. The router
    // reads the top-level keys; this ranking is what it falls back to.
    return [
      candidate('backup', 'ambiguous', 'fileDrop.reason.jsonBackup'),
      candidate('frequency-dict', 'ambiguous', 'fileDrop.reason.jsonFrequency'),
      candidate('vn-script', 'ambiguous', 'fileDrop.reason.jsonVn'),
    ];
  }

  if (BOOK_EXT.has(ext)) {
    // .txt / .html reach the reader, but a .txt is also a plausible VN script
    // dump, so this is a best guess rather than a certainty.
    return [
      candidate('library-book', 'likely', 'fileDrop.reason.textBook'),
      candidate('vn-script', 'ambiguous', 'fileDrop.reason.textVn'),
    ];
  }

  if (name.endsWith('.zip.part') || name.endsWith('.crdownload') || name.endsWith('.tmp')) {
    return [candidate('unknown', 'exact', 'fileDrop.reason.partialDownload')];
  }

  return [candidate('unknown', 'ambiguous', 'fileDrop.reason.unrecognised')];
}

/** Candidates for a directory. Directories were entirely unhandled before. */
export function classifyDirectory(dirPath: string): DropCandidate[] {
  const name = (dirPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '').toLowerCase();
  if (/\b(wallpaper|wallpapers|backgrounds)\b/.test(name)) {
    return [
      candidate('wallpaper', 'likely', 'fileDrop.reason.folderWallpaper'),
      candidate('folder', 'ambiguous', 'fileDrop.reason.folderScan'),
    ];
  }
  return [candidate('folder', 'likely', 'fileDrop.reason.folderScan')];
}

/** The destination a plan takes when the user does not intervene. */
export function preferredTarget(candidates: readonly DropCandidate[]): DropCandidate {
  return candidates[0] ?? candidate('unknown', 'ambiguous', 'fileDrop.reason.unrecognised');
}

/** True when the drop must not proceed without the user choosing. */
export function needsTriage(candidates: readonly DropCandidate[]): boolean {
  const first = preferredTarget(candidates);
  return first.confidence === 'ambiguous' || first.target === 'unknown';
}
