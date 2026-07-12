/**
 * Settings Advanced Mode — UI unlock only.
 * Background systems keep running whether advanced pages are visible or not.
 */

const KEY = 'jp-settings-advanced-v1';
const EVENT = 'jp-settings-advanced-changed';

export function loadSettingsAdvanced(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSettingsAdvanced(on: boolean): boolean {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  try {
    document.documentElement.classList.toggle('settings-advanced', on);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { on } }));
  } catch {
    /* ignore */
  }
  return on;
}

export function toggleSettingsAdvanced(): boolean {
  return setSettingsAdvanced(!loadSettingsAdvanced());
}

export function onSettingsAdvancedChanged(cb: (on: boolean) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<{ on?: boolean }>).detail;
    cb(typeof d?.on === 'boolean' ? d.on : loadSettingsAdvanced());
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Apply class on boot so CSS works before Settings mounts. */
export function applySettingsAdvancedClass(): void {
  try {
    document.documentElement.classList.toggle('settings-advanced', loadSettingsAdvanced());
  } catch {
    /* ignore */
  }
}
