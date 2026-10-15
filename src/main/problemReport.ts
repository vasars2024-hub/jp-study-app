/**
 * "Save problem report…" (Settings -> Help -> Diagnostics): one zip the user can
 * attach to a bug report by hand. Nothing here sends anything anywhere (D9): the
 * zip is written where the user picks in a save dialog, and that is the end of it.
 *
 * What goes in:
 *   report.txt      what this is, the app version and the OS
 *   summary.json    the Diagnostics summary (versions, memory, processes)
 *   log.txt         the recent diagnostic log, newest first
 *   settings/*.json Gum's own settings files from an allowlist, secrets removed
 *   crashes/*.dmp   local minidumps, when crash reports are on and there are any
 *
 * Redaction, on every text that goes in:
 *   - `redactSecrets` (errorLog.ts, the app's one list of credential shapes);
 *   - any settings field whose NAME says it is a secret (key, token, password,
 *     cookie, PIN hash …) is replaced whatever its value looks like;
 *   - any path under the user's home folder is replaced by `[home-path]`, since a
 *     path names the user and the files they keep (book titles, folders).
 * Minidumps are binary and go in as they are: the user turned crash reports on,
 * and the Diagnostics text says the report includes them.
 *
 * Pure apart from the reads the caller does: `buildProblemReportZip` takes
 * everything as input, so the redaction and the zip layout run under plain vitest.
 */
import { zipSync, strToU8 } from 'fflate';
import { redactSecrets } from './errorLog';

/** Gum's own settings files that go into a report. Stores of user content or secrets never do. */
export const PROBLEM_REPORT_SETTINGS_FILES = [
  'app-update-state.json',
  'app-lifecycle.json',
  'config.json',
  'crash-reporting.json',
  'desktop-layout.json',
  'main-window-state.json',
  'blanc-window.json',
  'region-recorder.json',
  'study-block-windows.json',
] as const;

/** At most this many minidumps (newest first), each at most this big. */
export const PROBLEM_REPORT_MAX_DUMPS = 5;
export const PROBLEM_REPORT_MAX_DUMP_BYTES = 25 * 1024 * 1024;
/** A settings file larger than this is listed, not included. */
export const PROBLEM_REPORT_MAX_SETTINGS_BYTES = 256 * 1024;

/** A field name that says its value is a secret. */
const SECRET_FIELD =
  /(api_?key|apikey|secret|token|password|passwd|passphrase|pin_?hash|pinhash|cookie|credential|authorization|auth_?header|session_?id|private_?key|salt)/i;

export interface ProblemReportRedactor {
  text(value: string): string;
  value(value: unknown): unknown;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The home folder as a pattern: any mix of `\`, `\\` (JSON-escaped) and `/`
 * between its parts, any letter case (Windows paths are case-insensitive), then
 * the rest of the path. Folders in the middle of the path may contain spaces;
 * the last part stops at whitespace, a quote or punctuation that ends a sentence.
 */
function homePathPattern(homeDir: string): RegExp | null {
  const parts = homeDir.split(/[\\/]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const sep = '[\\\\/]+';
  const head = parts.map(escapeRegex).join(sep);
  // An absolute POSIX home starts with a separator.
  const lead = /^[\\/]/.test(homeDir) ? sep : '';
  const middle = `[^\\\\/\\r\\n"'<>|*?:]+(?=[\\\\/])`;
  // The last part may contain spaces when it ends in a file extension
  // (`My Novel.epub`); otherwise it stops at the first space.
  const last = `(?:[^\\\\/\\r\\n"'<>|*?:]*?\\.[A-Za-z0-9]{1,8}(?=$|[\\s"'<>|*?:,;)\\]])|[^\\\\/\\s"'<>|*?:,;)\\]]*)`;
  return new RegExp(`${lead}${head}(?=$|[\\\\/\\s"'<>|*?:,;)\\]])(?:${sep}(?:${middle}|${last}))*`, 'gi');
}

/** Any other user's profile folder (`C:\Users\<name>\…`), as a backstop. */
const ANY_USERS_PATH = /\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>|*?:,;]+(?:[\\/]+[^\\/\s"'<>|*?:,;]*)*/gi;

export function createProblemReportRedactor(opts: { homeDir: string }): ProblemReportRedactor {
  const home = homePathPattern(opts.homeDir);
  const text = (value: string): string => {
    let out = redactSecrets(String(value));
    if (home) out = out.replace(home, '[home-path]');
    out = out.replace(ANY_USERS_PATH, '[home-path]');
    return out;
  };
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > 32) return '[redacted-deep]';
    if (typeof value === 'string') {
      const out = text(value);
      // A settings value that IS a path under home: all of it, spaces included.
      return out.startsWith('[home-path]') && !/[\r\n]/.test(value) ? '[home-path]' : out;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const name = text(k);
        if (SECRET_FIELD.test(k) && v !== null && v !== undefined && typeof v !== 'boolean') out[name] = '[redacted]';
        else out[name] = walk(v, depth + 1);
      }
      return out;
    }
    return value;
  };
  return { text, value: (v) => walk(v, 0) };
}

