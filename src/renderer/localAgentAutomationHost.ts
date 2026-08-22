/**
 * The claimant the main application never had.
 *
 * Measured 2026-08-22: `onLocalAgentTrigger` had exactly one production
 * subscriber in the whole repository — `BlancReadyToolPanels.tsx:459`, behind
 * Blanc's `local-agent` tool. So a scheduled automation ran only while the user
 * happened to be sitting on that one panel. Everywhere else the fire reached
 * nobody, main recorded it `missed`, and the per-day guard then suppressed it
 * until tomorrow. The schedule table was honest about it, which is worse, not
 * better: the product could say "nothing was listening" and could not do
 * anything about it.
 *
 * This host is what listens. It has no UI, mounts once per main window, and
 * does the smallest thing that makes a schedule mean something: plan the
 * automation and put the resulting task on the main-owned queue, where the
 * existing queue surfaces show it and the user runs it.
 *
 * Three decisions, all deliberate:
 *
 * - **Enqueue, never execute.** An automation is a *scheduled intent*, not
 *   standing consent to act unattended. `permissionCeiling` rides on the queue
 *   row so the level the automation was authored under still binds whenever the
 *   task is finally run — a ceiling, never a grant. Executing here would run
 *   tool operations with nobody watching, which no part of this product's
 *   permission model promises.
 * - **It registers only while the agent is enabled.** Registering regardless
 *   would consume the fire and let main record it `delivered`, when in fact
 *   nothing could have run it. Staying unregistered leaves the run `missed`,
 *   which is the truth.
 * - **`background`, so an open agent surface always wins.** The registry hands
 *   a fire to one handler; Blanc's panel registers `interactive` and outranks
 *   this, so a user watching the panel sees the plan happen there instead of it
 *   silently landing in the queue behind them.
 *
 * Known gap, deliberately left for its own slice: a plan that FAILS here is
 * invisible. Main records `delivered` — accurate, the fire did reach a handler —
 * and nothing anywhere distinguishes "delivered and queued" from "delivered and
 * the backend was down". Closing that needs a renderer→main report channel and a
 * third outcome in `shared/localAgentAutomationRuns.ts`.
 */

import type { AgentAutomation } from '../shared/localAgentAutomation';
import type { AgentTask } from '../shared/localAgent';
import { getActiveAgentProfile, underPermissionCeiling } from '../shared/localAgentProfiles';
import { selectAgentMemoryContext } from '../shared/localAgentMemory';
import { enqueueAgentTask } from '../shared/localAgentTaskQueue';
import { initAgentOperationalState } from './agentOperationalClient';
import { readAgentStepApprovalContext } from './agentStepApprovalClient';
import { t as translate } from './i18n';
import { loadLocalAgentMemory } from './localAgentMemoryStore';
import { loadLocalAgentProfiles } from './localAgentProfilesStore';
import {
  loadLocalAgentSettings,
  onLocalAgentSettingsChanged,
} from './localAgentSettingsStore';
import {
  loadLocalAgentTaskQueue,
  saveLocalAgentTaskQueueDurably,
} from './localAgentTaskQueueStore';
import { registerLocalAgentTriggerHandler } from './localAgentTriggerRunner';

export type ScheduledAutomationFailureCode =
  | 'agent-disabled'
  | 'planner-unavailable'
  | 'no-approved-action'
  | 'task-conflict'
  | 'store-failed';

export type ScheduledAutomationResult =
  | { ok: true; taskId: string }
  | { ok: false; code: ScheduledAutomationFailureCode };

const MEMORY_CONTEXT_CHARACTERS = 4_000;

/**
 * Plans one scheduled automation and enqueues the task it produced.
 *
 * Separate from the host so it is testable without a window lifecycle, and so a
 * future surface that wants to run an automation on demand has one function to
 * call rather than a second copy of this sequence.
 */
export async function runScheduledAutomation(
  entry: AgentAutomation,
  now = Date.now(),
): Promise<ScheduledAutomationResult> {
  const settings = loadLocalAgentSettings();
  if (!settings.enabled || settings.backend === 'disabled') {
    return { ok: false, code: 'agent-disabled' };
  }

  let authority: ReturnType<typeof readAgentStepApprovalContext>;
  let profile: ReturnType<typeof getActiveAgentProfile>;
  try {
    await initAgentOperationalState();
    authority = readAgentStepApprovalContext(translate);
    profile = getActiveAgentProfile(loadLocalAgentProfiles());
  } catch {
    return { ok: false, code: 'store-failed' };
  }

  const plan = window.api?.localAgentPlan;
  if (typeof plan !== 'function') return { ok: false, code: 'planner-unavailable' };

  let response: Awaited<ReturnType<typeof plan>>;
  try {
    response = await plan({
      objective: entry.objective,
      // The automation's own level bounds the request that builds the approved
      // operation set, so the planner cannot propose a step the entry's stated
      // permission forbids and then have it refused at execution.
      settings: underPermissionCeiling(settings, entry.permission),
      profile,
      // Profile-narrowed, matching the conversation planner rather than Blanc's
      // panel. Unattended work takes the stricter of the two available sets.
      availableOperations: authority.allowedOperations,
      memories: settings.memoryEnabled && settings.memoryScope.length > 0
        ? selectAgentMemoryContext(loadLocalAgentMemory(), entry.objective, {
          maxCharacters: MEMORY_CONTEXT_CHARACTERS,
          categories: settings.memoryScope,
        })
        : [],
    });
  } catch {
    // Backend/model exception text can carry a local model path. The code is the
    // safe surface, exactly as the conversation planner treats it.
    return { ok: false, code: 'planner-unavailable' };
  }

  if (!response.ok) return { ok: false, code: 'planner-unavailable' };
  const task = response.task as AgentTask | undefined;
  if (!task) return { ok: false, code: 'no-approved-action' };

  try {
    const current = loadLocalAgentTaskQueue();
    // A backend replaying a task id must not silently replace a row that is
    // already queued — including one this same automation produced earlier.
    if (current.items.some((item) => item.id === task.id)) {
      return { ok: false, code: 'task-conflict' };
    }
    const queue = enqueueAgentTask(current, task, 0, now, undefined, entry.permission);
    // Durable, not the synchronous setter: an unattended run has no user to
    // notice that the queue reverted, so "planned" must mean "main committed it".
    const receipt = await saveLocalAgentTaskQueueDurably(queue);
    if (!receipt.ok) return { ok: false, code: 'store-failed' };
    return { ok: true, taskId: task.id };
  } catch {
    return { ok: false, code: 'store-failed' };
  }
}

/**
 * Installs the host for the lifetime of the window and returns its uninstall.
 *
 * Registration follows `settings.enabled` rather than being taken once at boot:
 * enabling the agent must start claiming without a restart, and disabling it
 * must stop — otherwise a disabled agent would keep consuming fires and main
 * would keep recording them `delivered`.
 */
export function installLocalAgentAutomationHost(): () => void {
  let unregister: (() => void) | null = null;

  const sync = (enabled: boolean): void => {
    if (enabled && !unregister) {
      unregister = registerLocalAgentTriggerHandler('background', (entry) => {
        void runScheduledAutomation(entry);
      });
      return;
    }
    if (!enabled && unregister) {
      unregister();
      unregister = null;
    }
  };

  sync(loadLocalAgentSettings().enabled);
  const stopWatching = onLocalAgentSettingsChanged((next) => sync(next.enabled));

  return () => {
    stopWatching();
    unregister?.();
    unregister = null;
  };
}
