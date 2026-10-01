// The scraper's log spine.
//
// Every other module in this folder reports through here rather than
// console.log, for three reasons: the Logs tab and the status bar need the same
// lines, a finished job has to be able to hand back the lines it produced, and
// secrets must be scrubbed in exactly one place instead of at every call site.
//
// Lines are kept in a bounded ring so a long-running app cannot grow a log
// buffer without limit, and `offsetMs` is measured from a per-job or per-process
// epoch so the UI can show relative time without the renderer knowing when
// anything started.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { LogLine } from '../../shared/scraperResults';
import { isoDateLocal } from '../../shared/watchLibrary';
import {
  DEFAULT_SCRAPER_LOGGING_SETTINGS,
  type ScraperLoggingSettings,
} from '../../shared/scraperOutputSettings';
import { scraperStorePath } from './store';

export type LogLevel = LogLine['level'];

const RING_SIZE = 2_000;

// ---------------------------------------------------------------------------
// 2026-08-05: the Logging settings group reaches this file.
//
// It was previously INERT IN FULL — all nine fields appeared in the settings UI,
// the schema and the schema's tests, and nothing in production read any of them.
// Five now act here (level, channels, persistToDisk, retentionDays,
// maxFileSizeMb). The other four were resolved rather than wired, because
// wiring them would have been worse than leaving them:
//
//   redactCookies / redactCredentials — redaction below is UNCONDITIONAL and
//     always was. Turning it into a switch would convert a protection that
//     cannot be lost into one a user can turn off by accident, which is a
//     downgrade dressed as a feature. Both fields stay in the schema (so stored
//     documents keep parsing) and their two toggles are gone from the drawer,
//     replaced by a read-only row that states the guarantee.
//   captureHar / captureScreenshotsOnError — both require a browser, and this
//     project has no browser automation. Same disposition `set.browser` got on
//     2026-08-02: delete the control, do not keep a red dot over it forever.
//
// SCOPE, stated plainly: the policy is process-wide, not per-job.
// `scraperRuntimeFor` pushes the active profile's logging settings here as each
// job scope is built, so two concurrent jobs whose profiles disagree about the
// log level will both use whichever started last. Every *other* group in
// ScraperRuntime is per-job via AsyncLocalStorage; this one is not, because
// logBus is imported by the modules runtime.ts builds from and reaching for the
// runtime here would close an import cycle. Lines logged outside any job — the
// HTTP Inspector, a source probe, an export — are covered by the same policy,
// which is the behaviour a user expects from something called "Log Level".
// ---------------------------------------------------------------------------

const LEVEL_RANK: Record<ScraperLoggingSettings['level'], number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

let policy: ScraperLoggingSettings = DEFAULT_SCRAPER_LOGGING_SETTINGS;

/** Adopts a profile's Logging group. Called as each job scope is built. */
export function configureScraperLogging(next: ScraperLoggingSettings): void {
  const rotated = next.persistToDisk !== policy.persistToDisk
    || next.retentionDays !== policy.retentionDays;
  policy = next;
  if (rotated && next.persistToDisk) void pruneOldLogs();
}

/** Test seam — restores the shipped defaults. */
export function resetScraperLoggingPolicy(): void {
  policy = DEFAULT_SCRAPER_LOGGING_SETTINGS;
}

/**
 * Whether this line is recorded at all.
 *
 * An empty channel list means every channel — see SCRAPER_LOG_CHANNELS for why
 * that, and not an enumerated default, is the safe reading.
 */
export function acceptsLogLine(level: LogLevel, channel: string): boolean {
  if (LEVEL_RANK[policy.level] < LEVEL_RANK[level]) return false;
  if (policy.channels.length && !(policy.channels as readonly string[]).includes(channel)) {
    return false;
  }
  return true;
}

// ------------------------------------------------------------ disk sink ---

const LOG_DIR = 'logs';

function logFileFor(day: string, index: number): string {
  return scraperStorePath(path.join(LOG_DIR, index ? `scraper-${day}.${index}.log` : `scraper-${day}.log`));
}

function today(): string {
  return isoDateLocal(Date.now());
}

/**
 * Appends one line, rotating when `maxFileSizeMb` is reached.
 *
 * Serialised through a promise chain rather than fired in parallel: concurrent
 * `appendFile` calls to one path can interleave partial writes, and a log whose
 * lines are spliced together is worse than no log. Every failure is swallowed —
 * a full disk must not take down the scrape that was being logged.
 *
 * The current file and its size are held in memory. The first version re-`stat`ed
 * on every single line to find the write target, which a test caught: 40,000
 * lines took over twenty seconds. The cursor is keyed on the resolved directory
 * as well as the date, so changing the store root (or crossing midnight)
 * invalidates it without anyone having to remember to.
 */
let writeChain: Promise<void> = Promise.resolve();

interface WriteCursor {
  dir: string;
  day: string;
  index: number;
  bytes: number;
}

let cursor: WriteCursor | null = null;