export interface ProblemReportLogEntry {
  ts: string;
  severity: string;
  subsystem: string;
  operation: string;
  detail: string;
}

export interface ProblemReportInput {
  appVersion: string;
  /** e.g. `win32 10.0.26200 x64`. */
  os: string;
  createdAt: Date;
  homeDir: string;
  summary: unknown;
  log: readonly ProblemReportLogEntry[];
  /** Raw contents of the allowlisted settings files that exist, by file name. */
  settings: Readonly<Record<string, string>>;
  /** A few renderer-side preferences (UI language, theme), already plain values. */
  ui?: Readonly<Record<string, unknown>>;
  /** Minidumps, by file name. */
  dumps: ReadonlyArray<{ name: string; data: Uint8Array }>;
  crashReportsOn: boolean;
}

export interface ProblemReportResult {
  zip: Uint8Array;
  /** Paths inside the zip, for the log and the tests. */
  files: string[];
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

export function buildProblemReportZip(input: ProblemReportInput): ProblemReportResult {
  const r = createProblemReportRedactor({ homeDir: input.homeDir });
  const entries: Record<string, Uint8Array> = {};
  const settingsNotes: string[] = [];

  for (const [name, raw] of Object.entries(input.settings)) {
    if (!(PROBLEM_REPORT_SETTINGS_FILES as readonly string[]).includes(name)) continue;
    if (raw.length > PROBLEM_REPORT_MAX_SETTINGS_BYTES) {
      settingsNotes.push(`${name}: left out (${raw.length} bytes)`);
      continue;
    }
    let body: string;
    try {
      body = JSON.stringify(r.value(JSON.parse(raw)), null, 2);
    } catch {
      // Not JSON (a torn write): its text, redacted, rather than nothing.
      body = r.text(raw);
      settingsNotes.push(`${name}: not valid JSON, included as redacted text`);
    }
    entries[`settings/${safeName(name)}`] = strToU8(body);
  }
  if (input.ui) entries['settings/ui.json'] = strToU8(JSON.stringify(r.value(input.ui), null, 2));

  const dumps = input.dumps
    .filter((d) => d.data.byteLength > 0 && d.data.byteLength <= PROBLEM_REPORT_MAX_DUMP_BYTES)
    .slice(0, PROBLEM_REPORT_MAX_DUMPS);
  for (const d of dumps) entries[`crashes/${safeName(d.name)}`] = d.data;

  const logText = input.log
    .map((e) => r.text(`${e.ts} ${String(e.severity).toUpperCase()} ${e.subsystem}/${e.operation}: ${e.detail}`))
    .join('\n');
  entries['log.txt'] = strToU8(logText || '(the diagnostic log is empty)');
  entries['summary.json'] = strToU8(JSON.stringify(r.value(input.summary ?? {}), null, 2));

  const report = [
    'Gum problem report',
    '',
    `Created: ${input.createdAt.toISOString()}`,
    `Gum version: ${r.text(input.appVersion)}`,
    `OS: ${r.text(input.os)}`,
    `Crash reports on this PC: ${input.crashReportsOn ? 'on' : 'off'}`,
    `Crash files included: ${dumps.length}`,
    `Log entries included: ${input.log.length}`,
    ...(settingsNotes.length ? ['', 'Settings notes:', ...settingsNotes.map((n) => `  ${n}`)] : []),
    '',
    'This file was made on your PC and has not been sent anywhere.',
    'API keys, tokens, passwords and paths under your user folder were removed.',
    'Crash files (crashes/*.dmp) are memory snapshots and are included as they are.',
    '',
  ].join('\n');
  entries['report.txt'] = strToU8(report);

  const ordered: Record<string, Uint8Array> = {};
  for (const name of Object.keys(entries).sort((a, b) => (a === 'report.txt' ? -1 : b === 'report.txt' ? 1 : a.localeCompare(b)))) {
    ordered[name] = entries[name]!;
  }
  // Dumps are already compressed poorly; level 6 for text is plenty.
  const zip = zipSync(ordered, { level: 6, mtime: input.createdAt });
  return { zip, files: Object.keys(ordered) };
}

/** `gum-problem-report-2026-10-15-0412.zip` */
export function problemReportFileName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `gum-problem-report-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.zip`;
}
