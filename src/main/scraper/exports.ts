// Writing exports to disk, and remembering that it happened.
//
// The *content* is built in the renderer by `data/exportBuilder.ts`, which
// already has its own tests and knows the column model. What was missing is
// everything after that: a real file on a real path, and a record of it that
// survives a restart so the Exports page lists history rather than fixtures.
//
// The path comes from a save dialog rather than from settings: the user always
// confirms where a file lands. `destinationRef` (the Export group's Destination)
// is where that dialog OPENS, and only when main can see it is an existing
// directory — anything else falls back to Downloads, as the field's hint says.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import type { ExportRecord } from '../../shared/scraperResults';
import type { ScraperExportInput } from '../../shared/scraperIpc';
import { scraperLog } from './logBus';
import { readScraperJson, withScraperFileQueue, writeScraperJson } from './store';

const EXPORTS_FILE = 'exports.json';
const MAX_RECORDS = 50;

interface StoredExport extends Omit<ExportRecord, 'ageMinutes'> {
  writtenAt: number;
}

interface ExportsFile {
  exports: StoredExport[];
}

const EMPTY: ExportsFile = { exports: [] };

/**
 * The folder the save dialog opens in: the configured destination when it is
 * an absolute path to an existing directory, the user's Downloads otherwise.
 */
export async function exportStartFolder(destinationRef: string): Promise<string> {
  const candidate = typeof destinationRef === 'string' ? destinationRef.trim() : '';
  if (candidate && path.isAbsolute(candidate)) {
    try {
      if ((await fsp.stat(candidate)).isDirectory()) return candidate;
    } catch {
      /* unreadable or missing — fall through */
    }
    scraperLog('warn', 'export', `Export destination ${candidate} is not a folder; opening Downloads.`);
  }
  return app.getPath('downloads');
}

/** Device names Windows reserves, with or without an extension. */
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i;
/** Characters no file name may hold on Windows, plus controls and bidi overrides. */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\s]+/g;
const MAX_NAME_CHARS = 120;

/**
 * Keeps a user-supplied name from becoming a path, or a name Windows refuses.
 *
 * Non-ASCII titles are kept (a Japanese show title is a perfectly good file
 * name); only separators, reserved punctuation, controls and whitespace are
 * replaced. The fallback is used only when nothing usable is left.
 */
export function safeFileName(name: string, fallback = 'anime-export'): string {
  // Both separators, whatever the platform: a name from the renderer may carry either.
  const raw = String(name ?? '').split(/[\\/]/).pop() ?? '';
  // Trailing dots and spaces are dropped by Windows itself; strip them before
  // whitespace becomes a dash, or `name. .` would keep a ghost suffix.
  const cleaned = raw.normalize('NFC').replace(/[.\s]+$/, '').replace(UNSAFE_NAME_CHARS, '-');
  const extMatch = /\.[A-Za-z0-9]{1,10}$/.exec(cleaned);
  const ext = extMatch ? extMatch[0] : '';
  let stem = (ext ? cleaned.slice(0, -ext.length) : cleaned)
    .replace(/^[-.]+/, '')
    .replace(/[. ]+$/, '');
  if (!stem) return ext ? `${fallback}${ext}` : fallback;
  if (WINDOWS_RESERVED.test(stem.split('.')[0] ?? '')) stem = `_${stem}`;
  // Cap by code points, so a surrogate pair is never split in half.
  const chars = Array.from(stem);
  const room = MAX_NAME_CHARS - ext.length;
  if (chars.length > room) stem = chars.slice(0, room).join('').replace(/[. -]+$/, '');
  return stem ? `${stem}${ext}` : `${fallback}${ext}`;
}

/** CSV is opened by spreadsheets: a BOM makes Excel read it as UTF-8. */
export function withCsvBom(content: string, format: string): string {
  if (format.toLowerCase() !== 'csv' || content.startsWith('\uFEFF')) return content;
  return `\uFEFF${content}`;
}

export async function listExports(): Promise<ExportRecord[]> {
  const file = await readScraperJson<ExportsFile>(EXPORTS_FILE, EMPTY);
  const now = Date.now();
  return file.exports.map(({ writtenAt, ...record }) => ({
    ...record,
    ageMinutes: Math.max(0, Math.round((now - writtenAt) / 60_000)),
  }));
}

async function record(entry: Omit<StoredExport, 'writtenAt'>): Promise<ExportRecord> {
  // Queued per file: two exports finishing together must not both read the
  // same old list and have the second write drop the first record.
  return withScraperFileQueue(EXPORTS_FILE, async () => {
    const file = await readScraperJson<ExportsFile>(EXPORTS_FILE, EMPTY);
    const stored: StoredExport = { ...entry, writtenAt: Date.now() };
    await writeScraperJson(EXPORTS_FILE, {
      exports: [stored, ...file.exports].slice(0, MAX_RECORDS),
    });
    return { ...entry, ageMinutes: 0 };
  });
}

export interface WriteExportRequest extends ScraperExportInput {
  /** The bytes to write, already formatted by the renderer's export builder. */
  content: string;
  /** File name with extension, before sanitising. */
  defaultName: string;
  /** How many rows the content covers, for the record. */
  recordCount: number;
  /** Reveal the file when it is written. */
  openAfter?: boolean;
}

/**
 * Writes one export.
 *
 * Returns null when the user cancels the dialog — a cancel is not a failed
 * export and must not appear in the history as one.
 */
export async function writeExport(request: WriteExportRequest): Promise<ExportRecord | null> {
  const name = safeFileName(request.defaultName);
  const suggested = path.join(await exportStartFolder(request.destination), name);
  const choice = await dialog.showSaveDialog({
    title: 'Save export',
    defaultPath: suggested,
  });
  if (choice.canceled || !choice.filePath) {
    scraperLog('info', 'export', 'Export cancelled.');
    return null;
  }

  try {
    await fsp.writeFile(choice.filePath, withCsvBom(request.content, String(request.format)), 'utf-8');
    scraperLog(
      'info',
      'export',
      `Wrote ${request.recordCount} record(s) to ${choice.filePath}.`,
      { correlationId: request.jobId },
    );
    if (request.openAfter) shell.showItemInFolder(choice.filePath);
    return record({
      id: `export-${Date.now().toString(36)}`,
      format: request.format.toUpperCase(),
      destination: choice.filePath,
      records: request.recordCount,
      outcome: 'ok',
      note: '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scraperLog('error', 'export', `Export failed: ${message}`, { correlationId: request.jobId });
    // A failed write is still history: "I tried to export and it did not work"
    // is exactly what the page should show.
    return record({
      id: `export-${Date.now().toString(36)}`,
      format: request.format.toUpperCase(),
      destination: choice.filePath,
      records: request.recordCount,
      outcome: 'failed',
      note: message,
    });
  }
}
