// Import an Anki .apkg / .colpkg deck and extract its studied words (Plan 0.5,
// Level Meter). An .apkg is a zip whose SQLite collection (collection.anki21 /
// .anki2, or the newer zstd-compressed .anki21b) holds the notes. We read it
// here in the MAIN process — off the renderer's UI thread, and reusing adm-zip
// plus the shared field heuristics — then hand the raw expressions to the
// renderer, which lemmatizes + dedupes them against kuromoji.
//
// The pure parsing (HTML/furigana stripping, field selection) lives in
// src/shared/apkgParse.ts so it is unit-testable; this file is the I/O shell.

import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ApkgImportResult } from '../../shared/apkgParse';
import type { ApkgCardsResult } from '../../shared/apkgCards';
import type { ApkgImportProgressEvent } from '../../shared/apkgJobs';
import type { ApkgDraftRequest, ApkgDraftResult } from '../../shared/ankiDraft';
import type { CsvDraftRequest } from '../../shared/ankiCsv';
import type { ConnectDraftRequest } from '../../shared/ankiConnectDraft';
import { readApkgCardsFile, readApkgWordsFile } from './apkgNoteRead';
import {
  APKG_READ_CANCELLED,
  parseApkgDraftPageOffMainLoop,
  runApkgJobOffMainLoop,
} from './apkgReadHost';
import { minedMediaDirectoryUnder } from '../minedMediaStore';
import { readCsvDraft } from './csvDraftRead';
import { recallCsvSource } from './csvSourceMemory';
import { exportAnkiCsv } from './csvExport';
import type { AnkiCsvExportRequest } from '../../shared/ankiCsvExport';
import { readConnectDraft } from './connectDraftRead';
import { cancelConnectCommit, commitConnectDraft } from './connectCommit';
import type { ConnectCommitRequest } from '../../shared/ankiConnectCommit';
import {
  beginDraftSession,
  cancelDraftSession,
  deleteDraftSession,
  clearDraftSessions,
  restoreDraftSessions,
  failDraftSession,
  getDraftSession,
  recordDraftSessionPage,
  resumeDraftSession,
  summarizeDraftSessions,
  type BeginDraftSessionRequest,
} from './draftSessionStore';
import type { DraftSessionPageReport } from '../../shared/ankiDraftSession';
import { exportApkg, rememberApkgSource } from './apkgExport';
import type { ApkgExportRequest } from '../../shared/ankiApkgExport';
import { mt } from '../i18n';

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

/** The deck file dialog, shared by all three readers so their filters cannot drift. */
async function pickDeckFile(filePath?: string): Promise<string | null> {
  if (filePath) return filePath;
  const win = focusedWindow();
  const opts = {
    title: mt('dialog.importAnkiDeck.title'),
    filters: [{ name: mt('dialog.filter.ankiDeck'), extensions: ['apkg', 'colpkg'] }],
    properties: ['openFile' as const],
  };
  const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (picked.canceled || !picked.filePaths[0]) return null;
  return picked.filePaths[0];
}

/**
 * The text-export open dialog — the door to the `csv` source.
 *
 * It lives here rather than in `csvDraftRead.ts` on purpose: that module's
 * stated property is that it imports no Electron, which is what makes the
 * encoding and size-ceiling paths testable against a real temp file. So the
 * handler resolves the path and the reader still only ever receives one.
 * `filePath` short-circuits it exactly as `pickDeckFile` does, which is what
 * keeps the whole flow drivable without an OS dialog.
 */
async function pickAnkiTextFile(filePath?: string): Promise<string | null> {
  if (filePath) return filePath;
  const win = focusedWindow();
  const opts = {
    title: mt('dialog.importAnkiText.title'),
    filters: [{ name: mt('dialog.filter.csvTsv'), extensions: ['txt', 'csv', 'tsv'] }],
    properties: ['openFile' as const],
  };
  const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (picked.canceled || !picked.filePaths[0]) return null;
  return picked.filePaths[0];
}

// ----- whole-deck imports ------------------------------------------------------

/**
 * The Level Meter's read and the card import. Both parse in the deck utility
 * process (`runApkgJobOffMainLoop`); the readers live in the electron-free
 * `apkgNoteRead.ts`. Before 2026-09 they ran inline here, and a large deck
 * froze every window for the length of the zip + sql.js parse.
 */
