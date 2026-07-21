import { t } from './i18n';

export type FocusTabId = 'library' | 'dictionary' | 'anki';
export type FocusLockMinutes = 0 | 5 | 15 | 25 | 45 | 60;

export interface FocusModeSettings {
  /** Cannot exit focus until this many minutes elapse after entering (0 = off). */
  lockMinutes: FocusLockMinutes;
  /** First tab when entering focus (unless restoreLastTab is on). */
  defaultTab: FocusTabId;
  /** Reopen the last focus tab instead of the default. */
  restoreLastTab: boolean;
  /** Hide the mini music bar in the focus header. */
  hideMusicBar: boolean;
  /** Compact header — icon-only tabs, tighter spacing. */
  minimalChrome: boolean;
  /** Start Study OS directly in focus mode on launch. */
  autoEnterOnLaunch: boolean;
}

const ACTIVE_KEY = 'jp-study-focus-mode-v1';
const SETTINGS_KEY = 'jp-study-focus-settings-v2';
const LOCK_UNTIL_KEY = 'jp-study-focus-lock-until-v1';
const LAST_TAB_KEY = 'jp-study-focus-last-tab-v1';

const EVENT = 'jp-focus-mode-changed';
const SETTINGS_EVENT = 'jp-focus-settings-changed';
const LOCK_EVENT = 'jp-focus-lock-changed';

const DEFAULTS: FocusModeSettings = {
  lockMinutes: 0,
  defaultTab: 'library',
  restoreLastTab: true,
  hideMusicBar: false,
  minimalChrome: false,
  autoEnterOnLaunch: false,
};

const LOCK_OPTIONS: FocusLockMinutes[] = [0, 5, 15, 25, 45, 60];

function parseLockMinutes(v: unknown): FocusLockMinutes {
  const n = Number(v);
  return LOCK_OPTIONS.includes(n as FocusLockMinutes) ? (n as FocusLockMinutes) : 0;
}

function parseTab(v: unknown): FocusTabId {
  return v === 'dictionary' || v === 'anki' ? v : 'library';
}

export function loadFocusSettings(): FocusModeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<FocusModeSettings>;
    return {
      lockMinutes: parseLockMinutes(p.lockMinutes),
      defaultTab: parseTab(p.defaultTab),
      restoreLastTab: p.restoreLastTab !== false,
      hideMusicBar: p.hideMusicBar === true,
      minimalChrome: p.minimalChrome === true,
      autoEnterOnLaunch: p.autoEnterOnLaunch === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFocusSettings(patch: Partial<FocusModeSettings>): FocusModeSettings {
  const next = { ...loadFocusSettings(), ...patch };
  next.lockMinutes = parseLockMinutes(next.lockMinutes);
  next.defaultTab = parseTab(next.defaultTab);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
  return next;
}

export function focusLockOptions(): { minutes: FocusLockMinutes; labelKey: string }[] {
  return [
    { minutes: 0, labelKey: 'focus.lock.off' },
    { minutes: 5, labelKey: 'focus.lock.5' },
    { minutes: 15, labelKey: 'focus.lock.15' },
    { minutes: 25, labelKey: 'focus.lock.25' },
    { minutes: 45, labelKey: 'focus.lock.45' },
    { minutes: 60, labelKey: 'focus.lock.60' },
  ];
}

export function loadFocusMode(): boolean {
  try {
    return localStorage.getItem(ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isFocusMode(): boolean {
  return loadFocusMode();
}

function readLockUntil(): number {
  try {
    const raw = sessionStorage.getItem(LOCK_UNTIL_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLockUntil(until: number): void {
  try {
    if (until > Date.now()) sessionStorage.setItem(LOCK_UNTIL_KEY, String(until));
    else sessionStorage.removeItem(LOCK_UNTIL_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(LOCK_EVENT));
}

export function getFocusLockUntil(): number {
  const until = readLockUntil();
  return until > Date.now() ? until : 0;
}

export function isFocusLocked(): boolean {
  return getFocusLockUntil() > Date.now();
}

export function getFocusLockRemainingMs(): number {
  const until = getFocusLockUntil();
  return until > 0 ? Math.max(0, until - Date.now()) : 0;
}

function armFocusLock(): void {
  const { lockMinutes } = loadFocusSettings();
  if (lockMinutes <= 0) {
    writeLockUntil(0);
    return;
  }
  writeLockUntil(Date.now() + lockMinutes * 60_000);
}

function clearFocusLock(): void {
  writeLockUntil(0);
}

function toastFocusLocked(): void {
  const ms = getFocusLockRemainingMs();
  const min = Math.max(1, Math.ceil(ms / 60_000));
  window.dispatchEvent(
    new CustomEvent('os:toast', {
      detail: {
        message: t('focus.lock.toast', { min }),
        kind: 'muted',
      },
    }),
  );
}

export function loadFocusLastTab(): FocusTabId {
  try {
    const raw = sessionStorage.getItem(LAST_TAB_KEY);
    return parseTab(raw);
  } catch {
    return 'library';
  }
}

export function saveFocusLastTab(tab: FocusTabId): void {
  try {
    sessionStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function getInitialFocusTab(): FocusTabId {
  const s = loadFocusSettings();
  if (s.restoreLastTab) return loadFocusLastTab();
  return s.defaultTab;
}

export function setFocusMode(on: boolean): boolean {
  const wasOn = loadFocusMode();
  if (!on && wasOn && isFocusLocked()) {
    toastFocusLocked();
    return true;
  }

  try {
    localStorage.setItem(ACTIVE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }

  if (on && !wasOn) {
    armFocusLock();
    try {
      void window.api?.companionHostSetEnabled?.(false);
    } catch {
      /* ignore */
    }
  }

  if (!on) {
    clearFocusLock();
  }

  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { on } }));
  } catch {
    /* ignore */
  }
  return on;
}

export function disableFocusModeForShellSwitch(): void {
  try {
    localStorage.setItem(ACTIVE_KEY, '0');
  } catch {
    /* ignore */
  }
  clearFocusLock();
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { on: false } }));
  } catch {
    /* ignore */
  }
}

export function toggleFocusMode(): boolean {
  if (loadFocusMode() && isFocusLocked()) {
    toastFocusLocked();
    return true;
  }
  return setFocusMode(!loadFocusMode());
}

export function onFocusModeChanged(cb: (on: boolean) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<{ on?: boolean }>).detail;
    cb(typeof d?.on === 'boolean' ? d.on : loadFocusMode());
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function onFocusSettingsChanged(cb: (s: FocusModeSettings) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<FocusModeSettings>).detail ?? loadFocusSettings());
  window.addEventListener(SETTINGS_EVENT, h);
  return () => window.removeEventListener(SETTINGS_EVENT, h);
}

export function onFocusLockChanged(cb: () => void): () => void {
  window.addEventListener(LOCK_EVENT, cb);
  return () => window.removeEventListener(LOCK_EVENT, cb);
}

/** Call once after boot if auto-enter is enabled. */
export function bootFocusModeIfNeeded(opts?: { skip?: boolean }): void {
  if (opts?.skip) return;
  if (!loadFocusSettings().autoEnterOnLaunch) return;
  if (loadFocusMode()) return;
  setFocusMode(true);
}
