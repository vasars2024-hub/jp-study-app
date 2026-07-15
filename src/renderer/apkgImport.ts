// Renderer half of the .apkg import (Plan 0.5). The main process unzips and
// reads the SQLite; here we fold every expression to its kuromoji lemma and
// de-duplicate — so a deck with recognition + production cards, or the same
// word in several inflected forms, collapses to one entry (never inflating the
// known-word count). The fold is chunked with yields so a 30k-card deck never
// freezes the UI thread.

import { getTokenizer, tokenizeSync } from './tokenizer';

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
