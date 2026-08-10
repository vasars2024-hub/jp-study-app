import {
  isAgentNavigationDestination,
  type AgentNavigationDestination,
} from '../../../shared/agentNavigation';
import type { AgentSettingsNavigationLink } from '../../../shared/agentNavigationBridge';

export function normalizeAgentSettingsNavigationLink(
  value: unknown,
): AgentSettingsNavigationLink | null {
  if (!isAgentNavigationDestination(value)) return null;
  const destination = value as AgentNavigationDestination;
  if (destination.section !== 'settings' || !destination.page) return null;
  return {
    section: 'settings',
    page: destination.page,
    ...(destination.controlId ? { controlId: destination.controlId } : {}),
    ...(destination.highlight === true ? { highlight: true } : {}),
  };
}

export interface AgentSettingsRenderedTarget {
  focus: HTMLElement;
  scroll: HTMLElement | null;
}

/**
 * Resolve only a target that is already rendered on the requested Settings
 * page. A control coordinate must be unique and visibly highlighted before the
 * main-process delivery can be acknowledged.
 */
export function agentSettingsRenderedTarget(
  pane: HTMLElement | null,
  destination: AgentSettingsNavigationLink,
): AgentSettingsRenderedTarget | null {
  if (!pane || pane.dataset.settingsPage !== destination.page) return null;
  if (!destination.controlId) return { focus: pane, scroll: null };

  const matches = [...pane.querySelectorAll<HTMLElement>('[data-setting-id]')]
    .filter((node) => node.dataset.settingId === destination.controlId);
  const target = matches.length === 1 ? matches[0] : null;
  const highlighted = target?.classList.contains('is-highlight')
    || Boolean(target?.closest('.os-set-card.is-highlight'));
  if (!target || !highlighted) return null;

  const focus = target.matches('button, input, select, textarea, a[href], [tabindex]')
    ? target
    : target.querySelector<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')
      ?? target;
  return { focus, scroll: target };
}

export function focusAgentSettingsRenderedTarget(target: AgentSettingsRenderedTarget): void {
  target.scroll?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (target.focus.tabIndex < 0 && target.focus === target.scroll) target.focus.tabIndex = -1;
  target.focus.focus({ preventScroll: true });
}

/**
 * How long one delivery keeps looking for its target before saying it is not
 * ready, and how often it looks while the document is hidden.
 *
 * A wall-clock budget rather than a frame count, because the frame is exactly
 * what a hidden window does not get.
 */
export const AGENT_SETTINGS_ACK_BUDGET_MS = 2000;
export const AGENT_SETTINGS_ACK_POLL_MS = 100;

/** The two clocks a document may offer, injected so this is testable without a browser. */
export interface AgentSettingsAckHost {
  visibility: () => DocumentVisibilityState;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (handle: number) => void;
}

export interface AgentSettingsAckScheduler {
  schedule: (callback: () => void) => void;
  cancelAll: () => void;
}

/**
 * Schedules an acknowledgement attempt on a clock that actually runs.
 *
 * This is the fix for the cold-open failure, and the reason it is a module of
 * its own. Chromium runs **no** `requestAnimationFrame` callbacks for a hidden
 * document — measured against this app at 0 frames in 600 ms while occluded, and
 * 30 in the same 600 ms once visible. A pop-out that main opened on the user's
 * approval is routinely occluded at the instant main delivers to it, so an
 * acknowledgement scheduled on rAF alone never ran at all in precisely the case
 * it existed for, and main could only read that silence as a refusal.
 *
 * Timers do still fire in a hidden document, throttled to roughly a second. So
 * visibility picks the clock per attempt instead of one being assumed, and a
 * window that becomes visible mid-poll gets frames again on the next attempt.
 */
export function createAgentSettingsAckScheduler(
  host: AgentSettingsAckHost,
  hiddenPollMs: number = AGENT_SETTINGS_ACK_POLL_MS,
): AgentSettingsAckScheduler {
  const frames = new Set<number>();
  const timers = new Set<number>();
  return {
    schedule(callback: () => void): void {
      if (host.visibility() === 'visible') {
        const frame = host.requestFrame(() => {
          frames.delete(frame);
          callback();
        });
        frames.add(frame);
        return;
      }
      const timer = host.setTimer(() => {
        timers.delete(timer);
        callback();
      }, hiddenPollMs);
      timers.add(timer);
    },
    cancelAll(): void {
      for (const frame of frames) host.cancelFrame(frame);
      for (const timer of timers) host.clearTimer(timer);
      frames.clear();
      timers.clear();
    },
  };
}
