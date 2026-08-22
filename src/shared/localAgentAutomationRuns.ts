/**
 * What happened when a scheduled automation came due.
 *
 * The scheduler in `main/localAgentScheduler.ts` fires `localAgent:trigger` at
 * every window. Until this module existed, that push was the *entire* record: if
 * no renderer happened to be listening, the automation was silently dropped, and
 * the per-day `fired` guard then made sure it never came round again that day.
 * Measured live on 2026-08-22 against the running app — one due automation, one
 * trigger delivered to the main window, **zero** queue rows and **zero** history
 * entries afterwards. The feature reported nothing, because there was nothing
 * anywhere for it to report from.
 *
 * So a fire now writes down its own outcome. Two rules shape the row:
 *
 * 1. **No free text.** The row names the automation by `automationId` only. The
 *    name and objective are user-authored strings that already live in the
 *    schedule section of the same document; copying them here would duplicate
 *    the exposure and outlive the automation they came from. A run whose
 *    automation has since been deleted renders as a deleted automation, which is
 *    the truth, rather than as a preserved copy of a string the user removed.
 * 2. **`missed` is a first-class outcome, not an absent row.** "Nothing was
 *    listening" and "this never came due" are different states and a reader must
 *    be able to tell them apart. That distinction is the whole reason the
 *    section exists, so it is recorded explicitly.
 *
 * Retention is deliberately much shorter than the operation history's ninety
 * days: this answers "did my schedule run recently", an operational question
 * with a short useful life, not "what has this thing done to my data".
 */

export type AgentAutomationRunOutcome = 'delivered' | 'missed';

export interface AgentAutomationRun {
  /** The automation's id. Resolve the display name from the live schedule. */
  automationId: string;
  at: number;
  outcome: AgentAutomationRunOutcome;
  /**
   * How many renderers claimed the trigger. `0` is exactly what `missed` means,
   * and it is kept rather than implied because a delivered run's count is the
   * only evidence that delivery is single-target — see the scheduler's claim
   * registry for why more than one would be a defect.
   */
  handlers: number;
}

export interface AgentAutomationRunLog {
  version: 1;
  runs: AgentAutomationRun[];
}

export const AGENT_AUTOMATION_RUN_LIMIT = 100;
export const AGENT_AUTOMATION_RUN_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

const OUTCOMES: ReadonlySet<string> = new Set<AgentAutomationRunOutcome>([
  'delivered',
  'missed',
]);

export function emptyAgentAutomationRunLog(): AgentAutomationRunLog {
  return { version: 1, runs: [] };
}

function normalizeRun(input: unknown): AgentAutomationRun | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const automationId = typeof raw.automationId === 'string' ? raw.automationId.trim() : '';
  const outcome = typeof raw.outcome === 'string' ? raw.outcome : '';
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) && raw.at >= 0
    ? Math.floor(raw.at)
    : null;
  if (!automationId || at === null || !OUTCOMES.has(outcome)) return null;
  const handlers = typeof raw.handlers === 'number' && Number.isFinite(raw.handlers)
    ? Math.max(0, Math.floor(raw.handlers))
    : 0;
  return {
    automationId: automationId.slice(0, 120),
    at,
    outcome: outcome as AgentAutomationRunOutcome,
    handlers,
  };
}

/**
 * Total, like the other section normalizers: a malformed row is dropped and the
 * rest survives. Rows are not deduplicated by automation id — the same
 * automation running on two days is two runs, and that is the point.
 */
export function normalizeAgentAutomationRunLog(input: unknown): AgentAutomationRunLog {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return emptyAgentAutomationRunLog();
  }
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1) return emptyAgentAutomationRunLog();
  const rows = Array.isArray(raw.runs) ? raw.runs : [];
  const runs: AgentAutomationRun[] = [];
  for (const row of rows) {
    const run = normalizeRun(row);
    if (run) runs.push(run);
  }
  runs.sort((left, right) => right.at - left.at);
  return { version: 1, runs: runs.slice(0, AGENT_AUTOMATION_RUN_LIMIT) };
}

export function appendAgentAutomationRun(
  log: AgentAutomationRunLog,
  run: AgentAutomationRun,
): AgentAutomationRunLog {
  return normalizeAgentAutomationRunLog({ version: 1, runs: [run, ...log.runs] });
}

/**
 * Drops rows past the retention window. Returns the SAME object when nothing
 * expires, so a prune that changes nothing cannot be mistaken for a write.
 */
export function pruneAgentAutomationRunLog(
  log: AgentAutomationRunLog,
  now: number,
): AgentAutomationRunLog {
  const cutoff = now - AGENT_AUTOMATION_RUN_RETENTION_MS;
  const runs = log.runs.filter((run) => run.at >= cutoff);
  if (runs.length === log.runs.length) return log;
  return { version: 1, runs };
}

/**
 * The most recent run for one automation, or `null` if it has never fired.
 *
 * Three states, not two, and the third is the one the surface exists for:
 * *delivered*, *missed*, and *never run since the record began*. A `null` here
 * means only that — it is not evidence that the automation never came due,
 * because the log's retention window is fourteen days and a run older than that
 * is gone. A reader that renders `null` as "never" would be asserting more than
 * the data supports.
 *
 * `normalizeAgentAutomationRunLog` sorts newest-first, so the first match wins.
 */
export function latestAgentAutomationRun(
  log: AgentAutomationRunLog,
  automationId: string,
): AgentAutomationRun | null {
  return log.runs.find((run) => run.automationId === automationId) ?? null;
}
