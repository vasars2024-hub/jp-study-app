// Read an Anki CSV/TSV text export off disk into a draft — Phase 1 of
// ANKI_DECK_WORKBENCH_PLAN.md, the main-process half of `shared/ankiCsv.ts`.
//
// No Electron here: the caller hands over a path, and the only I/O is one
// `readFile`. That keeps the whole reader testable against a real temp file,
// which matters because the two things most likely to be wrong — the encoding a
// spreadsheet wrote and the size ceiling — are byte-level, not string-level.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ANKI_CSV_MAX_BYTES,
  buildAnkiCsvCollection,
  summarizeAnkiCsv,
  type AnkiCsvEncoding,
  type CsvDraftRequest,
  type CsvDraftResult,
} from '../../shared/ankiCsv';
import {
  ANKI_DRAFT_PAGE_SIZE,
  buildAnkiDraft,
  pageAnkiDraft,
} from '../../shared/ankiDraft';
import { stripFieldHtml } from '../../shared/apkgParse';
import { collapsePlainText } from '../../shared/ankiDraftEdit';
import { rememberCsvSource } from './csvSourceMemory';

/**
 * Decode the file's bytes.
 *
 * Anki's own exporter writes UTF-8 with no mark. A spreadsheet's "Save as" is
 * where the other encodings come from: Excel's *Unicode text* is UTF-16LE with
 * an FF FE mark, and its "CSV UTF-8" leads with a UTF-8 BOM. Guessing wrong
 * turns every field into mojibake that still parses, so the mark is read rather
 * than the content sniffed, and what was decided is reported back.
 */
export function decodeTextBuffer(bytes: Buffer): { text: string; encoding: AnkiCsvEncoding } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: bytes.subarray(2).toString('utf16le'), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // Node has no utf16be decoder; swapping the pairs is the whole difference.
    const swapped = Buffer.from(bytes.subarray(2));
    swapped.swap16();
    return { text: swapped.toString('utf16le'), encoding: 'utf-16be' };
  }
  // A UTF-8 BOM is left on the string on purpose: `parseAnkiCsvMeta` strips it
  // and keeps `bodyOffset` correct, and stripping it twice would eat a byte.
  return { text: bytes.toString('utf8'), encoding: 'utf-8' };
}

export async function readCsvDraft(request: CsvDraftRequest = {}): Promise<CsvDraftResult> {
  const file = request.filePath;
  if (!file) return { ok: false, error: 'no-file' };

  try {
    const stat = await fs.stat(file);
    if (stat.size > ANKI_CSV_MAX_BYTES) {
      // Explicit, with both numbers: a silent truncation would look like a deck
      // that really is that short.
      return { ok: false, error: `file-too-large:${stat.size}:${ANKI_CSV_MAX_BYTES}` };
    }

    const bytes = await fs.readFile(file);
    const { text, encoding } = decodeTextBuffer(bytes);
    const fileName = path.basename(file);
    const collection = buildAnkiCsvCollection(text, { defaultNoteTypeName: fileName });
    const fingerprint = `sha1:${crypto.createHash('sha1').update(bytes).digest('hex')}`;
    // So step 7 can find this file again without the renderer ever holding a
    // path — the same trade `readApkgDraft` makes for the package exporter.
    rememberCsvSource(fingerprint, file);

    const full = buildAnkiDraft(collection.raw, {
      source: {
        kind: 'csv',
        label: fileName,
        modifiedAtMs: stat.mtimeMs,
        // The file's bytes are what was read, so they are what a later commit
        // must find unchanged.
        fingerprint,
        // Recorded on the source so a later *edit* normalizes the same way the
        // read did, rather than guessing HTML for a plain-text file.
        plainText: !collection.meta.html,
      },
      // `#html:false` means the fields are plain text. Running the HTML stripper
      // over them would eat a literal `<` and everything after it, so a file
      // that says it is not HTML is only whitespace-collapsed.
      normalize: collection.meta.html ? stripFieldHtml : collapsePlainText,
    });

    const offset = Math.max(0, Math.floor(request.noteOffset ?? 0));
    const limit = request.noteLimit ?? ANKI_DRAFT_PAGE_SIZE;
    return {
      ok: true,
      draft: pageAnkiDraft(full, offset, limit),
      fileName,
      noteOffset: offset,
      totalNotes: full.counts.notes,
      csv: { ...summarizeAnkiCsv(collection), encoding, byteLength: bytes.length },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

