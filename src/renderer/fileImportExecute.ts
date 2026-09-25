/**
 * The one importer. Extracted from `components/DropRouter.tsx` so the Files
 * app's scan-and-review sheet can import through exactly the same calls a drop
 * does.
 *
 * **Why extract rather than write a second one.** The plan's rule for
 * classification is "one classifier, never a second opinion" — `scan.ts` reuses
 * the drop router's `preferredTarget`/`needsTriage` verbatim for that reason. A
 * second *importer* would be the same defect a step later: a file could scan
 * into a destination, be confirmed, and land through a code path the drop
 * router never took, with its own undo and its own set of bugs. So the dispatch
 * table lives here and has exactly one copy.
 *
 * **Still renderer-side.** Every importer this calls (`library:importPaths`,
 * `media:addPaths`, `dict:importYomitan`, `apkg:import`,
 * `mining:importFrequencyDict`, `desktop:setWallpaperFromPath`) is an
 * `ipcMain.handle` with no exported function behind it, and the flashcard deck
 * is renderer-owned localStorage. See the note at the top of
 * `main/fileRouter.ts`; moving this to main would mean refactoring six modules.
 *
 * **Refusals are named, never null.** `onRefused` receives an i18n key and the
 * subject. A caller that ignores it gets `null` back and knows nothing landed;
 * a caller that honours it can say which file and why. Silent discard is the
 * behaviour this whole router exists to remove.
 */
import type { DropTargetId } from '../shared/fileRouting';
import type { SubtitleAttachRefusal } from '../shared/subtitleDiscoveryIpc';
import type { MediaItem } from '../shared/types';
import { apkgImportNotice, importApkgCards, importApkgToLevel } from './apkgImport';
import { removeDeckCards } from './flashcardDeck';
import { flushLevelListsPersistence, removeLevelList, upsertSlotList, type LevelList } from './levelLists';
import type { LevelSlotId } from '../shared/levelScale';

/** The minimum a plan needs to be importable. `DropPlan` satisfies it. */
export interface ImportSubject {
  path: string;
  name: string;
  isDirectory: boolean;
}

/** Everything needed to reverse one import. */
export interface ImportReceipt {
  targetId: DropTargetId;
  /** Library/media ids created by the import, for removal. */
  libraryIds: string[];
  mediaIds: string[];
  /** Wallpaper: the path that was in place before. */
  previousWallpaper?: string | null;
  /** Flashcards created by an .apkg card import, for exact removal on undo. */
  deckCardIds?: string[];
  /** Level-check drop: the slot it filled and the list it replaced, for undo. */
  levelSlot?: { slot: LevelSlotId; previous?: LevelList; createdId?: string };
  /** What the import could not bring across, for the success message. */
  notice?: string;
}

export interface ImportHooks {
  /** Focus the app that just received the file. */
  onOpenSection?: (section: string) => void;
  /** An i18n key plus the file it is about. Called instead of returning a receipt. */
  onRefused?: (reasonKey: string, subject: ImportSubject) => void;
  /**
   * A single video file landed in the media library: play it. Opt-in (the drop router
   * sets it for a one-file drop) — a batch import must never start playing things.
   */
  onPlayMedia?: (item: MediaItem) => void;
}

export const IMPORT_REFUSE_FAILED = 'fileDrop.toast.failed';
export const IMPORT_REFUSE_NO_DESTINATION = 'fileDrop.toast.noDestination';
export const IMPORT_REFUSE_EMPTY_FOLDER = 'fileDrop.toast.emptyFolder';
export const IMPORT_REFUSE_LEVEL_UNKNOWN = 'fileDrop.toast.levelNoSlot';

/**
 * A subtitle attach refusal, as the key the toast can actually translate.
 *
 * `attachSubtitleFile` in main refuses five distinct ways and writes a sentence
 * for each — but `onRefused` carries an i18n KEY, not prose, so all five arrived
 * here as "Could not import {name}." The user was told the drop failed and never
 * that the fix is to add the video first, which is the one refusal they can act
 * on and by far the most common.
 *
 * Unknown or absent reasons fall back to the generic key rather than throwing:
 * main is free to add a code before the renderer knows it, and an untranslated
 * toast is a worse failure than a vague one.
 */
export function subtitleRefusalKey(reason: SubtitleAttachRefusal | undefined): string {
  switch (reason) {
    case 'no-owner': return 'fileDrop.toast.subtitleNoOwner';
    case 'duplicate': return 'fileDrop.toast.subtitleDuplicate';
    case 'no-language': return 'fileDrop.toast.subtitleNoLanguage';
    case 'unreadable-format': return 'fileDrop.toast.subtitleUnreadable';
    case 'missing-file': return 'fileDrop.toast.subtitleMissing';
    default: return IMPORT_REFUSE_FAILED;
  }
}

/**
 * Import one subject into one destination.
 *
 * Returns the receipt that reverses it, or `null` when nothing landed — and in
 * the `null` case `onRefused` has already been given the reason.
 */
