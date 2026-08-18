// Export a workbench change set as a NEW .txt/.csv text file — the I/O shell for
// `shared/ankiCsvExport.ts`, and the third destination `DeckWorkbenchApply` can
// reach (ANKI_DECK_WORKBENCH_PLAN.md, source adapter 3).
//
// Deliberately the same shape as `apkgExport.ts`, because the same properties
// have to hold: the source is found again through a fingerprint-keyed path
// memory so the renderer never holds a path, a source whose bytes moved since
// the read is refused rather than clobbered, the original is never overwritten,
// and the written file is re-read FROM DISK through the same reader an import
// would use before the export is reported as successful.
//
// One thing it does NOT share: the package exporter copies the source zip's
// entries verbatim and replaces only the collection. There is no such structure
// here — the whole file is rewritten — so fidelity comes instead from editing
// the source's own parsed rows rather than rebuilding them from the draft, and
// from re-emitting every directive the reader read.

import { dialog, BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  applyCsvExportChanges,
  CsvExportRefusal,
  type AnkiCsvExportRequest,
  type AnkiCsvExportResult,
} from '../../shared/ankiCsvExport';
import { exportChangesEmpty } from '../../shared/ankiApkgExport';
import { buildAnkiCsvCollection } from '../../shared/ankiCsv';
import { ANKI_FIELD_SEP } from '../../shared/ankiDraft';
import { decodeTextBuffer } from './csvDraftRead';
import { recallCsvSource, rememberCsvSource } from './csvSourceMemory';
import { mt } from '../i18n';

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

const TEXT_EXTENSIONS = ['txt', 'csv', 'tsv'];

async function locateSource(): Promise<string | null> {
  const win = focusedWindow();
  const opts = {
    title: mt('dialog.exportAnkiText.pickSource'),
    filters: [{ name: mt('dialog.filter.csvTsv'), extensions: TEXT_EXTENSIONS }],
    properties: ['openFile' as const],
  };
  const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
}

async function pickOutPath(sourcePath: string): Promise<string | null> {
  const extension = path.extname(sourcePath).replace(/^\./, '').toLowerCase() || 'txt';
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const win = focusedWindow();
  const opts = {
    title: mt('dialog.exportAnkiText.title'),
    defaultPath: path.join(path.dirname(sourcePath), `${base} (edited).${extension}`),
    filters: [{ name: mt('dialog.filter.csvTsv'), extensions: TEXT_EXTENSIONS }],
  };
  const picked = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  return picked.canceled || !picked.filePath ? null : picked.filePath;
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

const UTF8_BOM = '﻿';

export async function exportAnkiCsv(request: AnkiCsvExportRequest): Promise<AnkiCsvExportResult> {
  if (!request?.changes || exportChangesEmpty(request.changes)) {
    return { ok: false, errorCode: 'nothing-to-export', error: 'The change set is empty.' };
  }

  try {
    const sourcePath =
      request.sourcePath ?? recallCsvSource(request.fingerprint) ?? (await locateSource());
    if (!sourcePath) return { ok: false, errorCode: 'cancelled', error: 'cancelled' };
    if (!fs.existsSync(sourcePath)) {
      return {
        ok: false,
        errorCode: 'no-source',
        error: `The source file is gone: ${path.basename(sourcePath)}`,
      };
    }

    const bytes = await fsp.readFile(sourcePath);
    const fingerprint = `sha1:${crypto.createHash('sha1').update(bytes).digest('hex')}`;
    if (fingerprint !== request.fingerprint) {
      return {
        ok: false,
        errorCode: 'source-changed',
        error:
          'The source file changed since it was read. Reopen it in the workbench and redo the edits there.',
      };
    }

    const { text, encoding } = decodeTextBuffer(bytes);
    const applied = applyCsvExportChanges(text, request.changes);

    const outPath = request.outPath ?? (await pickOutPath(sourcePath));
    if (!outPath) return { ok: false, errorCode: 'cancelled', error: 'cancelled' };
    if (samePath(outPath, sourcePath)) {
      return {
        ok: false,
        errorCode: 'overwrite-source',
        error: 'Export writes a new file; it never overwrites the source copy.',
      };
    }

    // Always UTF-8, whatever the source was. A UTF-16 source came from a
    // spreadsheet's "Save as"; Anki's own exporter and importer both speak
    // UTF-8, so writing it back as UTF-16 would hand the user a file their own
    // Anki reads worse than this one does. A source that led with a UTF-8 BOM
    // keeps it — `parseAnkiCsvMeta` strips one and the reader's `bodyOffset`
    // accounts for it, so preserving it round-trips and removing it would be a
    // silent change to the file's bytes.
    const keepBom = encoding === 'utf-8' && text.startsWith(UTF8_BOM);
    const outText = keepBom ? UTF8_BOM + applied.text : applied.text;
    await fsp.writeFile(outPath, outText, 'utf8');

    // Verify against what the DISK holds, through the same reader an import
    // would use — not against the string still in memory.
    const writtenBytes = await fsp.readFile(outPath);
    const written = decodeTextBuffer(writtenBytes);
    const collection = buildAnkiCsvCollection(written.text);
    const byId = new Map(collection.raw.notes.map((note) => [note.id, note]));
    const mismatches: string[] = [];
    for (const change of request.changes.notes ?? []) {
      if (!change.fields) continue;
      const note = byId.get(change.noteId);
      if (!note) {
        mismatches.push(`${change.noteId}: absent from the written file`);
        continue;
      }
      const fields = String(note.flds ?? '').split(ANKI_FIELD_SEP);
      // The change set, except for the notes the writer declared it rewrote —
      // the plain-text provenance unwrap. See `CsvApplyOutcome.effectiveFields`
      // for why the caller's set stays the comparison everywhere else.
      const wanted = applied.effectiveFields.get(change.noteId) ?? change.fields;
      if (fields.length !== wanted.length || fields.some((value, i) => value !== wanted[i])) {
        mismatches.push(`${change.noteId}: fields differ after read-back`);
      }
      if (mismatches.length >= 5) break;
    }
    if (mismatches.length) {
      // A file that fails its own read-back must not sit on disk looking
      // importable; remove it and say exactly what failed.
      try {
        fs.unlinkSync(outPath);
      } catch {
        /* the report below still names the failure */
      }
      return {
        ok: false,
        errorCode: 'verify-failed',
        error: `The written file failed read-back verification and was removed: ${mismatches.join('; ')}`,
      };
    }

    const newFingerprint = `sha1:${crypto.createHash('sha1').update(writtenBytes).digest('hex')}`;
    rememberCsvSource(newFingerprint, outPath);
    return {
      ok: true,
      filePath: outPath,
      fileName: path.basename(outPath),
      notesUpdated: applied.notesUpdated,
      tagsUpdated: applied.tagsUpdated,
      provenanceTagged: applied.provenanceTagged,
      rowsWritten: applied.rowsWritten,
      noteIdentity: applied.noteIdentity,
      verified: true,
      fingerprint: newFingerprint,
    };
  } catch (err) {
    if (err instanceof CsvExportRefusal) {
      return { ok: false, errorCode: err.code, error: err.message, unsupported: err.details };
    }
    return { ok: false, errorCode: 'io', error: err instanceof Error ? err.message : String(err) };
  }
}
