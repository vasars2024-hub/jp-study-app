// Renderer half of the .apkg import (Plan 0.5). The main process unzips and
// reads the SQLite; here we fold every expression to its kuromoji lemma and
// de-duplicate — so a deck with recognition + production cards, or the same
// word in several inflected forms, collapses to one entry (never inflating the
// known-word count). The fold is chunked with yields so a 30k-card deck never
// freezes the UI thread.

import { getTokenizer, tokenizeSync } from './tokenizer';
import { deckLabel } from '../shared/apkgCards';
import { deckBookId } from '../shared/deckImport';
import { addDeckCardsTracked, type DeckFlashcard } from './flashcardDeck';
import { enrichNewCards } from './flashcardAutoEnrich';

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
  /** Cards actually written to the deck. */
  added?: DeckFlashcard[];
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
 * Meter and keeps only a word list. This one keeps the note: reading, meaning
 * and example sentence come across, so an imported deck is reviewable rather
 * than just counted.
 *
 * Cards are filed under the Anki deck's own name where the collection provides
 * one, so re-importing the same deck replaces that group instead of piling up
 * a second copy — the behaviour `replaceImportedDeck` already gives CSV imports.
 */
export async function importApkgCards(filePath?: string): Promise<ApkgCardImportResult> {
  let res;
  try {
    res = await window.api.importApkgCards(filePath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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

  const added = addDeckCardsTracked(
    cards.map((c) => ({
      word: c.word,
      reading: c.reading,
      meaning: c.meaning,
      sentence: c.sentence,
      source: 'import' as const,
      bookId,
      bookTitle: deckName,
    })),
  );

  // An import is the batch most likely to exceed the per-batch cap, which the
  // run reports rather than quietly narrating a prefix of the deck.
  void enrichNewCards(added);

  return { ok: true, added, noteCount: res.noteCount, deckName, fileName: res.fileName };
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