async function importApkg(filePath?: string): Promise<ApkgImportResult> {
  const file = await pickDeckFile(filePath);
  if (!file) return { ok: false, error: 'cancelled' };
  try {
    return await runApkgJobOffMainLoop<ApkgImportResult>({ op: 'words', filePath: file }, () =>
      readApkgWordsFile(file),
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Import a deck as CARDS rather than as a word list: text fields, tags, the
 * first card's schedule, and the first cited audio and image (stored as
 * managed media), with a report of what could not come across.
 */
async function importApkgCards(
  filePath: string | undefined,
  onProgress?: (event: ApkgImportProgressEvent) => void,
): Promise<ApkgCardsResult> {
  const file = await pickDeckFile(filePath);
  if (!file) return { ok: false, error: 'cancelled' };
  const mediaDir = minedMediaDirectoryUnder(app.getPath('userData'));
  try {
    return await runApkgJobOffMainLoop<ApkgCardsResult>(
      { op: 'cards', filePath: file, mediaDir },
      () =>
        readApkgCardsFile(file, {
          mediaDir,
          onProgress: (stage, done, total) => onProgress?.({ filePath: file, stage, done, total }),
        }),
      { onProgress: (p) => onProgress?.({ filePath: file, stage: p.stage, done: p.done, total: p.total }) },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read a deck as a full-fidelity draft — the workbench's reader.
 *
 * Sibling of `importApkg`/`importApkgCards`, sharing their zip/zstd/sql.js
 * ladder. It differs in what it keeps: everything, per `shared/ankiDraft.ts`.
 * The response is one PAGE of notes, because the whole point of a workbench is
 * decks too large to hand across IPC in a single message.
 *
 * The parse itself runs in a utility process (`apkgReadHost.ts`) — gate 9's
 * "without freezing Electron's main event loop". What stays here is everything
 * that only main can do honestly: the dialog, the stale-path refusal, the
 * fingerprint -> path memory the exporter reads, and the session bookkeeping.
 */
/**
 * Reads a caller can still abandon, keyed by the token it minted.
 *
 * A registry rather than a single controller because the workbench and the
 * glossary panel can each have a read in flight, and cancelling "the read" would
 * then stop whichever one the other surface started. An entry lives exactly as
 * long as its read: registered before the dialog opens, so a cancel that lands
 * while the picker is up still refuses the parse behind it, and deleted in a
 * `finally` so a finished read leaves nothing to cancel.
 */
const draftReadAborts = new Map<string, AbortController>();

/**
 * Ask an in-flight read to stop. `false` means no read is running under that
 * token — already finished, or never started — which is a true answer and not a
 * failure, so it is reported as one rather than thrown.
 */
export function cancelApkgDraftRead(readId?: string): boolean {
  if (!readId) return false;
  const controller = draftReadAborts.get(readId);
  if (!controller) return false;
  controller.abort();
  return true;
}

async function readApkgDraft(request: ApkgDraftRequest = {}): Promise<ApkgDraftResult> {
  // A resume names its session, never a path: the renderer has never been told
  // where the file is (only its label), and the session store is where the path
  // has been kept all along. Falling through to the dialog when the session is
  // gone would silently ask for a different file, so it is an explicit refusal.
  // Registered before anything slow, so every wait the user can see — the
  // dialog, the fork, the parse — is inside the window a cancel can reach.
  const controller = request.readId ? new AbortController() : undefined;
  if (request.readId && controller) draftReadAborts.set(request.readId, controller);
  try {
    return await readApkgDraftInner(request, controller?.signal);
  } finally {
    if (request.readId) draftReadAborts.delete(request.readId);
  }
}

async function readApkgDraftInner(
  request: ApkgDraftRequest,
  signal: AbortSignal | undefined,
): Promise<ApkgDraftResult> {
  let requested = request.filePath;
  if (!requested && request.sessionId) {
    requested = getDraftSession(request.sessionId)?.request.filePath;
    if (!requested) return { ok: false, error: 'session-source-unknown' };
  }
  // A path nobody picked in this moment can have gone stale — the session store
  // outlives the file it names. Say which failure that is: the zip reader would
  // otherwise surface a raw ENOENT that reads like a corrupt package, and the
  // one recovery it needs (pick the file again) would not be obvious.
  if (requested && !fs.existsSync(requested)) return { ok: false, error: 'source-missing' };
  const file = await pickDeckFile(requested);
  if (!file) return { ok: false, error: 'cancelled' };
  // A cancel that landed while the picker was open. Checked here rather than
  // left to the parse so no process is forked for a read nobody is waiting on.
  if (signal?.aborted) return { ok: false, error: APKG_READ_CANCELLED };

  try {
    const parsed = await parseApkgDraftPageOffMainLoop(
      {
        filePath: file,
        noteOffset: request.noteOffset,
        noteLimit: request.noteLimit,
      },
      { signal },
    );
    const { page, fingerprint, totalNotes, sourceKind, noteOffset: offset, noteLimit: limit } =
      parsed;

    // The renderer only ever sees the label; the exporter finds its way back to
    // the file through this fingerprint-keyed memory in the main process. It is
    // recorded after the parse rather than before it now, because a package that
    // fails to parse never had a source worth remembering.
    rememberApkgSource(fingerprint, file);

    // The session is recorded here rather than by the caller. The channels for
    // doing it from the renderer have existed since Phase 1 and no caller has
    // ever used them, so every session list has been empty and no draft has
    // ever been resumable. Main is also the only side that can record one
    // honestly: it holds the path, the fingerprint and the true total, and a
    // page it served cannot go unrecorded because a caller forgot to say so.
    const session = beginDraftSession({
      sourceKind,
      label: path.basename(file),
      request: { kind: sourceKind, filePath: file, noteLimit: limit },
      fingerprint,
    });
    recordDraftSessionPage(session.id, {
      offset,
      count: page.notes.length,
      totalNotes,
      fingerprint,
      diagnosticCodes: page.diagnostics.map((d) => d.code),
    });

    return {
      ok: true,
      draft: page,
      fileName: path.basename(file),
      noteOffset: offset,
      totalNotes,
      sessionId: session.id,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function registerApkgIpc(): void {
  ipcMain.handle('apkg:import', (_e, filePath?: string) => importApkg(filePath));
  ipcMain.handle('apkg:importCards', (e, filePath?: string) =>
    importApkgCards(filePath, (progress) => {
      if (!e.sender.isDestroyed()) e.sender.send('apkg:importProgress', progress);
    }),
  );
  ipcMain.handle('apkg:readDraft', (_e, request?: ApkgDraftRequest) => readApkgDraft(request));
  ipcMain.handle('apkg:cancelDraftRead', (_e, readId?: string) => cancelApkgDraftRead(readId));
  ipcMain.handle('apkg:export', (_e, request: ApkgExportRequest) => exportApkg(request));
  ipcMain.handle('anki:readCsvDraft', async (_e, request?: CsvDraftRequest) => {
    // A further page of a file already open: the fingerprint names it, and the
    // result must still be that file — the workbench merges pages by it.
    if (!request?.filePath && typeof request?.fingerprint === 'string' && request.fingerprint) {
      const remembered = recallCsvSource(request.fingerprint);
      if (!remembered) return { ok: false, error: 'source-forgotten' };
      const page = await readCsvDraft({ ...request, filePath: remembered });
      if (page.ok && page.draft?.source.fingerprint !== request.fingerprint) {
        return { ok: false, error: 'source-changed' };
      }
      return page;
    }
    const file = await pickAnkiTextFile(request?.filePath);
    // Same shape the package reader uses: a dismissed dialog is a named state,
    // not a read that failed, so the shell can stay quiet about it.
    if (!file) return { ok: false, error: 'cancelled' };
    return readCsvDraft({ ...request, filePath: file });
  });
  ipcMain.handle('anki:exportCsvDraft', (_e, request: AnkiCsvExportRequest) =>
    exportAnkiCsv(request),
  );
  ipcMain.handle('anki:readConnectDraft', (_e, request?: ConnectDraftRequest) =>
    readConnectDraft(request),
  );
  ipcMain.handle('anki:commitConnectDraft', (_e, request: ConnectCommitRequest) =>
    commitConnectDraft(request),
  );
  ipcMain.handle('anki:cancelConnectCommit', (_e, commitId?: string) =>
    cancelConnectCommit(commitId),
  );

  // Resumable draft sessions. `readApkgDraft` records its own pages — a reader
  // that served a page is the one component that cannot forget to say so. These
  // channels remain for a caller driving paging itself (a source main does not
  // read, or a cancel/fail the reader cannot observe).
  ipcMain.handle('anki:draftSessionList', () => summarizeDraftSessions());
  ipcMain.handle('anki:draftSessionBegin', (_e, request: BeginDraftSessionRequest) =>
    beginDraftSession(request),
  );
  ipcMain.handle('anki:draftSessionRecordPage', (_e, id: string, page: DraftSessionPageReport) =>
    recordDraftSessionPage(id, page) ?? null,
  );
  ipcMain.handle('anki:draftSessionCancel', (_e, id: string) => cancelDraftSession(id) ?? null);
  ipcMain.handle('anki:draftSessionFail', (_e, id: string, error: string) =>
    failDraftSession(id, String(error ?? 'unknown')) ?? null,
  );
  ipcMain.handle('anki:draftSessionResume', (_e, id: string, fingerprint?: string) =>
    resumeDraftSession(id, fingerprint),
  );
  ipcMain.handle('anki:draftSessionDelete', (_e, id: string) => deleteDraftSession(id));
  ipcMain.handle('anki:draftSessionClear', () => clearDraftSessions());
  ipcMain.handle('anki:draftSessionRestore', (_e, sessions: import('../../shared/ankiDraftSession').AnkiDraftSession[]) => restoreDraftSessions(sessions));
}