export async function executeImport(
  subject: ImportSubject,
  target: DropTargetId,
  hooks: ImportHooks = {},
): Promise<ImportReceipt | null> {
  const refuse = (reasonKey: string): null => {
    hooks.onRefused?.(reasonKey, subject);
    return null;
  };

  switch (target) {
    case 'library-book':
    case 'library-manga': {
      const paths = subject.isDirectory
        ? await window.api.fileDropFolderFiles(subject.path)
        : [subject.path];
      if (!paths.length) return refuse(IMPORT_REFUSE_EMPTY_FOLDER);
      const items = await window.api.importPaths(paths);
      hooks.onOpenSection?.('library');
      return {
        targetId: target,
        libraryIds: (items ?? []).map((i) => i.id),
        mediaIds: [],
      };
    }
    case 'media': {
      const paths = subject.isDirectory
        ? await window.api.fileDropFolderFiles(subject.path)
        : [subject.path];
      if (!paths.length) return refuse(IMPORT_REFUSE_EMPTY_FOLDER);
      const items = await window.api.addMediaPaths(paths);
      hooks.onOpenSection?.('player');
      // "→ Media player" used to add the file and leave the library open on the grid.
      const added = items ?? [];
      if (!subject.isDirectory && added.length === 1 && added[0].kind === 'video') hooks.onPlayMedia?.(added[0]);
      return {
        targetId: target,
        libraryIds: [],
        mediaIds: (items ?? []).map((i) => i.id),
      };
    }
    case 'wallpaper': {
      const previous = await window.api.getWallpaper().catch(() => null);
      await window.api.setWallpaperFromPath(subject.path);
      return { targetId: target, libraryIds: [], mediaIds: [], previousWallpaper: previous };
    }
    case 'anki-level': {
      // The Level page's own upload flow, then the meter. This used to call
      // `importApkg` and throw the words away, reporting success.
      const res = await importApkgToLevel(subject.path, subject.name);
      if (!res.ok || !res.slot) {
        return refuse(res.error === 'level-slot-unknown' ? IMPORT_REFUSE_LEVEL_UNKNOWN : IMPORT_REFUSE_FAILED);
      }
      hooks.onOpenSection?.('stats');
      return {
        targetId: target,
        libraryIds: [],
        mediaIds: [],
        levelSlot: { slot: res.slot.id, previous: res.previous, createdId: res.previous ? undefined : `ll-${res.slot.id}` },
      };
    }
    case 'anki-cards': {
      const res = await importApkgCards(subject.path);
      if (!res.ok) throw new Error(res.error ?? 'apkg-card-import-failed');
      hooks.onOpenSection?.('flashcards');
      const notice = apkgImportNotice(res);
      // Undo removes exactly the rows this import created, by id — the deck is
      // shared with every other card source, so removing "the last N" or the
      // whole deck group would take the user's own cards with it.
      return {
        targetId: target,
        libraryIds: [],
        mediaIds: [],
        deckCardIds: (res.added ?? []).map((c) => c.id),
        ...(notice ? { notice } : {}),
      };
    }
    case 'dictionary-yomitan': {
      const res = await window.api.dictImportYomitan(subject.path);
      if (!res?.ok) return refuse(IMPORT_REFUSE_FAILED);
      hooks.onOpenSection?.('dictionary');
      return { targetId: target, libraryIds: [], mediaIds: [] };
    }
    case 'frequency-dict': {
      const res = await window.api.miningImportFrequencyDict(subject.path);
      if (!res?.ok) return refuse(IMPORT_REFUSE_FAILED);
      return { targetId: target, libraryIds: [], mediaIds: [] };
    }
    case 'subtitle': {
      /*
        This used to dispatch a `media:attach-subtitle` CustomEvent, with a
        comment claiming "the player owns subtitle attachment". It did not: a
        grep of the whole tree found exactly one reference to that event name,
        the dispatch itself. So every dropped subtitle reported success, opened
        the player, and was discarded — the false success this router exists to
        remove. `subtitleDiscovery:attachFile` is the real route, and it refuses
        by name when no library item sits beside the file.
      */
      const res = await window.api.attachSubtitleFile(subject.path);
      if (!res?.ok) return refuse(subtitleRefusalKey(res?.reason));
      hooks.onOpenSection?.('player');
      return { targetId: target, libraryIds: [], mediaIds: [] };
    }
    case 'shortcut': {
      window.dispatchEvent(
        new CustomEvent('desktop:add-shortcut', {
          detail: { target: subject.path, name: subject.name.replace(/\.[^.]+$/, '') },
        }),
      );
      return { targetId: target, libraryIds: [], mediaIds: [] };
    }
    case 'deck-csv':
    case 'vn-script':
    case 'backup':
    case 'folder':
    case 'unknown':
    default:
      // Named, not silently swallowed. These have no path-in importer yet;
      // saying so is the honest outcome and beats pretending it worked.
      return refuse(IMPORT_REFUSE_NO_DESTINATION);
  }
}

/** Reverse a batch of imports, as far as each one can be reversed. */
export async function undoImports(receipts: readonly ImportReceipt[]): Promise<void> {
  for (const receipt of receipts) {
    try {
      for (const id of receipt.libraryIds) await window.api.removeItem(id);
      for (const id of receipt.mediaIds) await window.api.removeMedia(id);
      if (receipt.targetId === 'wallpaper' && receipt.previousWallpaper) {
        await window.api.setWallpaperFromPath(receipt.previousWallpaper);
      }
      if (receipt.deckCardIds?.length) removeDeckCards(receipt.deckCardIds);
      if (receipt.levelSlot) {
        const { previous, createdId } = receipt.levelSlot;
        if (previous?.slot) upsertSlotList(previous.slot, previous.label, previous.kind, previous.words);
        else if (createdId) removeLevelList(createdId);
        await flushLevelListsPersistence();
      }
    } catch {
      /* a partially-reversible plan still reverses what it can */
    }
  }
}
