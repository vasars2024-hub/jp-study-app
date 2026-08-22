/**
 * The automation scheduler.
 *
 * It used to be driven by the renderer: `localAgentAutomationStore.ts` read the
 * schedule out of `localStorage` and pushed it over a `localAgent:syncAutomations`
 * channel, and main held whatever the last renderer happened to send. That meant
 * the schedule did not exist in main until some window had booted and pushed it,
 * two windows could push two different schedules, and the source of truth was a
 * renderer-owned string.
 *
 * Now the schedule lives in the main-owned operational store and this module
 * reads it directly — at startup and again on every store write, from whichever
 * window made it. The renderer push channel is gone; there is nothing left for a
 * renderer to tell main about the schedule that main does not already own.
 *
 * `localAgent:trigger` remains: that is main → renderer, and it is the whole
 * point of the scheduler.
 *
 * What it did NOT do, until 2026-08-22, is know whether anyone caught it. The
 * push went to every open window, and the only subscriber in the repository was
 * `BlancReadyToolPanels.tsx`, behind Blanc's `local-agent` tool — so in the main
 * app the trigger landed nowhere, the per-day `fired` guard then suppressed it
 * for the rest of the day, and no surface anywhere said so. Measured live: one
 * due automation, one trigger delivered to the main window, zero queue rows and
 * zero history entries afterwards.
 *
 * Two changes fix that, and they are the same mechanism:
 *
 * - **Delivery is claimed, not broadcast.** A renderer that actually runs
 *   automations calls `localAgent:claimTriggers`; the fire goes to exactly one
 *   claimant. Broadcasting was also a latent duplication defect — two windows
 *   sitting on Blanc's agent tool would each plan the same automation and each
 *   enqueue it.
 * - **A fire with no claimant is recorded as `missed`**, in the operational
 *   store's own `automationRuns` section. "Nothing was listening" is now a state
 *   the product can show instead of silence.
 */

import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import { automationDueAt, type AgentAutomation } from '../shared/localAgentAutomation';
import {
  appendAgentAutomationRun,
  emptyAgentAutomationRunLog,
  type AgentAutomationRun,
} from '../shared/localAgentAutomationRuns';
import {
  getAgentOperationalStore,
  type AgentOperationalStore,
} from './agentOperationalStore';

let schedules: AgentAutomation[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let operationalStore: AgentOperationalStore | null = null;
const fired = new Set<string>();
/**
 * `webContents.id` of every renderer that has said it runs automations, in the
 * order they said it. Insertion order is the tie-break after focus, so delivery
 * is deterministic rather than dependent on `getAllWindows()` ordering.
 */
const claims = new Set<number>();

function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function liveClaimants(): WebContents[] {
  const alive = new Map<number, WebContents>();
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    alive.set(window.webContents.id, window.webContents);
  }
  const claimants: WebContents[] = [];
  for (const id of claims) {
    const contents = alive.get(id);
    if (contents) claimants.push(contents);
    else claims.delete(id);
  }
  return claimants;
}

/**
 * Delivers to one claimant and reports how many were eligible.
 *
 * The focused window wins when it has claimed, because that is the window whose
 * status line the user is looking at; otherwise the earliest claimant does. The
 * count is returned rather than a boolean so the recorded run can carry it —
 * a delivered run with a count above one is the evidence that some future change
 * reintroduced fan-out.
 */
function deliver(automation: AgentAutomation): number {
  const claimants = liveClaimants();
  if (!claimants.length) return 0;
  const focused = BrowserWindow.getFocusedWindow();
  const target = (focused && !focused.isDestroyed()
    && claimants.find((contents) => contents.id === focused.webContents.id))
    || claimants[0];
  target.send('localAgent:trigger', automation);
  return claimants.length;
}

function recordRuns(runs: AgentAutomationRun[]): void {
  if (!runs.length || !operationalStore) return;
  const store = operationalStore;
  const current = store.read();
  let log = current.automationRuns ?? emptyAgentAutomationRunLog();
  for (const run of runs) log = appendAgentAutomationRun(log, run);
  store.write({ ...current, automationRuns: log });
}

function tick(): void {
  const now = new Date();
  const day = dayKey(now);
  const runs: AgentAutomationRun[] = [];
  for (const automation of schedules) {
    if (!automationDueAt(automation, now)) continue;
    const key = `${automation.id}:${day}:${automation.time}`;
    if (fired.has(key)) continue;
    fired.add(key);
    const handlers = deliver(automation);
    runs.push({
      automationId: automation.id,
      at: now.getTime(),
      outcome: handlers > 0 ? 'delivered' : 'missed',
      handlers,
    });
  }
  for (const key of fired) if (!key.includes(`:${day}:`)) fired.delete(key);
  // Written after the loop, once. The store's write wakes this module's own
  // subscriber, which re-enters `tick`; every key it would look at is already in
  // `fired`, so the nested pass collects nothing and cannot recurse.
  recordRuns(runs);
}

function apply(entries: readonly AgentAutomation[]): void {
  // Already normalized by the store on read and on write; re-normalizing here
  // would only hide a store defect.
  schedules = [...entries];
  if (!schedules.length) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  if (!timer) timer = setInterval(tick, 30_000);
  tick();
}

/**
 * Starts the scheduler against the main-owned store.
 *
 * The exported name is unchanged so `src/main.ts` — which is carrying another
 * track's uncommitted work — needs no edit. It still describes what happens:
 * this wires the scheduler's main/renderer surface, which is now the
 * `localAgent:trigger` push alone.
 */
export function registerLocalAgentSchedulerIpc(
  resolveStore: () => AgentOperationalStore = getAgentOperationalStore,
): void {
  const store = resolveStore();
  operationalStore = store;
  // Removed first so a second registration in the same process — a test, or a
  // re-init after `stopLocalAgentScheduler` — replaces the handler instead of
  // throwing on a duplicate channel.
  ipcMain.removeHandler('localAgent:claimTriggers');
  ipcMain.removeHandler('localAgent:releaseTriggers');
  ipcMain.handle('localAgent:claimTriggers', (event): boolean => {
    claims.add(event.sender.id);
    return true;
  });
  ipcMain.handle('localAgent:releaseTriggers', (event): boolean => {
    claims.delete(event.sender.id);
    return true;
  });
  unsubscribe?.();
  unsubscribe = store.subscribe((state) => apply(state.automations));
  apply(store.read().automations);
}

/**
 * Test seam for the claim registry. A renderer claims over IPC; a unit test has
 * no `ipcMain`, and asserting delivery through a stubbed `ipcMain.handle` would
 * be asserting the stub.
 */
export function claimLocalAgentTriggersForTesting(webContentsId: number): () => void {
  claims.add(webContentsId);
  return () => claims.delete(webContentsId);
}

export function stopLocalAgentScheduler(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearInterval(timer);
  timer = null;
  schedules = [];
  fired.clear();
  claims.clear();
  operationalStore = null;
}
