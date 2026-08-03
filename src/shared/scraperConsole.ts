// The Script Console's command allow-list.
//
// The page this feeds renders inside the app's own renderer process. Nothing a
// user types there may ever be executed: an `eval` in that context runs with
// renderer privileges over the user's decks, settings and the entire IPC
// surface, and a settings toggle in front of it is a speed bump, not a security
// boundary. So there is no evaluator. What the console offers instead is the
// thing its own subtitle already promises — a fixed list of read-only
// inspection commands, matched here by exact id and answered from live state.
//
// The list, the resolver and the formatter live in shared/ so that property is
// testable without a renderer: `resolveConsoleCommand` can only ever return a
// member of SCRAPER_CONSOLE_COMMANDS, and every other input — including one
// that names an inherited Object property — is a miss.
//
// Text belongs to the caller. Everything returned from here is either data the
// user asked to see or a machine-readable status the page renders with its own
// strings, so no chrome is stranded in shared/.

import { SCRAPER_METHODS, type ScraperMethod, type ScraperPluginInfo } from './scraperIpc';
import {
  isRunningStage,
  type ExportRecord,
  type LogLine,
  type ScrapeJobSummary,
  type SourceStatus,
  type SystemStats,
} from './scraperResults';

export type ScraperConsoleCommandId =
  | 'help'
  | 'backend.capabilities'
  | 'system.stats'
  | 'jobs.active'
  | 'jobs.recent'
  | 'sources.health'
  | 'plugins.installed'
  | 'exports.recent'
  | 'profile.active'
  | 'logs.tail';

export interface ScraperConsoleCommand {
  id: ScraperConsoleCommandId;
  /**
   * The port method that answers this command, or '' when it is answered from
   * state the renderer already holds. Used to mark a command whose backend is
   * absent, so the console never presents sample data as a live reading.
   */
  requires: ScraperMethod | '';
}

/**
 * Frozen, and the only thing the resolver can return. Order is the order the
 * command palette renders in.
 */
export const SCRAPER_CONSOLE_COMMANDS: readonly ScraperConsoleCommand[] = Object.freeze([
  { id: 'help', requires: '' },
  { id: 'backend.capabilities', requires: '' },
  { id: 'system.stats', requires: 'systemStats' },
  { id: 'jobs.active', requires: 'listJobs' },
  { id: 'jobs.recent', requires: 'listJobs' },
  { id: 'sources.health', requires: 'listSources' },
  { id: 'plugins.installed', requires: 'listPlugins' },
  { id: 'exports.recent', requires: 'listExports' },
  { id: 'profile.active', requires: '' },
  { id: 'logs.tail', requires: 'tailLogs' },
] as const satisfies readonly ScraperConsoleCommand[]);

export const SCRAPER_CONSOLE_COMMAND_IDS: readonly ScraperConsoleCommandId[] =
  SCRAPER_CONSOLE_COMMANDS.map((command) => command.id);

/** The active profile, flattened to the handful of values a run actually uses. */
export interface ScraperConsoleProfile {
  profileId: string;
  profileName: string;
  preset: string;
  concurrentRequests: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  crawlDelayMs: number;
  maxRequestsPerMinute: number;
  respectRobotsTxt: boolean;
  cacheMode: string;
  sourcesEnabled: number;
}

/**
 * What the console can read. Structural on purpose: the page passes an adapter
 * over the live ScraperPort, and a test passes stubs, without shared/ ever
 * importing renderer code.
 */
export interface ScraperConsoleSource {
  backendCapabilities(): Promise<readonly string[]>;
  systemStats(): Promise<SystemStats>;
  listJobs(): Promise<ScrapeJobSummary[]>;
  listSources(): Promise<SourceStatus[]>;
  listPlugins(): Promise<ScraperPluginInfo[]>;
  listExports(): Promise<ExportRecord[]>;
  activeProfile(): ScraperConsoleProfile;
  recentLogs(): readonly LogLine[];
}

export type ScraperConsoleStatus = 'ok' | 'unknown-command' | 'failed';

export interface ScraperConsoleResult {
  /** '' when the input matched no command. */
  id: ScraperConsoleCommandId | '';
  /** Exactly what the user typed, trimmed — echoed back into the transcript. */
  input: string;
  status: ScraperConsoleStatus;
  /** The answer, already formatted. Empty when status is not 'ok'. */
  output: string;
  /**
   * False when the command's backend method is absent, which means the numbers
   * came from the sample-data port. The page labels the row rather than letting
   * a fixture pass for a reading.
   */
  live: boolean;
  /** A backend failure message; '' otherwise. Not chrome — it comes from the error. */
  detail: string;
}

