// The electron-free half of the .apkg export: read, fingerprint, apply, write,
// read back. Split out of `apkgExport.ts` (round-2 audit F, Anki item 13) so it
// runs in the deck utility process (`apkgReadWorker.ts`) instead of on
// Electron's main loop, where a large deck froze every window for the length of
// the zip + sql.js work. The dialogs and the source memory stay in main.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import type { Database } from 'sql.js';
import type { ApkgExportRequest, ApkgExportResult } from '../../shared/ankiApkgExport';
import { stripFieldHtml } from '../../shared/apkgParse';
import { applyExportChanges, verifyExportChanges, ExportRefusal } from './apkgExportCore';
import { getSql, readCollection } from './apkgCollection';

const RECOMPRESS_HELP =
  'This deck uses Anki’s newer compressed format and this build cannot write it back. Export the source from Anki with "Support older Anki versions" checked, and edit that file instead.';

/** Largest source package the export opens (whole file and collection are held in memory). */
export const APKG_EXPORT_MAX_BYTES = 1024 * 1024 * 1024;

export type ApkgExportProgress = (stage: 'read' | 'apply' | 'write' | 'verify') => void;

/**
 * Write `request.changes` applied to `sourcePath` as a new package at
 * `outPath`, and verify it by reading the written file back. The caller has
 * already resolved both paths (dialogs are main's) and refused `outPath ===
 * sourcePath`.
 */
export async function runApkgExport(
  sourcePath: string,
  outPath: string,
  request: ApkgExportRequest,
  onProgress?: ApkgExportProgress,
): Promise<ApkgExportResult> {
  let db: Database | null = null;
  try {
    const size = fs.statSync(sourcePath).size;
    if (size > APKG_EXPORT_MAX_BYTES) {
      return { ok: false, errorCode: 'io', error: `file-too-large:${size}:${APKG_EXPORT_MAX_BYTES}` };
    }
    onProgress?.('read');
    const zip = new AdmZip(sourcePath);
    const { bytes, entryName } = readCollection(zip);
    const fingerprint = `sha1:${crypto.createHash('sha1').update(bytes).digest('hex')}`;
    if (fingerprint !== request.fingerprint) {
      return {
        ok: false,
        errorCode: 'source-changed',
        error:
          'The deck file changed since it was read. Reopen it in the workbench and redo the edits there.',
      };
    }

    // The zstd writer only matters for the newer package format.
    const zstdCompress = (
      zlib as unknown as { zstdCompressSync?: (b: Uint8Array) => Buffer }
    ).zstdCompressSync;
    if (entryName === 'collection.anki21b' && typeof zstdCompress !== 'function') {
      return { ok: false, errorCode: 'compressed-unsupported', error: RECOMPRESS_HELP };
    }

    onProgress?.('apply');
    const SQL = await getSql();
    db = new SQL.Database(bytes);
    const applied = applyExportChanges(db, request.changes, {
      nowMs: Date.now(),
      normalize: stripFieldHtml,
    });
    const newBytes = db.export();
    db.close();
    db = null;

    onProgress?.('write');
    const outZip = new AdmZip();
    const collectionEntry =
      entryName === 'collection.anki21b' && zstdCompress
        ? zstdCompress(newBytes)
        : Buffer.from(newBytes);
    for (const entry of zip.getEntries()) {
      outZip.addFile(
        entry.entryName,
        entry.entryName === entryName ? collectionEntry : entry.getData(),
      );
    }
    outZip.writeZip(outPath);

    // Verify against what the DISK holds, not what memory held: re-open the
    // written file through the same reader an import would use.
    onProgress?.('verify');
    const checkZip = new AdmZip(outPath);
    const written = readCollection(checkZip);
    const checkDb: Database = new SQL.Database(written.bytes);
    let verdict: { ok: boolean; mismatches: string[] };
    try {
      verdict = verifyExportChanges(checkDb, request.changes);
    } finally {
      checkDb.close();
    }
    if (!verdict.ok) {
      // A package that fails its own read-back must not sit on disk looking
      // importable; remove it and say exactly that.
      try {
        fs.unlinkSync(outPath);
      } catch {
        /* the report below still names the failure */
      }
      return {
        ok: false,
        errorCode: 'verify-failed',
        error: `The written package failed read-back verification and was removed: ${verdict.mismatches
          .slice(0, 5)
          .join('; ')}`,
      };
    }

    const newFingerprint = `sha1:${crypto
      .createHash('sha1')
      .update(written.bytes)
      .digest('hex')}`;
    return {
      ok: true,
      filePath: outPath,
      fileName: path.basename(outPath),
      notesUpdated: applied.notesUpdated,
      cardsUpdated: applied.cardsUpdated,
      decksUpdated: applied.decksUpdated,
      templatesRemoved: applied.templatesRemoved,
      cardsDeleted: applied.cardsDeleted,
      templatesAdded: applied.templatesAdded,
      cardsCreated: applied.cardsCreated,
      templatesFormatted: applied.templatesFormatted,
      verified: true,
      fingerprint: newFingerprint,
    };
  } catch (err) {
    if (err instanceof ExportRefusal) {
      return { ok: false, errorCode: err.code, error: err.message };
    }
    return {
      ok: false,
      errorCode: 'io',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}
