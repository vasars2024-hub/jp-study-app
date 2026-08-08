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
 */

import { BrowserWindow } from 'electron';
import { automationDueAt, type AgentAutomation } from '../shared/localAgentAutomation';
import {
  getAgentOperationalStore,
  type AgentOperationalStore,
} from './agentOperationalStore';

let schedules: AgentAutomation[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
const fired = new Set<string>();

function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function broadcast(automation: AgentAutomation): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('localAgent:trigger', automation);
  }
}

function tick(): void {
  const now = new Date();
  const day = dayKey(now);
  for (const automation of schedules) {
    if (!automationDueAt(automation, now)) continue;
    const key = `${automation.id}:${day}:${automation.time}`;
    if (fired.has(key)) continue;
    fired.add(key);
    broadcast(automation);
  }
  for (const key of fired) if (!key.includes(`:${day}:`)) fired.delete(key);
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
  unsubscribe?.();
  unsubscribe = store.subscribe((state) => apply(state.automations));
  apply(store.read().automations);
}

export function stopLocalAgentScheduler(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearInterval(timer);
  timer = null;
  schedules = [];
  fired.clear();
}
