/**
 * Settings for Blanc's own mechanics (Flow, Capture inbox, memory budget).
 *
 * Blanc's identity is the lean, keyboard-first toolbox, so these are the knobs
 * that trade speed against memory: how many tools stay warm, which ones never
 * unload, the RAM budget the top-bar chip measures against, and the default
 * sprint for a Flow run. Persisted through the guarded writer
 * (`writeLocalStorageJson`) — this store is the value's home, not a cache.
 */
import { writeLocalStorageJson } from '../../localStorageWrite';

export type FlowSprintMinutes = 0 | 10 | 20 | 30;

export const FLOW_SPRINT_OPTIONS: readonly FlowSprintMinutes[] = [0, 10, 20, 30];

export interface BlancMechSettings {
  /** Recently used tools kept mounted (warm) besides the active one. 0 = only the active tool. */
  warmToolLimit: number;
  /** Tools that never unload while the toolbox is loaded ("keep warm"). */
  keepWarm: string[];
  /** Show this app's memory in the top bar. */
  ramChip: boolean;
  /** The chip turns amber above this, in megabytes. */
  ramBudgetMb: number;
  /** Trim automatically (at most once a minute) while over budget. */
  autoTrim: boolean;
  /** Default time box for a Flow run, minutes. 0 = no time box. */
  flowSprintMinutes: FlowSprintMinutes;
  /** Flow visits the Capture inbox after the cards when it holds anything. */
  flowIncludeInbox: boolean;
  /** Flow ends by offering the book read most recently. */
  flowIncludeReading: boolean;
  /** Look up a captured word's reading and meaning when the inbox is opened. */
  captureLookup: boolean;
}

export const WARM_TOOL_LIMIT_MAX = 8;
export const RAM_BUDGET_MIN_MB = 100;
export const RAM_BUDGET_MAX_MB = 8000;

export const DEFAULT_BLANC_MECH_SETTINGS: BlancMechSettings = {
  warmToolLimit: 3,
  keepWarm: [],
  ramChip: true,
  ramBudgetMb: 400,
  autoTrim: false,
  flowSprintMinutes: 0,
  flowIncludeInbox: true,
  flowIncludeReading: true,
  captureLookup: true,
};

const KEY = 'jp-study.blanc.mechanics.v1';

type Listener = (settings: BlancMechSettings) => void;
const listeners = new Set<Listener>();
let cached: BlancMechSettings | null = null;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeBlancMechSettings(value: unknown): BlancMechSettings {
  const d = DEFAULT_BLANC_MECH_SETTINGS;
  if (!value || typeof value !== 'object') return { ...d, keepWarm: [] };
  const input = value as Partial<Record<keyof BlancMechSettings, unknown>>;
  const sprint = Number(input.flowSprintMinutes);
  const keepWarm = Array.isArray(input.keepWarm)
    ? [...new Set(input.keepWarm.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 64))].slice(0, 16)
    : [];
  return {
    warmToolLimit: clampInt(input.warmToolLimit, 0, WARM_TOOL_LIMIT_MAX, d.warmToolLimit),
    keepWarm,
    ramChip: input.ramChip !== false,
    ramBudgetMb: clampInt(input.ramBudgetMb, RAM_BUDGET_MIN_MB, RAM_BUDGET_MAX_MB, d.ramBudgetMb),
    autoTrim: input.autoTrim === true,
    flowSprintMinutes: (FLOW_SPRINT_OPTIONS as readonly number[]).includes(sprint)
      ? (sprint as FlowSprintMinutes)
      : d.flowSprintMinutes,
    flowIncludeInbox: input.flowIncludeInbox !== false,
    flowIncludeReading: input.flowIncludeReading !== false,
    captureLookup: input.captureLookup !== false,
  };
}

export function loadBlancMechSettings(): BlancMechSettings {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = sanitizeBlancMechSettings(raw ? JSON.parse(raw) : null);
  } catch {
    cached = sanitizeBlancMechSettings(null);
  }
  return cached;
}

export function saveBlancMechSettings(patch: Partial<BlancMechSettings>): BlancMechSettings {
  const next = sanitizeBlancMechSettings({ ...loadBlancMechSettings(), ...patch });
  cached = next;
  writeLocalStorageJson(KEY, next);
  for (const listener of listeners) listener(next);
  return next;
}

export function onBlancMechSettingsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetBlancMechSettings(): BlancMechSettings {
  return saveBlancMechSettings({ ...DEFAULT_BLANC_MECH_SETTINGS, keepWarm: [] });
}

/** Test seam: forget the cached copy (subscribers stay, as module-level ones would). */
export function resetBlancMechSettingsCacheForTests(): void {
  cached = null;
}
