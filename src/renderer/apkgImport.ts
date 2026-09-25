// Renderer half of the .apkg import (Plan 0.5). The main process unzips and
// reads the SQLite; here we fold every expression to its kuromoji lemma and
// de-duplicate — so a deck with recognition + production cards, or the same
// word in several inflected forms, collapses to one entry (never inflating the
// known-word count). The fold is chunked with yields so a 30k-card deck never
// freezes the UI thread.

import { getTokenizer, tokenizeSync } from './tokenizer';
import { deckLabel, emptyApkgImportReport, type ApkgImportReport } from '../shared/apkgCards';
import { deckBookId, legacyDeckBookId } from '../shared/deckImport';
import { guessLevelSlot, type LevelSlot } from '../shared/levelScale';
import { upsertImportedDeck, type DeckFlashcard } from './flashcardDeck';
import { enrichNewCards } from './flashcardAutoEnrich';
import { flushLevelListsPersistence, getSlotList, upsertSlotList, type LevelList } from './levelLists';
import { getActiveStudyLang } from './levelService';
import { t } from './i18n';

export interface ApkgLemmaResult {
  ok: boolean;
  /** Unique lemmatized words ready for a level list. */
  words?: string[];
  /** Cards scanned in the deck. */
  noteCount?: number;
  /** Unique raw expressions before lemmatization. */
  rawCount?: number;
  fileName?: string;
  error?: string;
}

export interface ApkgCardImportResult {
  ok: boolean;
  /** Cards newly written to the deck (a re-import updates the rest in place). */
  added?: DeckFlashcard[];
  /** Cards already in the deck from an earlier import, updated in place with their review state kept. */
  updated?: number;
  unchanged?: number;
  /** What the package had that did not come across. */
  report?: ApkgImportReport;
  /** Notes scanned in the collection, before empties and duplicates were dropped. */
  noteCount?: number;
  /** Folder the cards were filed under, for the confirmation message. */
  deckName?: string;
  fileName?: string;
  error?: string;
}

/**
 * Import an .apkg as flashcards in the local deck.
 *
 * The sibling of `importApkgWords`, which reads the same file for the Level
 * Meter and keeps only a word list. This one keeps the note: reading, meaning,
 * example sentence and tags; the first card's Anki schedule, converted into
 * the local SRS; and the first cited audio and image, stored as managed media.
 * What cannot come across is counted in `report` (see `apkgImportNotice`).
 *
 * Cards are filed under the Anki deck's own name, and a re-import of the same
 * deck is an UPSERT (`upsertImportedDeck`): cards already imported keep their
 * id and their local review progress. It used to append a second copy of
 * every card, contrary to what this comment then claimed.
 */
