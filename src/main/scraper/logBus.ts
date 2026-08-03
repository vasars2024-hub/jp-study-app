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

import type { LogLine } from '../../shared/scraperResults';

export type LogLevel = LogLine['level'];

const RING_SIZE = 2_000;

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
    message: redactLogText(message),
    correlationId: options.correlationId ?? '',
  };
  ring.push(line);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
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

/** Test seam: drops the ring and every listener. */
export function resetScraperLogs(): void {
  ring.length = 0;
  listeners.clear();
  seq = 0;
}
