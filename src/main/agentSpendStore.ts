/**
 * The main-owned store for what the Agent has spent at cloud providers.
 *
 * A third sibling of `agentWorkspaceStore.ts` and `agentOperationalStore.ts`
 * rather than a section inside either, and the reason is the writer. Both of
 * those documents are written by the renderer: it reads the whole document,
 * edits it and writes it back. A spend row incremented by main in between those
 * two steps would be silently discarded by the write that followed. This
 * document is written **only** by main, on the completion of a request main
 * itself made, so the read-modify-write race cannot arise.
 *
 * Held in memory after the first read for the same reason: the ceiling is
 * consulted on the preflight of every cloud request, and a synchronous
 * `readFileSync` on main's event loop per request is exactly the kind of cost
 * this project treats as a product invariant. Main being the sole writer is what
 * makes the cache safe.
 *
 * The write is atomic (temp file + rename, `0o600`), matching its siblings: a
 * partial document is indistinguishable from a corrupt one on the next read, and
 * the next read fails closed to an empty ledger — which is the safe direction
 * here, because an empty ledger has no ceiling and refuses nothing, rather than
 * refusing everything on a total it cannot verify.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AiProviderId } from '../shared/aiProviders';
import {
  agentSpendPeriod,
  agentSpendTotals,
  agentSpendVerdict,
  emptyAgentSpendLedger,
  normalizeAgentSpendBudget,
  normalizeAgentSpendLedger,
  recordAgentSpend,
  type AgentSpendLedger,
  type AgentSpendTotals,
  type AgentSpendVerdict,
} from '../shared/agentSpendLedger';

const SPEND_FILE = 'spend-v1.json';

export interface AgentSpendSnapshot {
  ledger: AgentSpendLedger;
  /** The bucket the caller's "this month" means, resolved by main so the UI cannot disagree. */
  period: string;
  currentPeriod: AgentSpendTotals;
}

export interface AgentSpendStore {
  readonly filePath: string;
  read(): AgentSpendSnapshot;
  /** Sets or withdraws the monthly ceiling. Returns the document that reached disk. */
  setBudget(budgetUsd: number | null): AgentSpendSnapshot;
  /**
   * Adds one completed cloud request. `costUsd` of `undefined` means the user
   * has entered no rates for that provider, and is counted without being valued.
   */
  record(providerId: AiProviderId, costUsd: number | undefined): AgentSpendSnapshot;
  /**
   * The privacy control: erases the spending record, keeping the ceiling.
   *
   * Keeping the ceiling is deliberate. Clearing the record is a statement about
   * history, and silently withdrawing the ceiling with it would turn a "forget
   * what I spent" into "stop refusing anything", which is not what was asked
   * for and is not visible from the button that was pressed.
   */
  clear(): AgentSpendSnapshot;
  /** Whether a request estimated at `estimatedCostUsd` may run this month. */
  verdict(estimatedCostUsd: number | undefined): AgentSpendVerdict;
}

function readFile(filePath: string): AgentSpendLedger {
  try {
    return normalizeAgentSpendLedger(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return emptyAgentSpendLedger();
  }
}

function atomicWrite(filePath: string, ledger: AgentSpendLedger): void {
  const directory = path.dirname(filePath);
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(temporary, JSON.stringify(ledger, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporary, filePath);
  } finally {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // The destination was already committed or the temporary file vanished.
    }
  }
}

export function createAgentSpendStore(
  rootDirectory: string,
  now: () => number = Date.now,
): AgentSpendStore {
  const filePath = path.join(rootDirectory, 'agent', SPEND_FILE);
  let cached: AgentSpendLedger | null = null;

  const current = (): AgentSpendLedger => {
    if (!cached) cached = readFile(filePath);
    return cached;
  };

  const snapshot = (ledger: AgentSpendLedger): AgentSpendSnapshot => {
    const period = agentSpendPeriod(now());
    return { ledger, period, currentPeriod: agentSpendTotals(ledger, period) };
  };

  const commit = (ledger: AgentSpendLedger): AgentSpendSnapshot => {
    cached = ledger;
    atomicWrite(filePath, ledger);
    return snapshot(ledger);
  };

  return {
    filePath,
    read: () => snapshot(current()),
    setBudget: (budgetUsd) => commit({
      ...current(),
      budgetUsd: normalizeAgentSpendBudget(budgetUsd),
    }),
    record: (providerId, costUsd) => commit(
      recordAgentSpend(current(), providerId, costUsd, now()),
    ),
    clear: () => commit({ ...emptyAgentSpendLedger(), budgetUsd: current().budgetUsd }),
    verdict: (estimatedCostUsd) => agentSpendVerdict(
      current(),
      agentSpendPeriod(now()),
      estimatedCostUsd,
    ),
  };
}

let defaultStore: AgentSpendStore | null = null;

export function getAgentSpendStore(): AgentSpendStore {
  if (!defaultStore) defaultStore = createAgentSpendStore(app.getPath('userData'));
  return defaultStore;
}
