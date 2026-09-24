/**
 * The renderer's single source of "can AI run here".
 *
 * Every AI surface reads `useAiReadiness()` and follows one rule (see
 * `shared/aiSetup.ts`): hidden while "Use AI features" is off, one "Set up AI"
 * affordance while not ready, running when ready.
 *
 * Main owns the facts (switch, engine, provider, keys, installed models); the
 * Agent's own enable switch and model pick come from `localAgentSettingsStore`.
 * One module-level snapshot is shared by every hook in the window, refreshed:
 *  - when main pushes a switch change (`aiSetup:changed`),
 *  - when this window writes an engine, provider or key (`notifyAiSetupChanged`),
 *  - when another window did (a localStorage bump — the renderer partition is
 *    shared, so `storage` reaches every window),
 *  - when the offline model's download finishes or is deleted,
 *  - and when the window regains focus, as the backstop.
 */
import { useEffect, useState } from 'react';
import {
  AI_SETTINGS_PAGE_ID,
  deriveAiReadiness,
  normalizeAiSetupStatus,
  pendingAiSetupStatus,
  type AiReadiness,
  type AiSetupStatus,
} from '../shared/aiSetup';
import { DEFAULT_LOCAL_MODEL_ASSET_ID } from '../shared/localAgentModels';
import { loadLocalAgentSettings, onLocalAgentSettingsChanged } from './localAgentSettingsStore';
import { openSectionSurface } from './sectionSurface';

const BUMP_KEY = 'jp-ai-setup-bump-v1';
/** A settings navigation waiting for a Settings window that is not open yet. */
export const PENDING_SETTINGS_NAV_KEY = 'jp-settings-pending-nav-v1';

interface AiSetupBridge {
  aiSetupStatus?: () => Promise<AiSetupStatus>;
  aiSetupSetEnabled?: (enabled: boolean) => Promise<AiSetupStatus>;
  onAiSetupChanged?: (cb: (status: AiSetupStatus) => void) => () => void;
  onAssetStatus?: (cb: (status: { id: string; state: string }) => void) => () => void;
}

function bridge(): AiSetupBridge | null {
  if (typeof window === 'undefined') return null;
  return ((window as { api?: AiSetupBridge }).api) ?? null;
}

let status: AiSetupStatus | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
let wired = false;

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Marks the document while AI is off, so every AI entry point in this window can
 * hide with one attribute (`data-ai-entry`) instead of each surface importing
 * this store. Hidden rather than disabled: a feature the user switched off is
 * not broken, and a greyed button would say it was.
 */
const HIDE_STYLE_ID = 'jp-ai-off-style';