/** How many rows the list commands return. Long enough to be useful, short enough to read. */
const LIST_LIMIT = 12;

/**
 * Exact match against the allow-list, and nothing else.
 *
 * Deliberately a find over the frozen array rather than an index into an object
 * literal: the object form answered `constructor`, `toString` and `__proto__`
 * with inherited members of Object.prototype, which is how a console that
 * "executes nothing" still ends up handing back a function.
 */
export function resolveConsoleCommand(input: string): ScraperConsoleCommand | null {
  const wanted = input.trim().toLowerCase();
  if (!wanted) return null;
  return SCRAPER_CONSOLE_COMMANDS.find((command) => command.id === wanted) ?? null;
}

/** Pretty-prints a command's answer. Never throws, whatever it is handed. */
export function formatConsoleValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value ?? null, null, 2);
    return typeof text === 'string' ? text : String(value);
  } catch {
    // A cycle, a BigInt — a console that crashes on its own output is worse
    // than one that admits the shape defeated it.
    return String(value);
  }
}

function jobLine(job: ScrapeJobSummary) {
  return {
    id: job.id,
    title: job.titleEn || job.titleJa,
    stage: job.stage,
    found: job.found,
    failed: job.failed,
    ageMinutes: job.ageMinutes,
  };
}

async function answer(
  id: ScraperConsoleCommandId,
  source: ScraperConsoleSource,
): Promise<unknown> {
  switch (id) {
    case 'help':
      return { commands: [...SCRAPER_CONSOLE_COMMAND_IDS] };
    case 'backend.capabilities': {
      const implemented = new Set(await source.backendCapabilities());
      return {
        implemented: SCRAPER_METHODS.filter((method) => implemented.has(method)),
        sampleData: SCRAPER_METHODS.filter((method) => !implemented.has(method)),
      };
    }
    case 'system.stats':
      return source.systemStats();
    case 'jobs.active': {
      const running = (await source.listJobs()).filter((job) => isRunningStage(job.stage));
      return { count: running.length, jobs: running.slice(0, LIST_LIMIT).map(jobLine) };
    }
    case 'jobs.recent': {
      const jobs = await source.listJobs();
      return { count: jobs.length, jobs: jobs.slice(0, LIST_LIMIT).map(jobLine) };
    }
    case 'sources.health':
      return (await source.listSources()).slice(0, LIST_LIMIT).map((entry) => ({
        id: entry.id,
        host: entry.host,
        kind: entry.kind,
        enabled: entry.enabled,
        health: entry.health,
        latencyMs: entry.latencyMs,
      }));
    case 'plugins.installed':
      return (await source.listPlugins()).slice(0, LIST_LIMIT).map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        enabled: plugin.enabled,
        compatible: plugin.compatible,
      }));
    case 'exports.recent':
      return (await source.listExports()).slice(0, LIST_LIMIT).map((record) => ({
        format: record.format,
        records: record.records,
        outcome: record.outcome,
        ageMinutes: record.ageMinutes,
      }));
    case 'profile.active':
      return source.activeProfile();
    case 'logs.tail':
      return source.recentLogs().slice(0, LIST_LIMIT).map((line) => ({
        level: line.level,
        channel: line.channel,
        message: line.message,
      }));
    default: {
      // Unreachable while the switch covers the union; the compiler proves it,
      // and this keeps a future id from silently returning undefined.
      const never: never = id;
      throw new Error(`Unhandled console command: ${String(never)}`);
    }
  }
}

/**
 * Runs one allow-listed command. Input that is not on the list is reported as
 * a miss — it is never passed to anything that could evaluate it.
 */
export async function runConsoleCommand(
  input: string,
  source: ScraperConsoleSource,
): Promise<ScraperConsoleResult> {
  const typed = input.trim();
  const command = resolveConsoleCommand(typed);
  if (!command) {
    return { id: '', input: typed, status: 'unknown-command', output: '', live: true, detail: '' };
  }

  let live = true;
  if (command.requires) {
    try {
      live = (await source.backendCapabilities()).includes(command.requires);
    } catch {
      // A backend that cannot say what it implements is a backend the port is
      // already falling back for. Say so rather than claiming a live reading.
      live = false;
    }
  }

  try {
    return {
      id: command.id,
      input: typed,
      status: 'ok',
      output: formatConsoleValue(await answer(command.id, source)),
      live,
      detail: '',
    };
  } catch (reason) {
    return {
      id: command.id,
      input: typed,
      status: 'failed',
      output: '',
      live,
      detail: reason instanceof Error ? reason.message : String(reason),
    };
  }
}