function appendToDisk(line: LogLine): void {
  const maxBytes = Math.max(1, policy.maxFileSizeMb) * 1024 * 1024;
  const text = `${new Date().toISOString()} ${line.level.toUpperCase()} [${line.channel}]`
    + `${line.correlationId ? ` (${line.correlationId})` : ''} ${line.message}\n`;
  const size = Buffer.byteLength(text, 'utf-8');

  writeChain = writeChain.then(async () => {
    const dir = scraperStorePath(LOG_DIR);
    const day = today();

    if (!cursor || cursor.dir !== dir || cursor.day !== day) {
      // One stat per session, per day, per root — not per line. An existing
      // file from an earlier run has to be measured once so today's writes
      // continue it rather than restarting the ceiling.
      let bytes = 0;
      try {
        bytes = (await fsp.stat(logFileFor(day, 0))).size;
      } catch {
        bytes = 0;
      }
      cursor = { dir, day, index: 0, bytes };
    }

    if (cursor.bytes + size > maxBytes && cursor.bytes > 0) {
      cursor = { ...cursor, index: cursor.index + 1, bytes: 0 };
    }

    const target = logFileFor(cursor.day, cursor.index);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.appendFile(target, text, 'utf-8');
    cursor.bytes += size;
  }).catch(() => {
    // The cursor may now disagree with the disk, so make the next line
    // re-measure rather than trusting a count that a failed write invalidated.
    cursor = null;
  });
}

/** Deletes log files older than `retentionDays`. 0 means keep everything. */
export async function pruneOldLogs(): Promise<number> {
  if (policy.retentionDays <= 0) return 0;
  const dir = scraperStorePath(LOG_DIR);
  const cutoff = Date.now() - policy.retentionDays * 86_400_000;
  let removed = 0;
  try {
    for (const name of await fsp.readdir(dir)) {
      if (!name.startsWith('scraper-') || !name.endsWith('.log')) continue;
      const stamp = /^scraper-(\d{4}-\d{2}-\d{2})/.exec(name)?.[1];
      // The name is the authority, not mtime: an appended-to file keeps a fresh
      // mtime and would never expire.
      if (!stamp || Date.parse(`${stamp}T00:00:00Z`) >= cutoff) continue;
      await fsp.rm(path.join(dir, name), { force: true });
      removed += 1;
    }
  } catch {
    // No directory yet, or it is unreadable. Nothing to prune either way.
  }
  return removed;
}

/** Test seam — the files currently on disk, newest name first. */
export function scraperLogFiles(): string[] {
  try {
    return fs.readdirSync(scraperStorePath(LOG_DIR))
      .filter((name) => name.startsWith('scraper-') && name.endsWith('.log'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Test seam — resolves once every queued disk write has settled. */
export function flushScraperLogWrites(): Promise<void> {
  return writeChain;
}

/**
 * Redacts the values that must never reach a rendered log line.
 *
 * Deliberately pattern-based rather than key-based: lines are built from free
 * text (URLs, headers, error messages), so there is no key to look at by the
 * time a string arrives here.
 */
const REDACTIONS: { pattern: RegExp; replace: string }[] = [
  // `?token=…`, `&api_key=…`, `#access_token=…`
  {
    pattern: /([?&#](?:api[-_]?key|token|access[-_]?token|auth|password|passwd|pwd|secret|sid|session)=)[^&#\s]+/gi,
    replace: '$1‹redacted›',
  },
  // `Authorization: Bearer …`, `Cookie: …`. Deliberately greedy to the end of
  // the line: a credential header's value can contain spaces (`Bearer <jwt>`,
  // a multi-pair cookie), so stopping at the first whitespace would leave the
  // secret itself behind — which is exactly what the first version of this did.
  // Losing a trailing clause is the right side to err on.
  {
    pattern: /((?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi,
    replace: '$1‹redacted›',
  },
  // `https://user:pass@host`
  { pattern: /(\/\/)[^/\s:@]+:[^/\s@]+@/g, replace: '$1‹redacted›@' },
];

export function redactLogText(text: string): string {
  let out = text;
  for (const { pattern, replace } of REDACTIONS) out = out.replace(pattern, replace);
  return out;
}

let seq = 0;
const ring: LogLine[] = [];
const listeners = new Set<(line: LogLine) => void>();
const processEpoch = Date.now();

export interface LogOptions {
  /** Ties related lines together — a job id, a probe id, a request id. */
  correlationId?: string;
  /** Epoch to measure `offsetMs` against; defaults to process start. */
  since?: number;
}

export function scraperLog(
  level: LogLevel,
  channel: string,
  message: string,
  options: LogOptions = {},
): LogLine {
  seq += 1;
  const line: LogLine = {
    id: `log-${seq}`,
    offsetMs: Date.now() - (options.since ?? processEpoch),
    level,
    channel,
    // Unconditional, and deliberately so — see the policy note above. The
    // returned line is redacted whether or not it is recorded, because callers
    // that log the result of this call must not get the unredacted text back.
    message: redactLogText(message),
    correlationId: options.correlationId ?? '',
  };
  // Filtered lines are still constructed and returned: `scrapeResult` builds
  // its log from `scraperLogsFor`, and a caller that logs-and-uses would
  // otherwise get a different string depending on the log level. What the
  // policy decides is what is *recorded* — the ring, the listeners and the file.
  if (!acceptsLogLine(level, channel)) return line;
  ring.push(line);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
  if (policy.persistToDisk) appendToDisk(line);
  for (const listener of listeners) {
    try {
      listener(line);
    } catch {
      // A broken listener must not take the producer down with it.
    }
  }
  return line;
}

/** Subscribes to future lines. Returns an unsubscribe function. */
export function onScraperLog(listener: (line: LogLine) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The most recent lines, oldest first — what a newly opened Logs tab shows. */
export function recentScraperLogs(limit = 200): LogLine[] {
  return ring.slice(-Math.max(0, limit));
}

/** Lines belonging to one job, in order. Used to build a ScrapeResult. */
export function scraperLogsFor(correlationId: string): LogLine[] {
  return ring.filter((line) => line.correlationId === correlationId);
}

/** Test seam: drops the ring, every listener, and the adopted policy. */
export function resetScraperLogs(): void {
  ring.length = 0;
  listeners.clear();
  seq = 0;
  cursor = null;
  resetScraperLoggingPolicy();
}
