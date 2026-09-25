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
import fs from 'node:fs';
import path from 'node:path';
import type { ApkgExportRequest, ApkgExportResult } from '../../shared/ankiApkgExport';
import { exportChangesEmpty } from '../../shared/ankiApkgExport';
import { runApkgExport } from './apkgExportRun';
import { runApkgJobOffMainLoop } from './apkgReadHost';
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

  // The destination is asked for up front now: everything after it — read,
  // fingerprint check, apply, write, read-back — runs in the deck utility
  // process, which can show no dialog.
  const outPath = request.outPath ?? (await pickOutPath(sourcePath));
  if (!outPath) return { ok: false, errorCode: 'cancelled', error: 'cancelled' };
  if (samePath(outPath, sourcePath)) {
    return {
      ok: false,
      errorCode: 'overwrite-source',
      error: 'Export writes a new package; it never overwrites the source copy.',
    };
  }

  let result: ApkgExportResult;
  try {
    result = await runApkgJobOffMainLoop<ApkgExportResult>(
      { op: 'export', sourcePath, outPath, request },
      () => runApkgExport(sourcePath, outPath, request),
    );
  } catch (err) {
    return { ok: false, errorCode: 'io', error: err instanceof Error ? err.message : String(err) };
  }
  if (result.ok && result.fingerprint) rememberApkgSource(result.fingerprint, outPath);
  return result;
}
