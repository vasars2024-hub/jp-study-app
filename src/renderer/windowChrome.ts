/**
 * Native window chrome — synced with main via userData/window-chrome.json.
 * Modes: standard (OS title bar), borderless (in-app title bar), frameless (none).
 */

import { useEffect, useState } from 'react';

export type WindowChromeMode = 'standard' | 'borderless' | 'frameless';

const EVENT = 'jp-os-window-chrome-changed';

export function parseWindowChromeMode(v: unknown): WindowChromeMode {
  if (v === 'borderless' || v === 'frameless') return v;
  return 'standard';
}

export function applyWindowChromeMode(mode: WindowChromeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('os-borderless', mode === 'borderless');
  root.classList.toggle('os-frameless', mode === 'frameless');
  root.dataset.windowChrome = mode;
}

export function notifyWindowChromeChanged(mode: WindowChromeMode): void {
  applyWindowChromeMode(mode);
  window.dispatchEvent(new CustomEvent<WindowChromeMode>(EVENT, { detail: mode }));
}

export function onWindowChromeChanged(cb: (mode: WindowChromeMode) => void): () => void {
  const h = (e: Event) => cb(parseWindowChromeMode((e as CustomEvent<WindowChromeMode>).detail));
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Sync renderer with main — recreates the window when modes differ. */
export async function bootWindowChrome(modeFromPrefs: WindowChromeMode): Promise<WindowChromeMode> {
  let mode = parseWindowChromeMode(modeFromPrefs);
  try {
    const fromMain = parseWindowChromeMode(await window.api.getWindowChromeMode());
    if (fromMain !== mode) {
      mode = parseWindowChromeMode(await window.api.setWindowChromeMode(modeFromPrefs));
    } else {
      mode = fromMain;
    }
  } catch {
    /* non-Electron test env */
  }
  applyWindowChromeMode(mode);
  return mode;
}

export async function setWindowChromeMode(mode: WindowChromeMode): Promise<void> {
  const next = parseWindowChromeMode(mode);
  try {
    await window.api.setWindowChromeMode(next);
  } catch {
    /* ignore */
  }
  notifyWindowChromeChanged(next);
}

export function useWindowChromeMode(): WindowChromeMode {
  const [mode, setMode] = useState<WindowChromeMode>(() => {
    if (typeof document === 'undefined') return 'standard';
    return parseWindowChromeMode(document.documentElement.dataset.windowChrome);
  });
  useEffect(() => onWindowChromeChanged(setMode), []);
  return mode;
}

/** @deprecated use useWindowChromeMode */
export function useWindowBorderless(): boolean {
  return useWindowChromeMode() === 'borderless';
}
