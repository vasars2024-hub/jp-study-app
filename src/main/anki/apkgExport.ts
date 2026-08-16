// Export a workbench change set as a NEW .apkg — the I/O shell of Phase 6
// (ANKI_DECK_WORKBENCH_PLAN.md). The pure application/verification logic lives
// in apkgExportCore.ts; this file does dialogs, zip and disk.
//
// The design keeps fidelity by *not rebuilding* the package: the source zip's
// entries — media files, the media manifest, `meta`, the legacy decoy
// collection — are copied verbatim, and only the real collection database is
// replaced with one that differs from the source by exactly the change set.
// Notes the renderer never paged in therefore survive untouched, and nothing
// the draft model does not carry can be lost.
//
// The source is found again through a fingerprint-keyed path memory populated
// by `readApkgDraft` (the renderer deliberately never holds a full path). If
// the memory is gone — an app restart — the user is asked to locate the file,
// and the fingerprint check still refuses a file that is not byte-identical to
// what the draft was read from.

import { dialog, BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import type { Database } from 'sql.js';
import type { ApkgExportRequest, ApkgExportResult } from '../../shared/ankiApkgExport';
import { exportChangesEmpty } from '../../shared/ankiApkgExport';
import { stripFieldHtml } from '../../shared/apkgParse';
import { applyExportChanges, verifyExportChanges, ExportRefusal } from './apkgExportCore';
import { getSql, readCollection } from './apkgImport';
import { mt } from '../i18n';

/** Fingerprint → source path, most recent last. Small on purpose: it exists to
 *  survive the minutes between reading a deck and exporting it, not forever. */
const recentSources = new Map<string, string>();
const RECENT_SOURCE_LIMIT = 8;

export function rememberApkgSource(fingerprint: string, filePath: string): void {
  recentSources.delete(fingerprint);
  recentSources.set(fingerprint, filePath);
  while (recentSources.size > RECENT_SOURCE_LIMIT) {
    const oldest = recentSources.keys().next().value;
    if (oldest == null) break;
    recentSources.delete(oldest);
  }
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

async function locateSource(): Promise<string | null> {
  const win = focusedWindow();
  const opts = {
    title: mt('dialog.exportAnkiDeck.pickSource'),
    filters: [{ name: mt('dialog.filter.ankiDeck'), extensions: ['apkg', 'colpkg'] }],
    properties: ['openFile' as const],
  };
  const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
}

async function pickOutPath(sourcePath: string): Promise<string | null> {
  const base = path.basename(sourcePath).replace(/\.(apkg|colpkg)$/i, '');
  const win = focusedWindow();
  const opts = {
    title: mt('dialog.exportAnkiDeck.title'),
    defaultPath: path.join(path.dirname(sourcePath), `${base} (edited).apkg`),
    filters: [{ name: mt('dialog.filter.ankiDeck'), extensions: ['apkg'] }],
  };
  const picked = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  return picked.canceled || !picked.filePath ? null : picked.filePath;
}

/** Paths naming the same file, under Windows' case-insensitivity. */
function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

const RECOMPRESS_HELP =
  'This deck uses Anki’s newer compressed format and this build cannot write it back. Export the source from Anki with "Support older Anki versions" checked, and edit that file instead.';

export async function exportApkg(request: ApkgExportRequest): Promise<ApkgExportResult> {
  if (!request?.changes || exportChangesEmpty(request.changes)) {
    return { ok: false, errorCode: 'nothing-to-export', error: 'The change set is empty.' };
  }

  const sourcePath =
    request.sourcePath ?? recentSources.get(request.fingerprint) ?? (await locateSource());
  if (!sourcePath) return { ok: false, errorCode: 'cancelled', error: 'cancelled' };
  if (!fs.existsSync(sourcePath)) {
    return {
      ok: false,
      errorCode: 'no-source',
      error: `The source package is gone: ${path.basename(sourcePath)}`,
    };
  }

  let db: Database | null = null;
  try {
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

    // The zstd writer only matters for the newer package format; probe for it
    // before doing any work, so the refusal comes first, not after a dialog.
    const zstdCompress = (
      zlib as unknown as { zstdCompressSync?: (b: Uint8Array) => Buffer }
    ).zstdCompressSync;
    if (entryName === 'collection.anki21b' && typeof zstdCompress !== 'function') {
      return { ok: false, errorCode: 'compressed-unsupported', error: RECOMPRESS_HELP };
    }

    const SQL = await getSql();
    db = new SQL.Database(bytes);
    const applied = applyExportChanges(db, request.changes, {
      nowMs: Date.now(),
      normalize: stripFieldHtml,
    });
    const newBytes = db.export();
    db.close();
    db = null;

    const outPath = request.outPath ?? (await pickOutPath(sourcePath));
    if (!outPath) return { ok: false, errorCode: 'cancelled', error: 'cancelled' };
    if (samePath(outPath, sourcePath)) {
      return {
        ok: false,
        errorCode: 'overwrite-source',
        error: 'Export writes a new package; it never overwrites the source copy.',
      };
    }

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
    rememberApkgSource(newFingerprint, outPath);
    return {
      ok: true,
      filePath: outPath,
      fileName: path.basename(outPath),
      notesUpdated: applied.notesUpdated,
      cardsUpdated: applied.cardsUpdated,
      decksUpdated: applied.decksUpdated,
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