function applyDocumentFlag(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (enabled) root.removeAttribute('data-ai-off');
  else root.setAttribute('data-ai-off', '');
  if (!document.getElementById(HIDE_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = HIDE_STYLE_ID;
    style.textContent = 'html[data-ai-off] [data-ai-entry] { display: none !important; }';
    document.head.appendChild(style);
  }
}

function adopt(raw: unknown): void {
  const next = normalizeAiSetupStatus(raw);
  if (!next) return;
  status = next;
  applyDocumentFlag(next.enabled);
  emit();
}

/** Re-reads main's status. Coalesced: concurrent callers share one round trip. */
export function refreshAiSetup(): Promise<void> {
  const read = bridge()?.aiSetupStatus;
  if (typeof read !== 'function') return Promise.resolve();
  if (inFlight) return inFlight;
  // Through a resolved promise, so a bridge that answers synchronously (or with
  // nothing) cannot throw out of a render.
  inFlight = Promise.resolve()
    .then(() => read())
    .then((next) => adopt(next))
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Call after writing an engine, provider or key. Refreshes this window now and
 * tells every other window to refresh — main does not push those writes, since
 * they belong to the AI config's existing owner.
 */
export function notifyAiSetupChanged(): void {
  void refreshAiSetup();
  try {
    localStorage.setItem(BUMP_KEY, String(Date.now()));
  } catch {
    // Other windows still catch up on focus.
  }
}

export async function setAiFeaturesEnabled(enabled: boolean): Promise<void> {
  const write = bridge()?.aiSetupSetEnabled;
  if (typeof write !== 'function') return;
  adopt(await write(enabled));
}

function wire(): void {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  const api = bridge();
  api?.onAiSetupChanged?.((next) => adopt(next));
  api?.onAssetStatus?.((next) => {
    if (next.id !== DEFAULT_LOCAL_MODEL_ASSET_ID) return;
    if (next.state === 'installed' || next.state === 'not-installed') void refreshAiSetup();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === BUMP_KEY) void refreshAiSetup();
  });
  window.addEventListener('focus', () => void refreshAiSetup());
  onLocalAgentSettingsChanged(() => emit());
}

/**
 * Called once per window at startup (App, Blanc): wires the push and refresh
 * sources and applies the document flag before any AI button is looked at.
 */
export function startAiSetupSync(): void {
  wire();
  void refreshAiSetup();
}

/** The last status main gave, or `null` before the first answer. */
export function currentAiSetupStatus(): AiSetupStatus | null {
  return status;
}

export function currentAiReadiness(): AiReadiness & { loaded: boolean } {
  const agent = loadLocalAgentSettings();
  return {
    ...deriveAiReadiness(status ?? pendingAiSetupStatus(), agent),
    loaded: status !== null,
  };
}

/**
 * The readiness every AI surface renders from. `loaded` is false until main has
 * answered; a surface should render nothing AI-related until then rather than
 * flash a setup prompt at a user who is already set up.
 */
export function useAiReadiness(): AiReadiness & { loaded: boolean } {
  const [, setVersion] = useState(0);
  useEffect(() => {
    wire();
    const listener = (): void => setVersion((value) => value + 1);
    listeners.add(listener);
    if (!status) void refreshAiSetup();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return currentAiReadiness();
}

/** Same as `useAiReadiness`, plus the raw status for the Settings page. */
export function useAiSetupStatus(): AiSetupStatus | null {
  useAiReadiness();
  return status;
}

/**
 * Opens Settings > AI from any window.
 *
 * The navigation is also left in localStorage: when Settings opens as a new
 * pop-out it has no listener yet for the in-window event, and it reads this on
 * mount; a Settings window already open elsewhere hears it as a `storage` event.
 */
export function openAiSettings(settingId?: string): void {
  if (typeof window === 'undefined') return;
  const detail = { page: AI_SETTINGS_PAGE_ID, ...(settingId ? { settingId } : {}) };
  try {
    localStorage.setItem(PENDING_SETTINGS_NAV_KEY, JSON.stringify({ ...detail, at: Date.now() }));
  } catch {
    // The in-window route below still works.
  }
  openSectionSurface('settings');
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail }));
  }, 80);
}

/** How long a left-behind navigation stays valid: long enough for a pop-out to mount. */
const PENDING_NAV_TTL_MS = 15_000;

export function readPendingSettingsNavigationRaw(): string | null {
  try {
    return localStorage.getItem(PENDING_SETTINGS_NAV_KEY);
  } catch {
    return null;
  }
}

/** A fresh, well-formed pending navigation, or `null`. Only the AI page is ever left here. */
export function readPendingSettingsNavigation(
  raw: string | null,
  now: number = Date.now(),
): { page: string; settingId?: string } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { page?: unknown; settingId?: unknown; at?: unknown };
    if (value.page !== AI_SETTINGS_PAGE_ID) return null;
    if (typeof value.at !== 'number' || now - value.at > PENDING_NAV_TTL_MS || value.at > now + 1_000) return null;
    return {
      page: value.page,
      ...(typeof value.settingId === 'string' && /^ai-[a-z-]+$/.test(value.settingId) ? { settingId: value.settingId } : {}),
    };
  } catch {
    return null;
  }
}

export function clearPendingSettingsNavigation(): void {
  try {
    localStorage.removeItem(PENDING_SETTINGS_NAV_KEY);
  } catch {
    // Expires on its own.
  }
}

/** Test seam: forget the shared snapshot. */
export function resetAiSetupClientForTests(): void {
  status = null;
  inFlight = null;
  listeners.clear();
  wired = false;
}
