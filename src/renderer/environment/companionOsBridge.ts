/**
 * Bridges in-app companion state to the transparent OS host window (L4).
 * Call from the main desktop renderer when living-layer companions are on.
 */
import { loadEnvironment, onEnvironmentChanged } from './environmentStore';
import type { CompanionInstance } from './companionCatalog';
import { loadDesktopPrefs, onDesktopPrefsChanged } from '../desktopPrefs';

let unsubEnv: (() => void) | null = null;
let unsubDesk: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let directPushTimer: ReturnType<typeof setTimeout> | null = null;
let lastEnabled: boolean | null = null;
let lastSpan: 'primary' | 'all' | null = null;
let pendingCompanions: CompanionInstance[] | null = null;

function deskMetrics(): { deskW: number; deskH: number } {
  // Prefer live desktop element; fall back to viewport under taskbar.
  const desk = document.querySelector('.os-desktop') as HTMLElement | null;
  if (desk) {
    return {
      deskW: Math.max(1, desk.clientWidth),
      deskH: Math.max(1, desk.clientHeight),
    };
  }
  return {
    deskW: Math.max(1, window.innerWidth || 1200),
    deskH: Math.max(1, (window.innerHeight || 800) - 48),
  };
}

function push(companions: CompanionInstance[], enabled: boolean, activeness: number): void {
  const { deskW, deskH } = deskMetrics();
  window.api.companionHostPushState({ companions, enabled, deskW, deskH, activeness });
}

function apply(env = loadEnvironment()): void {
  const want = env.enabled && env.companionsEnabled && env.companionsOnOsDesktop;
  const span = loadDesktopPrefs().companionHostDisplays ?? 'primary';
  if (want !== lastEnabled) {
    lastEnabled = want;
    lastSpan = span;
    void window.api.companionHostSetEnabled(want, span);
  } else if (want && span !== lastSpan) {
    lastSpan = span;
    void window.api.companionHostSetSpan(span);
  }
  if (want) {
    const list = (env.companions ?? []).filter(
      (c) => !env.companionTypes?.length || env.companionTypes.includes(c.typeId),
    );
    push(list, true, env.companionActiveness ?? 0.4);
  }
}

let resizeHandler: (() => void) | null = null;

export function startCompanionOsBridge(): void {
  stopCompanionOsBridge();
  apply();
  unsubEnv = onEnvironmentChanged((env) => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => apply(env), 120);
  });
  unsubDesk = onDesktopPrefsChanged(() => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => apply(), 120);
  });
  // Desk size changes → remap host pet positions
  resizeHandler = () => {
    if (!lastEnabled) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => apply(), 200);
  };
  window.addEventListener('resize', resizeHandler);
}

export function stopCompanionOsBridge(): void {
  if (unsubEnv) {
    unsubEnv();
    unsubEnv = null;
  }
  if (unsubDesk) {
    unsubDesk();
    unsubDesk = null;
  }
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (directPushTimer) {
    clearTimeout(directPushTimer);
    directPushTimer = null;
  }
  pendingCompanions = null;
  if (lastEnabled) {
    void window.api.companionHostSetEnabled(false);
    lastEnabled = false;
    lastSpan = null;
  }
}

/** Push latest companion instances immediately (e.g. after position persist). */
export function pushCompanionOsState(companions: CompanionInstance[]): void {
  const env = loadEnvironment();
  if (env.enabled && env.companionsEnabled && env.companionsOnOsDesktop) {
    pendingCompanions = companions;
    if (directPushTimer) return;
    directPushTimer = setTimeout(() => {
      directPushTimer = null;
      const next = pendingCompanions;
      pendingCompanions = null;
      if (next) push(next, true, loadEnvironment().companionActiveness ?? 0.4);
    }, 250);
  }
}