export async function importApkgCards(
  filePath?: string,
  onProgress?: (stage: string, done: number, total: number) => void,
): Promise<ApkgCardImportResult> {
  let res;
  const stop =
    onProgress && typeof window.api.onApkgImportProgress === 'function'
      ? window.api.onApkgImportProgress((e) => onProgress(e.stage, e.done, e.total))
      : undefined;
  try {
    res = await window.api.importApkgCards(filePath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    stop?.();
  }
  if (!res.ok) return { ok: false, error: res.error };

  const cards = res.cards ?? [];
  if (!cards.length) {
    return { ok: false, error: 'no-cards', noteCount: res.noteCount, fileName: res.fileName };
  }

  // Anki decks nest; the file name is the honest fallback when the collection
  // carries no usable deck name.
  const fallback = (res.fileName ?? 'Anki deck').replace(/\.(apkg|colpkg)$/i, '');
  const deckName = deckLabel(cards.find((c) => c.deck)?.deck, fallback);
  const bookId = deckBookId(`anki-${deckName}`);

  const result = upsertImportedDeck(
    bookId,
    cards.map((c) => ({
      word: c.word,
      reading: c.reading,
      meaning: c.meaning,
      sentence: c.sentence,
      source: 'import' as const,
      bookId,
      bookTitle: deckName,
      ...(c.tags?.length ? { tags: c.tags } : {}),
      ...(c.audioPath ? { audioPath: c.audioPath } : {}),
      ...(c.imagePath ? { imagePath: c.imagePath } : {}),
      ...(c.srs ? { srs: c.srs, introducedAt: c.srs.lastReviewedAt } : {}),
    })),
    // Decks imported before the id kept CJK letters sit under the ASCII-only id.
    { legacy: { bookId: legacyDeckBookId(`anki-${deckName}`), bookTitle: deckName } },
  );

  // An import is the batch most likely to exceed the per-batch cap, which the
  // run reports rather than quietly narrating a prefix of the deck.
  void enrichNewCards(result.added);

  return {
    ok: true,
    added: result.added,
    updated: result.updated,
    unchanged: result.unchanged,
    report: res.report ?? emptyApkgImportReport(),
    noteCount: res.noteCount,
    deckName,
    fileName: res.fileName,
  };
}

/**
 * One sentence per thing the import could not keep, so nothing is dropped
 * silently. Empty when everything came across. The review LOG (Anki's history
 * of past answers) is never imported, only each card's current schedule, and
 * that is said whenever a schedule was carried.
 */
export function apkgImportNotice(result: Pick<ApkgCardImportResult, 'report' | 'updated'>): string {
  const r = result.report;
  if (!r) return '';
  const parts: string[] = [];
  if (result.updated) parts.push(t('apkgImport.notice.updated', { count: result.updated }));
  if (r.scheduledCards) parts.push(t('apkgImport.notice.scheduled', { count: r.scheduledCards }));
  if (r.emptyNotes) parts.push(t('apkgImport.notice.empty', { count: r.emptyNotes }));
  if (r.duplicateNotes) parts.push(t('apkgImport.notice.duplicates', { count: r.duplicateNotes }));
  if (r.extraFieldNotes) parts.push(t('apkgImport.notice.extraFields', { count: r.extraFieldNotes }));
  if (r.mediaUnreadable) parts.push(t('apkgImport.notice.mediaUnreadable'));
  else {
    if (r.mediaMissing) parts.push(t('apkgImport.notice.mediaMissing', { count: r.mediaMissing }));
    if (r.mediaSkipped) parts.push(t('apkgImport.notice.mediaSkipped', { count: r.mediaSkipped }));
  }
  return parts.join(' ');
}

export interface ApkgLevelImportResult {
  ok: boolean;
  slot?: LevelSlot;
  /** The list the slot held before, for undo. */
  previous?: LevelList;
  words?: number;
  noteCount?: number;
  error?: 'level-slot-unknown' | string;
}

/**
 * The "Level check" drop: read the deck's words exactly as the Level page's
 * upload does, and file them under the level the deck's name says (N5..N1,
 * HSK 1..6). A name that says no level is refused by name — filing a deck
 * under a guessed level would move the meter on a guess.
 */
export async function importApkgToLevel(
  filePath: string,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ApkgLevelImportResult> {
  const lang = getActiveStudyLang();
  const slot = guessLevelSlot(fileName, lang);
  if (!slot) return { ok: false, error: 'level-slot-unknown' };
  const res = await importApkgWords(filePath, onProgress);
  if (!res.ok) return { ok: false, error: res.error ?? 'apkg-level-import-failed' };
  const previous = getSlotList(slot.id);
  upsertSlotList(slot.id, slot.label, slot.id.startsWith('hsk') ? 'hsk' : 'jlpt', res.words ?? []);
  await flushLevelListsPersistence();
  return { ok: true, slot, previous, words: res.words?.length ?? 0, noteCount: res.noteCount };
}

function lemmaOfSync(expr: string): string {
  const toks = tokenizeSync(expr);
  const content = toks.find((t) => t.content) ?? toks[0];
  return content?.lemma || expr;
}

/**
 * Prompt for (or accept) an .apkg, parse it in main, then lemmatize + dedupe in
 * the renderer. Pass a file path to skip the OS dialog (e.g. drag-and-drop).
 */
export async function importApkgWords(
  filePath?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ApkgLemmaResult> {
  let res;
  try {
    res = await window.api.importApkg(filePath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) return { ok: false, error: res.error };

  const exprs = res.expressions ?? [];

  // Build kuromoji once up front so the fold loop can run synchronously.
  let ready = true;
  try {
    await getTokenizer();
  } catch {
    ready = false; // fall back to raw expressions as their own "lemma"
  }

  const seen = new Set<string>();
  const words: string[] = [];
  const CHUNK = 400;
  for (let i = 0; i < exprs.length; i++) {
    const lemma = ready ? lemmaOfSync(exprs[i]) : exprs[i];
    if (lemma && !seen.has(lemma)) {
      seen.add(lemma);
      words.push(lemma);
    }
    if (i % CHUNK === CHUNK - 1) {
      onProgress?.(i + 1, exprs.length);
      // Yield so the render thread stays responsive on large decks.
      await new Promise((r) => setTimeout(r));
    }
  }
  onProgress?.(exprs.length, exprs.length);

  return {
    ok: true,
    words,
    noteCount: res.noteCount,
    rawCount: exprs.length,
    fileName: res.fileName,
  };
}
